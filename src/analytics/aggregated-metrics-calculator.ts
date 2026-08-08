/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/index.ts';
import { trades } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { InstanceConfig, AggregatedPerformanceReport } from '../core/types/instances.ts';
import { PerformanceReport } from './types.ts';

/**
 * Calculador de Métricas Agregadas Multi-Instancia (AggregatedMetricsCalculator).
 * 
 * Centraliza la consolidación de métricas de portafolio y análisis cuantitativo multi-instancia.
 * Diseñado para evitar el sobre-apalancamiento y mitigar el riesgo de factores correlacionados.
 */
export class AggregatedMetricsCalculator {

  /**
   * Genera el reporte consolidado de rendimiento agregando todos los trades en memoria 
   * y calculando las métricas financieras (Sharpe, Sortino, Drawdown) a nivel global de portafolio.
   */
  public async generateAggregatedReport(configs: readonly InstanceConfig[]): Promise<AggregatedPerformanceReport> {
    console.log('[AggregatedMetricsCalculator] Generando reporte consolidado de rendimiento multi-instancia...');

    const activeCount = configs.length;
    const totalAllocated = configs.reduce((acc, c) => acc + c.allocated_capital, 0);

    if (activeCount === 0) {
      return {
        sharpe_ratio: 0,
        sortino_ratio: 0,
        profit_factor: 0,
        win_rate: 0,
        max_drawdown_percentage: 0,
        total_trades: 0,
        net_profit_usd: 0,
        total_profit_usd: 0,
        total_loss_usd: 0,
        average_win_usd: 0,
        average_loss_usd: 0,
        timestamp: Date.now(),
        total_allocated_capital: 0,
        active_instances_count: 0,
        instances_performance: {}
      };
    }

    // 1. Obtener todos los trades cerrados
    const allClosedTradesRaw = await db
      .select()
      .from(trades)
      .where(eq(trades.status, 'CLOSED'));

    // Ordenar cronológicamente para reconstruir la curva de equidad consolidada
    const allClosedTrades = [...allClosedTradesRaw].sort((a, b) => {
      const tA = a.exitTime ? new Date(a.exitTime).getTime() : 0;
      const tB = b.exitTime ? new Date(b.exitTime).getTime() : 0;
      return tA - tB;
    });

    const totalTrades = allClosedTrades.length;

    // Calcular reportes de rendimiento individuales de forma limpia e indexada
    const instancesPerformance: Record<string, PerformanceReport> = {};
    for (const config of configs) {
      const instanceTrades = allClosedTrades.filter(t => t.symbol === config.symbol);
      instancesPerformance[config.instance_id] = this.calculateLightweightReport(instanceTrades, config.allocated_capital);
    }

    if (totalTrades === 0) {
      return {
        sharpe_ratio: 0,
        sortino_ratio: 0,
        profit_factor: 0,
        win_rate: 0,
        max_drawdown_percentage: 0,
        total_trades: 0,
        net_profit_usd: 0,
        total_profit_usd: 0,
        total_loss_usd: 0,
        average_win_usd: 0,
        average_loss_usd: 0,
        timestamp: Date.now(),
        total_allocated_capital: totalAllocated,
        active_instances_count: activeCount,
        instances_performance: instancesPerformance
      };
    }

    // 2. Agregación a Nivel de Portafolio Consolidado
    let totalProfitUSD = 0;
    let totalLossUSD = 0;
    let winningTradesCount = 0;
    let losingTradesCount = 0;

    const retornosPorcentaje: number[] = [];
    let equidadActual = totalAllocated;
    let picoEquidad = totalAllocated;
    let maxDrawdownPct = 0;

    for (const trade of allClosedTrades) {
      const pnl = Number(trade.pnl || 0);
      let pnlPct = Number(trade.pnlPercentage || 0);

      if (pnlPct === 0 && pnl !== 0) {
        const nominal = Number(trade.entryPrice || 1) * Number(trade.quantity || 0);
        if (nominal > 0) pnlPct = (pnl / nominal) * 100;
      }

      retornosPorcentaje.push(pnlPct);

      if (pnl > 0) {
        totalProfitUSD += pnl;
        winningTradesCount++;
      } else if (pnl < 0) {
        totalLossUSD += Math.abs(pnl);
        losingTradesCount++;
      }

      equidadActual += pnl;
      if (equidadActual > picoEquidad) {
        picoEquidad = equidadActual;
      }

      const drawdownPct = picoEquidad > 0 ? ((picoEquidad - equidadActual) / picoEquidad) * 100 : 0;
      if (drawdownPct > maxDrawdownPct) {
        maxDrawdownPct = drawdownPct;
      }
    }

    const winRate = winningTradesCount / totalTrades;
    const profitFactor = totalLossUSD > 0 ? totalProfitUSD / totalLossUSD : totalProfitUSD;
    const netProfitUSD = totalProfitUSD - totalLossUSD;

    const averageWinUSD = winningTradesCount > 0 ? totalProfitUSD / winningTradesCount : 0;
    const averageLossUSD = losingTradesCount > 0 ? totalLossUSD / losingTradesCount : 0;

    // Sharpe Ratio Consolidado
    let sharpeRatio = 0;
    if (totalTrades > 1) {
      const media = retornosPorcentaje.reduce((acc, val) => acc + val, 0) / totalTrades;
      const sumaDifCuadrados = retornosPorcentaje.reduce((acc, val) => acc + Math.pow(val - media, 2), 0);
      const varianza = sumaDifCuadrados / (totalTrades - 1);
      const stdDev = Math.sqrt(varianza);

      if (stdDev > 0) sharpeRatio = media / stdDev;
    }

    // Sortino Ratio Consolidado
    let sortinoRatio = 0;
    if (totalTrades > 1) {
      const media = retornosPorcentaje.reduce((acc, val) => acc + val, 0) / totalTrades;
      const retornosNegativosCuadrados = retornosPorcentaje.map(val => val < 0 ? Math.pow(val, 2) : 0);
      const sumaRetornosNegativosCuadrados = retornosNegativosCuadrados.reduce((acc, val) => acc + val, 0);
      const varianzaAbajo = sumaRetornosNegativosCuadrados / totalTrades;
      const stdDevAbajo = Math.sqrt(varianzaAbajo);

      if (stdDevAbajo > 0) {
        sortinoRatio = media / stdDevAbajo;
      } else if (media > 0) {
        sortinoRatio = media * 10;
      }
    }

    return {
      sharpe_ratio: Number(sharpeRatio.toFixed(4)),
      sortino_ratio: Number(sortinoRatio.toFixed(4)),
      profit_factor: Number(profitFactor.toFixed(4)),
      win_rate: Number(winRate.toFixed(4)),
      max_drawdown_percentage: Number(maxDrawdownPct.toFixed(4)),
      total_trades: totalTrades,
      net_profit_usd: Number(netProfitUSD.toFixed(4)),
      total_profit_usd: Number(totalProfitUSD.toFixed(4)),
      total_loss_usd: Number(totalLossUSD.toFixed(4)),
      average_win_usd: Number(averageWinUSD.toFixed(4)),
      average_loss_usd: Number(averageLossUSD.toFixed(4)),
      timestamp: Date.now(),
      total_allocated_capital: totalAllocated,
      active_instances_count: activeCount,
      instances_performance: instancesPerformance
    };
  }

