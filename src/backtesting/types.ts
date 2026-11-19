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
  readonly timeframe?: string;              // Temporalidad ("15m", "1h", etc.)
  readonly start_time: number;              // Timestamp de inicio en milisegundos
  readonly end_time: number;                // Timestamp de fin en milisegundos
  readonly initial_balance: number;         // Balance de capital inicial (ej: 100 USD)
  readonly fee_rate?: number;               // Tasa de comisión por transacción (ej: 0.0006 para 0.06%)
  readonly slippage_simulation_factor?: number; // Factor máximo de deslizamiento (ej: 0.0005)
  readonly leverage?: number;               // Apalancamiento simulado (ej: 10)
}

/**
 * Registro contable punto a punto de la curva de equidad.
 */
export interface EquityPoint {
  readonly timestamp: number;               // Momento de la simulación
  readonly balance: number;                 // Balance disponible por PnL realizado acumulado
  readonly equity: number;                  // Equidad real (balance + PnL no realizado)
  readonly unrealized_pnl: number;          // PnL flotante de posición abierta
  readonly realized_pnl: number;            // PnL cerrado acumulado
  readonly fees: number;                    // Comisiones acumuladas
  readonly funding: number;                 // Tarifas de financiación acumuladas
  readonly slippage: number;                // Deslizamiento acumulado
  readonly margin_used: number;             // Margen retenido por posición abierta
  readonly available_margin: number;        // Margen disponible para nuevas posiciones
  readonly peak_equity: number;             // Máximo histórico de equidad alcanzado
  readonly drawdown_percentage: number;     // Drawdown porcentual instantáneo [0.0%, 100.0%]
  readonly price?: number;                  // Precio de mercado en ese instante
  readonly account_status: 'ACTIVE' | 'LIQUIDATED' | 'ACCOUNT_BLOWN';
}

/**
 * Auditoría forense de los datos históricos recuperados.
 */
export interface DataAuditMetadata {
  readonly requestedStart: number;
  readonly requestedEnd: number;
  readonly actualFirstCandle: number;
  readonly actualLastCandle: number;
  readonly candleCount: number;
  readonly uniqueTimestampCount: number;
  readonly duplicateTimestampCount: number;
}

/**
 * Reporte detallado e inmutable del Backtest.
 */
export interface BacktestResult {
  readonly symbol: string;
  readonly timeframe: string;
  readonly config: BacktestConfig;
  readonly data_audit: DataAuditMetadata;
  readonly trades: readonly any[];
  readonly equity_curve: readonly EquityPoint[];
  readonly performance: PerformanceReport;
  readonly simulated_trades_count: number;
  readonly rejected_trades_count: number;
  readonly win_rate: number;
  readonly profit_factor: number;
  readonly sharpe_ratio: number;
  readonly sortino_ratio: number;
  readonly max_drawdown_percentage: number;
  readonly net_profit_usd: number;
  readonly final_status: 'ACTIVE' | 'LIQUIDATED' | 'ACCOUNT_BLOWN';
  readonly blown_timestamp?: number;
  readonly blown_trade_id?: number;
}

