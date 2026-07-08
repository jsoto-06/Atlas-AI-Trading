/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/index.ts';
import { trades, settings } from '../db/schema.ts';
import { eq, and, isNotNull } from 'drizzle-orm';
import { PerformanceReport } from './types.ts';

/**
 * Calculador de Métricas de Rendimiento Financiero (MetricsCalculator).
 * 
 * Extrae el histórico completo de operaciones cerradas desde la base de datos (PostgreSQL / Drizzle ORM)
 * y realiza cálculos matemáticos avanzados alineados con los estándares de la gestión
 * de carteras institucional (Sharpe, Sortino, Profit Factor, Max Drawdown).
 * 
 * Características clave:
 * - Evita agregaciones pesadas en DB procesando el flujo de datos en memoria con Big-O optimizado.
 * - Soporta inicialización perezosa y tolerancia total ante bases de datos vacías o con un único trade.
 * - Calcula el Drawdown máximo reconstruyendo la curva de equidad (equity curve) cronológicamente.
 */
export class MetricsCalculator {
  private readonly DEFAULT_ACCOUNT_SIZE = 10000; // Cuenta base de $10,000 USD por defecto

  /**
   * Obtiene el tamaño de cuenta registrado en la configuración global de riesgo.
   */
  private async obtenerBalanceInicial(): Promise<number> {
    try {
      const filas = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'global_risk_limits'))
        .limit(1);

