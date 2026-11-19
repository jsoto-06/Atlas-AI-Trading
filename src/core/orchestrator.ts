/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Blackboard } from './blackboard.ts';
import { BaseAgent } from '../agents/base-agent.ts';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { MarketStateSnapshot } from '../types.ts';

/**
 * Orchestrator Engine managing multi-agent execution pipelines.
 * Enforces clean decoupling, concurrency limits, execution timeouts,
 * cycleId isolation, and persistent logging for institutional-grade reliability.
 */
export class Orchestrator {
  private static instance: Orchestrator | null = null;
  private blackboard: Blackboard;
  private agents: Map<string, BaseAgent> = new Map();
  private activeWorkflows: Set<string> = new Set(); // Tracks running workflows: `${symbol}:${timeframe}`

  // Timeout limit in milliseconds for Slow-Loop cognitive agents (Gemini API, scrapers)
  private slowLoopTimeout: number = 25000;

  private constructor() {
    this.blackboard = Blackboard.getInstance();
  }

  public static getInstance(): Orchestrator {
    if (!Orchestrator.instance) {
      Orchestrator.instance = new Orchestrator();
    }
    return Orchestrator.instance;
  }

  /**
   * Registers an agent to the system pipeline.
   */
  public registerAgent(agent: BaseAgent): void {
    if (this.agents.has(agent.name)) {
      console.warn(`Overwriting previously registered agent: ${agent.name}`);
    }
    this.agents.set(agent.name, agent);
    console.log(`Agent [${agent.name}] registered successfully inside Orchestrator. Loop: ${agent.isFastLoop ? 'Fast' : 'Slow'}`);
  }

  /**
   * Helper to verify if a workflow is currently running for an asset.
   */
  public isWorkflowActive(symbol: string, timeframe: string): boolean {
    return this.activeWorkflows.has(`${symbol.toUpperCase()}:${timeframe.toLowerCase()}`);
  }

  /**
   * Main entry point to dispatch a multi-agent evaluation workflow.
   */
  public async triggerWorkflow(
    symbol: string,
    timeframe: string,
    marketTick: MarketStateSnapshot,
    cycleId?: string
  ): Promise<void> {
    const key = `${symbol.toUpperCase()}:${timeframe.toLowerCase()}`;
    const activeCycleId = cycleId || `cycle_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Prevent race conditions and concurrent overlaps of the same trading asset/timeframe pipeline
    if (this.activeWorkflows.has(key)) {
      console.warn(`Orchestration workflow already active for ${key}. Skipping duplicate trigger.`);
      return;
    }

    this.activeWorkflows.add(key);
    const startTime = Date.now();

    // Establecer el cycleId activo en el Blackboard para invalidar escrituras tardías de ciclos anteriores
    this.blackboard.setActiveCycle(symbol, timeframe, activeCycleId);

    try {
      await this.logAudit('INFO', 'Orchestrator', `Triggering multi-agent trade cycle for ${symbol} (${timeframe}) [cycleId: ${activeCycleId}]`, {
        symbol,
        timeframe,
        cycleId: activeCycleId,
        marketTick,
      });

      // 1. Publish raw market data to Blackboard
      this.blackboard.writeMarketData(symbol, timeframe, marketTick, 300000, 30000);

      // Separate fast and slow loop agents (RiskManager and Supervisor run in sequence at the end)
      const fastAgents: BaseAgent[] = [];
      const slowAgents: BaseAgent[] = [];

      for (const agent of this.agents.values()) {
        if (agent.name === 'Supervisor' || agent.name === 'RiskManager') continue;
        
        if (agent.isFastLoop) {
          fastAgents.push(agent);
        } else {
          slowAgents.push(agent);
        }
      }

      // 2. Execute Fast-Loop Quantitative Analysts in Parallel
      await this.logAudit('DEBUG', 'Orchestrator', `Executing Fast-Loop quantitative pipeline (${fastAgents.length} agents)...`);
      await Promise.all(fastAgents.map(agent => agent.execute(symbol, timeframe, activeCycleId)));

      // 3. Execute Slow-Loop Cognitive Analysts with strict timeout & AbortSignal propagation
      await this.logAudit('DEBUG', 'Orchestrator', `Executing Slow-Loop cognitive pipeline (${slowAgents.length} agents)...`);
      await this.executeSlowLoopWithTimeout(slowAgents, symbol, timeframe, activeCycleId);

      // 4. Fire Supervisor Agent (Consensus Engine)
      const supervisor = this.agents.get('Supervisor');
      if (supervisor) {
        await this.logAudit('INFO', 'Orchestrator', 'Triggering Supervisor Agent for consensus and trade evaluation...');
        await supervisor.execute(symbol, timeframe, activeCycleId);
      } else {
        await this.logAudit('WARN', 'Orchestrator', 'Supervisor Agent is not registered. Cycle completed without decision scoring.');
      }

      // 5. Fire RiskManager Agent (Final Financial Firewall & Sizing based on Supervisor Decision)
      const riskManager = this.agents.get('RiskManager');
      if (riskManager) {
        await this.logAudit('INFO', 'Orchestrator', 'Triggering RiskManager firewall to validate consensus decision...');
        await riskManager.execute(symbol, timeframe, activeCycleId);
      }

      const duration = Date.now() - startTime;
      await this.logAudit('INFO', 'Orchestrator', `Multi-agent trade cycle completed for ${symbol} in ${duration}ms [cycleId: ${activeCycleId}].`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.logAudit('ERROR', 'Orchestrator', `Fatal error during trade cycle execution for ${symbol}: ${errorMessage}`, {
        error: error instanceof Error ? error.stack : error,
      });
    } finally {
      this.activeWorkflows.delete(key);
    }
  }

  /**
   * Executes the Slow-Loop cognitive agents concurrently. If any agent takes too long,
   * the loop terminates early to keep the system responsive and prevent network bottlenecks.
   */
  private async executeSlowLoopWithTimeout(
    agents: BaseAgent[],
    symbol: string,
    timeframe: string,
    cycleId: string
  ): Promise<void> {
    if (agents.length === 0) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.slowLoopTimeout);

    try {
      const agentPromises = agents.map(async (agent) => {
        if (controller.signal.aborted) return;
        try {
          await agent.execute(symbol, timeframe, cycleId, controller.signal);
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error(`Uncaught error in slow agent ${agent.name}:`, err);
          }
        }
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Slow-Loop agent pipeline exceeded threshold of ${this.slowLoopTimeout}ms for cycle ${cycleId}.`));
        });
      });

      await Promise.race([
        Promise.all(agentPromises),
        timeoutPromise,
      ]);
    } catch (error) {
      await this.logAudit(
        'WARN',
        'Orchestrator',
        `Slow-Loop warning or partial timeout for cycle ${cycleId}: ${error instanceof Error ? error.message : String(error)}. Downstream logic will evaluate with available data.`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Helper to write structured logs directly to Cloud SQL Database via Drizzle ORM.
   */
  private async logAudit(
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
    agentName: string,
    message: string,
    payload: any = null
  ): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        level,
        agentName,
        message,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
      });
    } catch (dbError) {
      console.log(`[${level}] [${agentName}] ${message}`);
    }
  }
}
