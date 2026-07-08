/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Representa los diferentes regímenes de mercado diagnosticados heurísticamente.
 */
export type MarketRegime = 'BULL_TREND' | 'BEAR_TREND' | 'MEAN_REVERTING' | 'HIGH_VOLATILITY_CRASH';

/**
 * Propuesta inmutable de adaptación y calibración dinámica de parámetros operativos.
 * Se alimenta de la telemetría de rendimiento y del análisis del régimen de mercado.
 */
export interface AdaptationProposal {
  readonly market_regime: MarketRegime;
  readonly classification_rationale: string;
  readonly weights: Record<string, number>;
  readonly adjusted_kelly_fraction: number; // Denominador de fracción de Kelly (ej. 4 = Quarter-Kelly, 8 = 1/8-Kelly, etc.)
  readonly atr_multipliers: {
    readonly stop_loss: number;
    readonly take_profit: number;
  };
  readonly min_confidence_threshold: number; // Umbral de certeza mínimo [0.0, 1.0]
  readonly suspension_flag: boolean; // Bandera de detención de emergencia ante degradación extrema
  readonly timestamp: number;
}
