/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlackboardState } from '../types.ts';
import { PerformanceReport } from '../analytics/types.ts';
import { MarketRegime, AdaptationProposal } from '../analytics/adaptive/types.ts';

/**
 * Respuesta del estado de salud y telemetría general del servidor.
 */
export interface TelemetryStatusResponse {
  readonly timestamp: number;
  readonly dbPoolHealthy: boolean;
  readonly uptime: number; // en segundos
  readonly nodeVersion: string;
}

/**
 * Respuesta del estado actual del Blackboard en memoria.
 */
export interface BlackboardStateResponse {
  readonly timestamp: number;
  readonly slots: Record<string, BlackboardState>;
}

/**
 * Respuesta del régimen de mercado actual detectado por el motor adaptativo.
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
 * Registro de rendimiento adaptativo en base de datos.
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
 * Respuesta paginada de la telemetría del histórico de aprendizaje.
 */
export interface LearningHistoryResponse {
  readonly timestamp: number;
  readonly data: LearningPerformanceRecord[];
  readonly pagination: {
    readonly limit: number;
    readonly offset: number;
    readonly totalEstimated?: number;
  };
}
