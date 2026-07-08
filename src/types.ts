/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// Core Agent Definitions
// ============================================================================

export type AgentName =
  | 'TechnicalAnalyst'
  | 'News'
  | 'Sentiment'
  | 'OnChain'
  | 'OrderFlow'
  | 'Correlation'
  | 'Backtesting'
  | 'RiskManager'
  | 'Divergence'
  | 'Liquidation'
  | 'Supervisor'
  | 'Execution'
  | 'Learning'
  | 'Audit'
  | 'Notification';

export type MarketDirection = 'BUY' | 'SELL' | 'HOLD' | 'CLOSE';

export interface AgentAssessment {
  agentName: AgentName;
  timestamp: number; // Unix timestamp in ms
  score: number; // Standardized score from -100 (extremely bearish) to +100 (extremely bullish)
  confidence: number; // 0.0 to 1.0 representing certainty
  data: Record<string, any>; // Supporting indicators, extracted textual features, etc.
  justification: string; // Brief reasoning for audit logs and LLM correlation
}

// ============================================================================
// Blackboard State Structure
// ============================================================================

export interface BlackboardSlot<T> {
  value: T;
  lastUpdated: number;
  ttl: number; // Time-to-Live in milliseconds. 0 means persistent (infinite).
}

export interface MarketStateSnapshot {
  symbol: string;
  price: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface BlackboardState {
  symbol: string;
  timeframe: string; // e.g. "15m", "1h", "4h", "1D"
  marketData: BlackboardSlot<MarketStateSnapshot>;
  assessments: Record<AgentName, BlackboardSlot<AgentAssessment>>;
}

// ============================================================================
// Supervisor & Orchestration Definitions
// ============================================================================

export interface SupervisorDecision {
  symbol: string;
  timeframe: string;
  direction: MarketDirection;
  score: number; // Final weighted score (-100 to 100)
  justification: string;
  agentAssessments: Record<string, { score: number; weight: number; confidence: number }>;
  timestamp: number;
}

export type DecisionStatus = 'PENDING_RISK' | 'APPROVED' | 'REJECTED_BY_RISK' | 'EXECUTED' | 'FAILED';

export interface DBSupervisorDecisionRecord extends SupervisorDecision {
  id?: number;
  status: DecisionStatus;
}

// ============================================================================
// Financial & Order Definitions
// ============================================================================

export interface OrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number; // Required for limit orders
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  timestamp: number;
  rawResponse?: any;
}

export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  unrealizedPnl: number;
  unrealizedPnlPercentage: number;
}

// ============================================================================
// Configuración de API de Seguridad (Fase 15 / ATLAS AI TRADING)
// ============================================================================

export interface ApiConfigState {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  modoReal: boolean; // false = MODO SIMULACIÓN (SANDBOX LOCAL), true = MODO OPERATIVO REAL (FUTUROS EN VIVO)
}

