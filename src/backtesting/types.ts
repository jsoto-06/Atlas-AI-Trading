/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AggregatedPerformanceReport } from '../core/types/instances.ts';

/**
 * Parámetros de control para ejecutar una simulación histórica determinista.
 */
export interface BacktestConfig {
  readonly symbol: string;                  // Símbolo del activo (ej: "BTC/USDT")
  readonly start_time: number;              // Timestamp de inicio en milisegundos
  readonly end_time: number;                // Timestamp de fin en milisegundos
  readonly initial_balance: number;         // Balance de capital inicial (ej: 100000 USD)
  readonly fee_rate: number;                // Tasa de comisión por transacción (ej: 0.0006 para 0.06%)
  readonly slippage_simulation_factor: number; // Factor máximo de deslizamiento aleatorio de órdenes (ej: 0.0005)
}

/**
 * Punto de registro paso a paso de la curva de equidad.
 */
export interface EquityPoint {
  readonly timestamp: number;               // Momento de la simulación
  readonly equity: number;                  // Balance de equidad acumulado (capital + PnL realizado)
  readonly drawdown_percentage: number;     // Drawdown instantáneo en ese punto temporal
  readonly price: number;                   // Precio de mercado en ese momento
}

/**
 * Reporte detallado de la ejecución del Backtest.
 * Extiende las métricas consolidadas del portafolio multi-instancia para asegurar consistencia analítica.
 */
export interface BacktestResult extends AggregatedPerformanceReport {
  readonly config: BacktestConfig;          // Configuración con la que se corrió la simulación
  readonly equity_curve: readonly EquityPoint[]; // Historial de equidad paso a paso
  readonly simulated_trades_count: number;  // Número de trades ejecutados en la simulación
}