  /**
   * Calcula un reporte de rendimiento rápido para un set filtrado de trades.
   */
  private calculateLightweightReport(tradesList: typeof trades.$inferSelect[], initialBalance: number): PerformanceReport {
    const total = tradesList.length;
    if (total === 0) {
      return {
        sharpe_ratio: 0,
        sortino_ratio: 0,
        profit_factor: 0,
        win_rate: 0,
        max_drawdown_percentage: 0,
        total_trades: 0,
        net_profit_usd: 0,
        total_profit_usd: 0,
        total_loss_usd: 0,
        average_win_usd: 0,
        average_loss_usd: 0,
        timestamp: Date.now()
      };
    }

    let profit = 0;
    let loss = 0;
    let wins = 0;
    let losses = 0;

    const returns: number[] = [];
    let equity = initialBalance;
    let peak = initialBalance;
    let maxDD = 0;

    for (const t of tradesList) {
      const pnl = Number(t.pnl || 0);
      let pnlPct = Number(t.pnlPercentage || 0);

      if (pnlPct === 0 && pnl !== 0) {
        const nominal = Number(t.entryPrice || 1) * Number(t.quantity || 0);
        if (nominal > 0) pnlPct = (pnl / nominal) * 100;
      }

      returns.push(pnlPct);

      if (pnl > 0) {
        profit += pnl;
        wins++;
      } else if (pnl < 0) {
        loss += Math.abs(pnl);
        losses++;
      }

      equity += pnl;
      if (equity > peak) peak = equity;

      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    }

    const winRate = wins / total;
    const profitFactor = loss > 0 ? profit / loss : profit;

    let sharpe = 0;
    if (total > 1) {
      const avg = returns.reduce((a, b) => a + b, 0) / total;
      const vars = returns.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (total - 1);
      const dev = Math.sqrt(vars);
      if (dev > 0) sharpe = avg / dev;
    }

    let sortino = 0;
    if (total > 1) {
      const avg = returns.reduce((a, b) => a + b, 0) / total;
      const varsAbajo = returns.map(v => v < 0 ? Math.pow(v, 2) : 0).reduce((a, b) => a + b, 0) / total;
      const devAbajo = Math.sqrt(varsAbajo);
      if (devAbajo > 0) {
        sortino = avg / devAbajo;
      } else if (avg > 0) {
        sortino = avg * 10;
      }
    }

    return {
      sharpe_ratio: Number(sharpe.toFixed(4)),
      sortino_ratio: Number(sortino.toFixed(4)),
      profit_factor: Number(profitFactor.toFixed(4)),
      win_rate: Number(winRate.toFixed(4)),
      max_drawdown_percentage: Number(maxDD.toFixed(4)),
      total_trades: total,
      net_profit_usd: Number((profit - loss).toFixed(4)),
      total_profit_usd: Number(profit.toFixed(4)),
      total_loss_usd: Number(loss.toFixed(4)),
      average_win_usd: wins > 0 ? Number((profit / wins).toFixed(4)) : 0,
      average_loss_usd: losses > 0 ? Number((loss / losses).toFixed(4)) : 0,
      timestamp: Date.now()
    };
  }

