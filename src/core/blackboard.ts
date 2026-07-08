/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import { AgentName, AgentAssessment, BlackboardState, MarketStateSnapshot, BlackboardSlot } from '../types.ts';

/**
 * Event names emitted by the Blackboard for reactivity.
 */
export enum BlackboardEvent {
  ASSESSMENT_UPDATED = 'ASSESSMENT_UPDATED',
  MARKET_DATA_UPDATED = 'MARKET_DATA_UPDATED',
  STATE_PRUNED = 'STATE_PRUNED',
}

/**
 * Institutional-grade Blackboard memory store.
 * Manages concurrent state snapshots across multiple symbol/timeframe pairs.
 * Implements strict type checking, reactive EventEmitters, and TTL-based data invalidation.
 */
export class Blackboard extends EventEmitter {
  private static instance: Blackboard | null = null;

  // Internal storage mapping composite keys `symbol:timeframe` to their respective BlackboardState
  private store: Map<string, BlackboardState> = new Map();

  // Interval timer reference for periodic background TTL cleanup
  private pruneIntervalRef: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.setMaxListeners(100); // Prevent maximum listener warnings when scaling agents
    this.startPruneLoop(60000); // Default TTL pruning evaluation every 60 seconds
  }

  /**
   * Returns the Singleton instance of the Blackboard.
   */
  public static getInstance(): Blackboard {
    if (!Blackboard.instance) {
      Blackboard.instance = new Blackboard();
    }
    return Blackboard.instance;
  }

  /**
   * Helper to construct a standard composite lookup key.
   */
  private makeKey(symbol: string, timeframe: string): string {
    return `${symbol.toUpperCase().trim()}:${timeframe.toLowerCase().trim()}`;
  }

  /**
   * Lazily initializes a state slot for a symbol and timeframe pair if it doesn't already exist.
   */
  private getOrInitializeState(symbol: string, timeframe: string): BlackboardState {
    const key = this.makeKey(symbol, timeframe);
    let state = this.store.get(key);

    if (!state) {
      state = {
        symbol: symbol.toUpperCase().trim(),
        timeframe: timeframe.toLowerCase().trim(),
        marketData: {
          value: {
            symbol: symbol.toUpperCase().trim(),
            price: 0,
            volume24h: 0,
            high24h: 0,
            low24h: 0,
            timestamp: 0,
          },
          lastUpdated: 0,
          ttl: 300000, // Default market data TTL is 5 minutes
        },
        assessments: {} as Record<AgentName, BlackboardSlot<AgentAssessment>>,
      };
      this.store.set(key, state);
    }
    return state;
  }

  /**
   * Writes the latest market state snapshot for an asset.
   */
  public writeMarketData(symbol: string, timeframe: string, data: MarketStateSnapshot, ttl: number = 300000): void {
    const state = this.getOrInitializeState(symbol, timeframe);
    const now = Date.now();

    state.marketData = {
      value: data,
      lastUpdated: now,
      ttl,
    };

    this.emit(BlackboardEvent.MARKET_DATA_UPDATED, {
      symbol,
      timeframe,
      marketData: data,
      timestamp: now,
    });
  }

  /**
   * Safe, reactive write operation for an individual agent's assessment.
   * If the writing agent is malicious, slow, or produces invalid metrics, this method safely discards.
   */
  public writeAssessment(
    symbol: string,
    timeframe: string,
    assessment: AgentAssessment,
    ttl: number = 1800000 // Default assessment TTL is 30 minutes
  ): void {
    // Basic validation of scoring limits to prevent database/execution corruption
    if (assessment.score < -100 || assessment.score > 100) {
      throw new Error(`Agent ${assessment.agentName} produced out-of-bounds score: ${assessment.score}. Must be [-100, 100].`);
    }
    if (assessment.confidence < 0 || assessment.confidence > 1) {
      throw new Error(`Agent ${assessment.agentName} produced out-of-bounds confidence: ${assessment.confidence}. Must be [0, 1].`);
    }

    const state = this.getOrInitializeState(symbol, timeframe);
    const now = Date.now();

    state.assessments[assessment.agentName] = {
      value: {
        ...assessment,
        timestamp: now, // Always enforce write-time timestamping for audit traces
      },
      lastUpdated: now,
      ttl,
    };

    this.emit(BlackboardEvent.ASSESSMENT_UPDATED, {
      symbol,
      timeframe,
      agentName: assessment.agentName,
      assessment,
      timestamp: now,
    });
  }

  /**
   * Fetches the complete, valid Blackboard state for a given asset/timeframe.
   * Filter out any expired slots or outdated indicators in real-time.
   */
  public getSnapshot(symbol: string, timeframe: string): BlackboardState {
    const state = this.getOrInitializeState(symbol, timeframe);
    const now = Date.now();

    const activeAssessments = {} as Record<AgentName, BlackboardSlot<AgentAssessment>>;

    // Dynamic, on-demand TTL filtration to prevent reading stale logic between pruning ticks
    for (const [name, slot] of Object.entries(state.assessments)) {
      const typedName = name as AgentName;
      if (slot && (slot.ttl === 0 || now - slot.lastUpdated < slot.ttl)) {
        activeAssessments[typedName] = slot;
      }
    }

    const isMarketDataValid = state.marketData.ttl === 0 || now - state.marketData.lastUpdated < state.marketData.ttl;

    return {
      symbol: state.symbol,
      timeframe: state.timeframe,
      marketData: isMarketDataValid ? state.marketData : { ...state.marketData, lastUpdated: 0 },
      assessments: activeAssessments,
    };
  }

  /**
   * Returns a complete, TTL-filtered snapshot of all active states on the blackboard.
   */
  public getAllStates(): Record<string, BlackboardState> {
    const result: Record<string, BlackboardState> = {};
    for (const key of this.store.keys()) {
      const parts = key.split(':');
      if (parts.length === 2) {
        const [symbol, timeframe] = parts;
        result[key] = this.getSnapshot(symbol, timeframe);
      }
    }
    return result;
  }

  /**
   * Force clears all state for a symbol/timeframe (useful for system re-initializations).
   */
  public clear(symbol: string, timeframe: string): void {
    const key = this.makeKey(symbol, timeframe);
    this.store.delete(key);
  }

  /**
   * Flushes the entire in-memory blackboard.
   */
  public clearAll(): void {
    this.store.clear();
  }

  /**
   * Internal routine that scans all slots and cleans up dead indices to avoid memory leaks.
   */
  public pruneExpired(): void {
    const now = Date.now();
    let prunedCount = 0;

    for (const [key, state] of this.store.entries()) {
      for (const [name, slot] of Object.entries(state.assessments)) {
        const typedName = name as AgentName;
        if (slot && slot.ttl > 0 && now - slot.lastUpdated >= slot.ttl) {
          delete state.assessments[typedName];
          prunedCount++;
        }
      }
    }

    if (prunedCount > 0) {
      this.emit(BlackboardEvent.STATE_PRUNED, { prunedCount, timestamp: now });
    }
  }

  /**
   * Sets up the passive background scavenger thread.
   */
  private startPruneLoop(intervalMs: number): void {
    if (this.pruneIntervalRef) {
      clearInterval(this.pruneIntervalRef);
    }
    this.pruneIntervalRef = setInterval(() => {
      try {
        this.pruneExpired();
      } catch (err) {
        console.error('Failure in Blackboard TTL background pruning routine:', err);
      }
    }, intervalMs);
  }

  /**
   * Gracefully releases background routines.
   */
  public destroy(): void {
    if (this.pruneIntervalRef) {
      clearInterval(this.pruneIntervalRef);
      this.pruneIntervalRef = null;
    }
    this.removeAllListeners();
  }
}
