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
 * and persistent logging for institutional-grade reliability.
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
    marketTick: MarketStateSnapshot
  ): Promise<void> {
    const key = `${symbol.toUpperCase()}:${timeframe.toLowerCase()}`;

    // Prevent race conditions and concurrent overlaps of the same trading asset/timeframe pipeline
    if (this.activeWorkflows.has(key)) {
      console.warn(`Orchestration workflow already active for ${key}. Skipping duplicate trigger.`);
      return;
    }

    this.activeWorkflows.add(key);
    const startTime = Date.now();

    try {
      await this.logAudit('INFO', 'Orchestrator', `Triggering multi-agent trade cycle for ${symbol} (${timeframe})`, {
        symbol,
        timeframe,
        marketTick,
      });

      // 1. Publish raw market data to Blackboard
      this.blackboard.writeMarketData(symbol, timeframe, marketTick);

      // Separate fast and slow loop agents
      const fastAgents: BaseAgent[] = [];
      const slowAgents: BaseAgent[] = [];

      for (const agent of this.agents.values()) {
        if (agent.name === 'Supervisor') continue; // Supervisor runs at the end of the loop
        
        if (agent.isFastLoop) {
          fastAgents.push(agent);
        } else {
          slowAgents.push(agent);
        }
      }

      // 2. Execute Fast-Loop Quantitative Agents in Parallel
      await this.logAudit('DEBUG', 'Orchestrator', `Executing Fast-Loop quantitative pipeline (${fastAgents.length} agents)...`);
      await Promise.all(fastAgents.map(agent => agent.execute(symbol, timeframe)));

      // 3. Execute Slow-Loop Cognitive Agents with strict timeout
      await this.logAudit('DEBUG', 'Orchestrator', `Executing Slow-Loop cognitive pipeline (${slowAgents.length} agents)...`);
      await this.executeSlowLoopWithTimeout(slowAgents, symbol, timeframe);

      // 4. Fire Supervisor Agent
      const supervisor = this.agents.get('Supervisor');
      if (supervisor) {
        await this.logAudit('INFO', 'Orchestrator', 'Triggering Supervisor Agent for consensus and trade evaluation...');
        await supervisor.execute(symbol, timeframe);
      } else {
        await this.logAudit('WARN', 'Orchestrator', 'Supervisor Agent is not registered. Cycle completed without decision scoring.');
      }

      const duration = Date.now() - startTime;
      await this.logAudit('INFO', 'Orchestrator', `Multi-agent trade cycle completed for ${symbol} in ${duration}ms.`);
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
    timeframe: string
  ): Promise<void> {
    if (agents.length === 0) return;

    // We execute all agents as independent promises
    const agentPromises = agents.map(async (agent) => {
      const agentStart = Date.now();
      try {
        await agent.execute(symbol, timeframe);
      } catch (err) {
        console.error(`Uncaught error in slow agent ${agent.name}:`, err);
      }
    });

    // We race the parallel execution against our configured slow-loop timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Slow-Loop agent pipeline exceeded threshold of ${this.slowLoopTimeout}ms.`));
      }, this.slowLoopTimeout);
    });

    try {
      await Promise.race([
        Promise.all(agentPromises),
        timeoutPromise,
      ]);
    } catch (error) {
      await this.logAudit(
        'WARN',
        'Orchestrator',
        `Slow-Loop warning or partial timeout: ${error instanceof Error ? error.message : String(error)}. Downstream logic will evaluate with available data.`
      );
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
      // Fallback safely to console to avoid cascade crash during database disconnection
      console.error(`[DATABASE LOG ERROR] Failed writing audit log to Cloud SQL:`, dbError);
      console.log(`[${level}] [${agentName}] ${message}`);
    }
  }

  /**
   * Sets custom Slow-Loop API timeout thresholds (e.g. for high-latency market hours).
   */
  public setSlowLoopTimeout(timeoutMs: number): void {
    this.slowLoopTimeout = timeoutMs;
  }
}