      if (filas && filas.length > 0) {
        const dbVal = filas[0].value as any;
        if (dbVal && typeof dbVal.accountSizeUSD === 'number') {
          return dbVal.accountSizeUSD;
        }
      }
    } catch (error) {
      console.warn('[MetricsCalculator] Error al leer balance inicial desde settings. Utilizando fallback por defecto:', error);
    }
    return this.DEFAULT_ACCOUNT_SIZE;
  }

  /**
   * Genera el reporte completo consolidado de analíticas y métricas de rendimiento.
   * 
   * @param userId Opcional. ID de usuario específico para segmentar el reporte de rendimiento.
   */
  public async generateReport(userId?: number): Promise<PerformanceReport> {
    console.log(`[MetricsCalculator] Iniciando cálculo de métricas avanzadas de rendimiento...`);

    try {
      // 1. Obtener balance de inicio para la curva de equidad
      const balanceInicial = await this.obtenerBalanceInicial();

      // 2. Extraer histórico de operaciones cerradas, ordenadas cronológicamente por hora de salida
      let consulta = db
        .select()
        .from(trades)
        .where(eq(trades.status, 'CLOSED'));

      if (userId !== undefined) {
        consulta = db
          .select()
          .from(trades)
          .where(
            and(
              eq(trades.status, 'CLOSED'),
              eq(trades.userId, userId)
            )
          );
      }

      // Ordenamos las filas por exitTime de forma ascendente para estructurar la serie temporal
      const closedTradesRaw = await consulta;
      
      const closedTrades = [...closedTradesRaw].sort((a, b) => {
        const tA = a.exitTime ? new Date(a.exitTime).getTime() : 0;
        const tB = b.exitTime ? new Date(b.exitTime).getTime() : 0;
        return tA - tB;
      });

      const totalTrades = closedTrades.length;

      // Reporte vacío seguro para cuentas sin operaciones
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
          timestamp: Date.now()
        };
      }

      // 3. Inicializar variables de agregación
      let totalProfitUSD = 0;
      let totalLossUSD = 0;
      let winningTradesCount = 0;
      let losingTradesCount = 0;

      // Vectores para análisis estadístico (Sharpe / Sortino)
      const retornosPorcentaje: number[] = [];

      // Reconstrucción de la curva de equidad para calcular Max Drawdown de forma exacta
      let equidadActual = balanceInicial;
      let picoEquidad = balanceInicial;
      let maxDrawdownPct = 0;

      for (const trade of closedTrades) {
        const pnl = Number(trade.pnl || 0);
        
        // Carga de retorno porcentual del trade
        let pnlPct = Number(trade.pnlPercentage || 0);
        
        // Si no existe pnlPercentage, lo aproximamos usando costo de entrada
        if (pnlPct === 0 && pnl !== 0) {
          const entryPrice = Number(trade.entryPrice || 1);
          const qty = Number(trade.quantity || 0);
          const nominalValue = entryPrice * qty;
          if (nominalValue > 0) {
            pnlPct = (pnl / nominalValue) * 100;
          }
        }

        retornosPorcentaje.push(pnlPct);

        // Agregaciones básicas
        if (pnl > 0) {
          totalProfitUSD += pnl;
          winningTradesCount++;
        } else if (pnl < 0) {
          totalLossUSD += Math.abs(pnl);
          losingTradesCount++;
        }

        // Simulación temporal de equidad
        equidadActual += pnl;
        if (equidadActual > picoEquidad) {
          picoEquidad = equidadActual;
        }

        // Drawdown instantáneo = ((Peak - Equity) / Peak) * 100
        const drawdownPctInstantaneo = picoEquidad > 0 
          ? ((picoEquidad - equidadActual) / picoEquidad) * 100 
          : 0;

        if (drawdownPctInstantaneo > maxDrawdownPct) {
          maxDrawdownPct = drawdownPctInstantaneo;
        }
      }

      // 4. Cálculos Financieros Estándar
      const winRate = winningTradesCount / totalTrades;
      const profitFactor = totalLossUSD > 0 ? Number((totalProfitUSD / totalLossUSD).toFixed(4)) : Number(totalProfitUSD.toFixed(4));
      const netProfitUSD = totalProfitUSD - totalLossUSD;

      const averageWinUSD = winningTradesCount > 0 ? Number((totalProfitUSD / winningTradesCount).toFixed(4)) : 0;
      const averageLossUSD = losingTradesCount > 0 ? Number((totalLossUSD / losingTradesCount).toFixed(4)) : 0;

      // 5. Ratio de Sharpe (Asumiendo Risk-Free Rate = 0%)
      let sharpeRatio = 0;
      if (totalTrades > 1) {
        // Promedio de retornos (media)
        const mediaRetornos = retornosPorcentaje.reduce((acc, val) => acc + val, 0) / totalTrades;
        
        // Desviación estándar muestral (N - 1)
        const sumaDiferenciasCuadradas = retornosPorcentaje.reduce((acc, val) => acc + Math.pow(val - mediaRetornos, 2), 0);
        const varianzaMuestral = sumaDiferenciasCuadradas / (totalTrades - 1);
        const desviacionEstandar = Math.sqrt(varianzaMuestral);

        if (desviacionEstandar > 0) {
          sharpeRatio = Number((mediaRetornos / desviacionEstandar).toFixed(4));
        }
      }

      // 6. Ratio de Sortino (Evaluando sólo Downside Deviation)
      let sortinoRatio = 0;
      if (totalTrades > 1) {
        const mediaRetornos = retornosPorcentaje.reduce((acc, val) => acc + val, 0) / totalTrades;
        
        // Downside Deviation (desviación de retornos negativos, MAR = 0)
        // Se penalizan solo los retornos menores a 0
        const retornosNegativosCuadrados = retornosPorcentaje.map(val => val < 0 ? Math.pow(val, 2) : 0);
        const sumaRetornosNegativosCuadrados = retornosNegativosCuadrados.reduce((acc, val) => acc + val, 0);
        
        // El denominador usa N como divisor estándar para downside deviation
        const varianzaAbajo = sumaRetornosNegativosCuadrados / totalTrades;
        const desviacionAbajo = Math.sqrt(varianzaAbajo);

        if (desviacionAbajo > 0) {
          sortinoRatio = Number((mediaRetornos / desviacionAbajo).toFixed(4));
        } else if (mediaRetornos > 0) {
          // Si no hay pérdidas (desviación abajo es 0) pero hay retornos positivos, 
          // el Sortino es excepcionalmente alto o infinito técnico
          sortinoRatio = Number((mediaRetornos * 10).toFixed(4)); // Valor acotado de alta calidad
        }
      }

      const report: PerformanceReport = {
        sharpe_ratio: sharpeRatio,
        sortino_ratio: sortinoRatio,
        profit_factor: profitFactor,
        win_rate: Number(winRate.toFixed(4)),
        max_drawdown_percentage: Number(maxDrawdownPct.toFixed(4)),
        total_trades: totalTrades,
        net_profit_usd: Number(netProfitUSD.toFixed(4)),
        total_profit_usd: Number(totalProfitUSD.toFixed(4)),
        total_loss_usd: Number(totalLossUSD.toFixed(4)),
        average_win_usd: averageWinUSD,
        average_loss_usd: averageLossUSD,
        timestamp: Date.now()
      };

      console.log(`[MetricsCalculator] Reporte calculado exitosamente. Trades conciliados: ${totalTrades} | Win Rate: ${(winRate * 100).toFixed(2)}% | Sharpe: ${sharpeRatio} | Sortino: ${sortinoRatio} | Max Drawdown: ${maxDrawdownPct.toFixed(2)}%`);
      return report;

    } catch (err) {
      console.error('[MetricsCalculator] Error crítico al calcular métricas de rendimiento en Drizzle DB:', err);
      throw err;
    }
  }
}