  /**
   * Calcula la matriz de correlación de rendimientos históricos de los últimos 30 días entre pares
   * y genera alertas defensivas en caso de sobreexposición de riesgo sistémico.
   */
  public async calculateSymbolCorrelations(symbols: string[]): Promise<{
    correlations: Record<string, Record<string, number>>;
    alerts: string[];
  }> {
    console.log(`[AggregatedMetricsCalculator] Evaluando matriz de correlación de retornos para: ${symbols.join(', ')}`);

    const correlations: Record<string, Record<string, number>> = {};
    const alerts: string[] = [];

    if (symbols.length < 2) {
      return { correlations, alerts };
    }

    // 1. Obtener trades cerrados históricos
    const closedTrades = await db
      .select()
      .from(trades)
      .where(eq(trades.status, 'CLOSED'));

    // Generar la ventana cronológica estricta de los últimos 30 días
    const last30Days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last30Days.push(d.toISOString().split('T')[0]);
    }

    // 2. Construir los vectores de retornos diarios para cada símbolo
    const symbolVectors: Record<string, number[]> = {};

    for (const sym of symbols) {
      // Filtrar trades del símbolo
      const symTrades = closedTrades.filter(t => t.symbol === sym);
      
      // Mapear PnL acumulado diario
      const dailyPnL: Record<string, number> = {};
      for (const t of symTrades) {
        if (t.exitTime) {
          const dateStr = new Date(t.exitTime).toISOString().split('T')[0];
          const pnlPct = Number(t.pnlPercentage || 0);
          dailyPnL[dateStr] = (dailyPnL[dateStr] || 0) + pnlPct;
        }
      }

      // Convertir en un vector de retorno de tamaño fijo (30 días)
      symbolVectors[sym] = last30Days.map(day => dailyPnL[day] || 0);
    }

    // 3. Calcular los coeficientes Pearson cruzados
    for (let i = 0; i < symbols.length; i++) {
      const symA = symbols[i];
      correlations[symA] = {};

      for (let j = 0; j < symbols.length; j++) {
        const symB = symbols[j];

        if (i === j) {
          correlations[symA][symB] = 1.0; // Correlación perfecta consigo mismo
          continue;
        }

        const vectorA = symbolVectors[symA] || Array(30).fill(0);
        const vectorB = symbolVectors[symB] || Array(30).fill(0);

        const r = this.calculatePearsonCorrelation(vectorA, vectorB);
        correlations[symA][symB] = Number(r.toFixed(4));

        // Alertas de sobreexposición sistémica si la correlación de ganancias es crítica (> 0.70)
        if (i < j && r > 0.70) {
          alerts.push(
            `[ALERTA DE RIESGO] Alta correlación positiva detectada entre ${symA} y ${symB} (r = ${r.toFixed(2)}). ` +
            `El ecosistema está altamente expuesto a la misma dirección de mercado. Considere suspender o reducir a la mitad el capital asignado en uno de los dos slots.`
          );
        }
      }
    }

    return { correlations, alerts };
  }

  /**
   * Cálculo puramente matemático del Coeficiente de Correlación de Pearson entre dos vectores de igual longitud.
   */
  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    let numerator = 0;
    let sumXDiffSq = 0;
    let sumYDiffSq = 0;

    for (let i = 0; i < n; i++) {
      const diffX = x[i] - meanX;
      const diffY = y[i] - meanY;

      numerator += diffX * diffY;
      sumXDiffSq += diffX * diffX;
      sumYDiffSq += diffY * diffY;
    }

    if (sumXDiffSq === 0 || sumYDiffSq === 0) {
      return 0; // Evitar división por cero ante series constantes (sin retornos)
    }

    return numerator / Math.sqrt(sumXDiffSq * sumYDiffSq);
  }
}
