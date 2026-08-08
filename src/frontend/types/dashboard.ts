/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regímenes de mercado diagnosticados heurísticamente.
 */
export type MarketRegime = 'BULL_TREND' | 'BEAR_TREND' | 'MEAN_REVERTING' | 'HIGH_VOLATILITY_CRASH';

/**
 * Representación del estado de salud del servidor y base de datos.
 */
export interface TelemetryStatusResponse {
  readonly timestamp: number;
  readonly dbPoolHealthy: boolean;
  readonly uptime: number;
  readonly nodeVersion: string;
}

/**
 * Representación instantánea de los datos del Blackboard en memoria.
 */
export interface BlackboardStateResponse {
  readonly timestamp: number;
  readonly slots: Record<string, any>;
}

/**
 * Diagnóstico activo del régimen de mercado y optimización paramétrica.
 */
export interface MarketRegimeResponse {
  readonly timestamp: number;
  readonly market_regime: MarketRegime;
  readonly classification_rationale: string;
  readonly current_weights: Record<string, number>;
  readonly current_kelly_fraction: number;
  readonly current_atr_multipliers: {
    readonly stop_loss: number;
    readonly take_profit: number;
  };
  readonly min_confidence_threshold: number;
  readonly suspension_flag: boolean;
}

/**
 * Registro individual del histórico de aprendizaje de la base de datos.
 */
export interface LearningPerformanceRecord {
  readonly id: number;
  readonly symbol: string;
  readonly agentName: string;
  readonly parameterKey: string;
  readonly parameterValue: string;
  readonly performanceMetric: string;
  readonly metricValue: string;
  readonly createdAt: string;
}

/**
 * Respuesta paginada histórica de calibración de parámetros.
 */
export interface LearningHistoryResponse {
  readonly timestamp: number;
  readonly data: readonly LearningPerformanceRecord[];
  readonly pagination: {
    readonly limit: number;
    readonly offset: number;
  };
}

/**
 * Reporte de analítica financiera y métricas de rendimiento ajustadas al riesgo.
 */
export interface PerformanceReportResponse {
  readonly sharpe_ratio: number;
  readonly sortino_ratio: number;
  readonly profit_factor: number;
  readonly win_rate: number;
  readonly max_drawdown_percentage: number;
  readonly total_trades: number;
  readonly net_profit_usd: number;
  readonly total_profit_usd: number;
  readonly total_loss_usd: number;
  readonly average_win_usd: number;
  readonly average_loss_usd: number;
  readonly timestamp: number;
}
