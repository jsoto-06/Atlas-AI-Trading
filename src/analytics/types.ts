/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PerformanceReport {
  sharpe_ratio: number;             // Sharpe Ratio (indicador de retorno ajustado al riesgo, RFR = 0%)
  sortino_ratio: number;            // Sortino Ratio (mide retorno ajustado a la volatilidad de caídas / downside deviation)
  profit_factor: number;            // Factor de ganancia (Suma ganancias / Suma pérdidas)
  win_rate: number;                 // Tasa de acierto o probabilidad de éxito (0.00 a 1.00)
  max_drawdown_percentage: number;  // Pérdida máxima histórica acumulada de la cuenta en porcentaje (0.00 a 100.00)
  total_trades: number;             // Cantidad total de operaciones cerradas conciliadas

  // Métricas financieras adicionales de valor agregado institucional
  net_profit_usd: number;           // Ganancia neta total en USD (ganancia bruta - pérdida bruta)
  total_profit_usd: number;         // Ganancia bruta total en USD
  total_loss_usd: number;           // Pérdida bruta total en USD
  average_win_usd: number;          // Ganancia promedio de operaciones ganadoras en USD
  average_loss_usd: number;         // Pérdida promedio de operaciones perdedoras en USD
  timestamp: number;                // Timestamp Unix del momento de la generación del reporte
}
