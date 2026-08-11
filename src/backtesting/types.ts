/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PerformanceReport } from '../analytics/types.ts';

/**
 * Parámetros de control para ejecutar una simulación histórica determinista.
 */
export interface BacktestConfig {
  readonly symbol: string;                  // Símbolo del activo (ej: "BTC/USDT")
  readonly start_time: number;              // Timestamp de inicio en milisegundos
  readonly end_time: number;                // Timestamp de fin en milisegundos
  readonly initial_balance: number;         // Balance de capital inicial (ej: 10000 USD)
  readonly fee_rate?: number;               // Tasa de comisión por transacción (ej: 0.0006 para 0.06%)
  readonly slippage_simulation_factor?: number; // Factor máximo de deslizamiento (ej: 0.0005)
}

/**
 * Punto de registro paso a paso de la curva de equidad.
 */
export interface EquityPoint {
  readonly timestamp: number;               // Momento de la simulación
  readonly balance?: number;                // Balance disponible
  readonly equity: number;                  // Balance de equidad acumulado (capital + PnL realizado)
  readonly drawdown_percentage?: number;    // Drawdown instantáneo en ese punto temporal
  readonly drawdown?: number;               // Drawdown instantáneo alternativo
  readonly price?: number;                  // Precio de mercado en ese momento
}

/**
 * Reporte detallado de la ejecución del Backtest.
 */
export interface BacktestResult {
  readonly symbol: string;
  readonly timeframe: string;
  readonly config: BacktestConfig;          // Configuración con la que se corrió la simulación
  readonly trades: readonly any[];          // Lista de trades simulados
  readonly equity_curve: readonly EquityPoint[]; // Historial de equidad paso a paso
  readonly performance: PerformanceReport; // Reporte de rendimiento financiero
  readonly simulated_trades_count?: number; // Número de trades ejecutados en la simulación
  readonly win_rate?: number;
  readonly profit_factor?: number;
  readonly sharpe_ratio?: number;
  readonly sortino_ratio?: number;
  readonly max_drawdown_percentage?: number;
  readonly net_profit_usd?: number;
}

