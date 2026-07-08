/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentName } from '../types.ts';
import { Blackboard } from '../core/blackboard.ts';

/**
 * Contract specifying core agent execution behaviors.
 * All quantitative and LLM-assisted cognitive agents extend this abstraction.
 */
export abstract class BaseAgent {
  public abstract readonly name: AgentName;
  public abstract readonly isFastLoop: boolean; // Determines if the agent runs in Fast-Loop or Slow-Loop

  protected blackboard: Blackboard;

  constructor() {
    this.blackboard = Blackboard.getInstance();
  }

  /**
   * Executes the internal analytical reasoning engine of the agent.
   * Reads state from the Blackboard, runs algorithms or LLM instructions,
   * and commits structured JSON results back to the Blackboard.
   */
  public abstract analyze(symbol: string, timeframe: string): Promise<void>;

  /**
   * Safe execution wrapper that handles isolated error recovery and writes logs.
   */
  public async execute(symbol: string, timeframe: string): Promise<void> {
    const startTime = Date.now();
    try {
      await this.analyze(symbol, timeframe);
    } catch (error) {
      console.error(`Agent [${this.name}] failed executing for ${symbol} on ${timeframe}:`, error);
      
      // Write error state directly to blackboard to notify downstream supervisor of degradation
      this.blackboard.writeAssessment(symbol, timeframe, {
        agentName: this.name,
        timestamp: startTime,
        score: 0, // Neutral output due to failure
        confidence: 0, // Zero confidence
        data: { error: error instanceof Error ? error.message : String(error) },
        justification: `Critical execution failure: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
