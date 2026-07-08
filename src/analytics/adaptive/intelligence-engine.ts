/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../../db/index.ts';
import { trades, settings, auditLogs, learningPerformance } from '../../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { Blackboard } from '../../core/blackboard.ts';
import { PerformanceReport } from '../types.ts';
import { MarketRegime, AdaptationProposal } from './types.ts';
import { AgentAssessment } from '../../types.ts';

export type TradeRecord = typeof trades.$inferSelect;

/**
 * Motor de Inteligencia Adaptativa (AdaptiveIntelligenceEngine).
 * 
 * Centraliza la toma de decisiones evolutivas y auto-calibración en tiempo real.
 * Procesa la telemetría histórica del sistema para optimizar los parámetros del Fast-Loop.
 * 
 * Diseñado bajo principios de:
 * 1. Cálculos de baja latencia mediante álgebra lineal y heurística estadística pura.
 * 2. Inmutabilidad estricta de las propuestas generadas.
 * 3. Propagación atómica a la pizarra de memoria (Blackboard) y persistencia duradera en DB.
 */
export class AdaptiveIntelligenceEngine {
  private blackboard: Blackboard;

  constructor(blackboard?: Blackboard) {
    this.blackboard = blackboard || Blackboard.getInstance();
  }

  /**
   * Clasifica el régimen del mercado actual analizando de forma heurística la serie
   * temporal de las últimas operaciones ejecutadas y el comportamiento de sus retornos.
   * 
   * Heurística libre de bloqueo basada en dirección de ganancias y volatilidad de retornos (desviación estándar).
   */
  public classifyMarketRegime(recentTrades: TradeRecord[]): { regime: MarketRegime; rationale: string } {
    if (recentTrades.length < 3) {
      return {
        regime: 'MEAN_REVERTING',
        rationale: 'Datos de operaciones insuficientes en serie temporal para dictaminar régimen. Fallback preventivo: Reversión a la media / Lateral.'
      };
    }

    const total = recentTrades.length;
    let longCount = 0;
    let shortCount = 0;
    let longWins = 0;
    let shortWins = 0;
    let wins = 0;

    for (const trade of recentTrades) {
      const isLong = trade.side === 'LONG' || trade.side === 'BUY';
      const pnl = Number(trade.pnl || 0);

      if (pnl > 0) {
        wins++;
      }

      if (isLong) {
        longCount++;
        if (pnl > 0) longWins++;
      } else {
        shortCount++;
        if (pnl > 0) shortWins++;
      }
    }

    const winRate = wins / total;

    // Cálculo rápido de desviación estándar de retornos porcentuales como indicador de volatilidad
    const retornos = recentTrades.map(t => Number(t.pnlPercentage || 0));
    const media = retornos.reduce((acc, v) => acc + v, 0) / total;
    const varianza = retornos.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / total;
    const stdDev = Math.sqrt(varianza);

    // Ganancia o pérdida neta agregada de la muestra
    const netoUSD = recentTrades.reduce((acc, t) => acc + Number(t.pnl || 0), 0);

    // Heurísticas institucionales para clasificación ágil de regímenes:
    
    // 1. HIGH_VOLATILITY_CRASH: Alta dispersión de retornos, con pérdidas acumuladas netas.
    if (stdDev > 4.5 && netoUSD < 0) {
      return {
        regime: 'HIGH_VOLATILITY_CRASH',
        rationale: `Volatilidad crítica detectada (Desviación Std: ${stdDev.toFixed(2)}%) acompañado de saldo neto negativo ($${netoUSD.toFixed(2)} USD). Estructura de pánico o Crash.`
      };
    }

    // 2. BULL_TREND: Alta proporción de operaciones Long y alta tasa de aciertos neto positivo.
    if (longCount > shortCount && winRate > 0.60 && netoUSD > 0) {
      return {
        regime: 'BULL_TREND',
        rationale: `Fuerza compradora predominante (Longs: ${longCount}/${total}) con tasa de éxito de ${(winRate * 100).toFixed(1)}%. Sesgo de mercado alcista.`
      };
    }

    // 3. BEAR_TREND: Predominio de operaciones Short ganadoras en el período analizado.
    if (shortCount > longCount && winRate > 0.60 && netoUSD > 0) {
      return {
        regime: 'BEAR_TREND',
        rationale: `Presión vendedora dominante (Shorts: ${shortCount}/${total}) con tasa de éxito de ${(winRate * 100).toFixed(1)}%. Sesgo de mercado bajista.`
      };
    }

    // 4. MEAN_REVERTING: Mercados laterales en rango, alternancia rápida o baja desviación estándar.
    return {
      regime: 'MEAN_REVERTING',
      rationale: `Mercado en rango de equilibrio lateral. Volatilidad moderada (Desviación Std: ${stdDev.toFixed(2)}%) y distribución simétrica de resultados.`
    };
  }

  /**
   * Analiza rachas consecutivas de pérdidas para ajustar dinámicamente el tamaño y los stops.
   * Evita sobre-apalancamiento destructivo durante períodos de reducción temporal (Drawdown).
   */
  public evaluateLossStreakProtection(recentTrades: TradeRecord[]): { degradationFactor: number; confidenceShift: number; consecutiveLosses: number } {
    let consecutiveLosses = 0;

    // El historial se ordena ascendentemente, por lo que invertimos para evaluar el presente hacia atrás.
    const tradesMasRecientes = [...recentTrades].reverse();

    for (const trade of tradesMasRecientes) {
      const pnl = Number(trade.pnl || 0);
      if (pnl < 0) {
        consecutiveLosses++;
      } else if (pnl > 0) {
        break; // Racha de pérdidas cortada por un acierto
      }
    }

    // Factor de degradación exponencial multiplicativo (ej. 0.82 ^ consecutivas)
    const degradationFactor = Math.pow(0.82, consecutiveLosses);

    // Ajuste de confianza requerido (añade +0.06 de confianza mínima requerida por cada pérdida consecutiva)
    const confidenceShift = consecutiveLosses * 0.06;

    return {
      degradationFactor,
      confidenceShift,
      consecutiveLosses
    };
  }

  /**
   * Genera de forma asíncrona una propuesta inmutable de adaptación basándose en
   * el PerformanceReport consolidado (Fase 13) y la muestra reciente de operaciones.
   */
  public async generateAdaptationProposal(report: PerformanceReport, recentTrades: TradeRecord[]): Promise<AdaptationProposal> {
    const { sharpe_ratio, sortino_ratio, profit_factor, max_drawdown_percentage, total_trades } = report;

    // Diagnósticos heurísticos rápidos
    const { regime, rationale } = this.classifyMarketRegime(recentTrades);
    const { degradationFactor, confidenceShift, consecutiveLosses } = this.evaluateLossStreakProtection(recentTrades);

    // 1. Optimizar pesos analíticos según el comportamiento dinámico del régimen de mercado
    let weights: Record<string, number> = {
      TechnicalAnalyst: 0.25,
      OnChain: 0.15,
      OrderFlow: 0.20,
      Sentiment: 0.15,
      Correlation: 0.15,
      Divergence: 0.10
    };

    if (regime === 'BULL_TREND') {
      weights = {
        TechnicalAnalyst: 0.35,
        OnChain: 0.25,
        OrderFlow: 0.15,
        Sentiment: 0.15,
        Correlation: 0.05,
        Divergence: 0.05
      };
    } else if (regime === 'BEAR_TREND') {
      weights = {
        TechnicalAnalyst: 0.30,
        OnChain: 0.10,
        OrderFlow: 0.30,
        Sentiment: 0.20,
        Correlation: 0.05,
        Divergence: 0.05
      };
    } else if (regime === 'MEAN_REVERTING') {
      weights = {
        TechnicalAnalyst: 0.25,
        OnChain: 0.05,
        OrderFlow: 0.15,
        Sentiment: 0.10,
        Correlation: 0.20,
        Divergence: 0.25
      };
    } else if (regime === 'HIGH_VOLATILITY_CRASH') {
      weights = {
        TechnicalAnalyst: 0.15,
        OnChain: 0.05,
        OrderFlow: 0.35,
        Sentiment: 0.25,
        Correlation: 0.15,
        Divergence: 0.05
      };
    }

    // Normalización matemática estricta para asegurar que la suma es exactamente 1.00
    const sumaPesos = Object.values(weights).reduce((a, b) => a + b, 0);
    const pesosNormalizados: Record<string, number> = {};
    for (const [key, val] of Object.entries(weights)) {
      pesosNormalizados[key] = Number((val / sumaPesos).toFixed(4));
    }

    // 2. Ajuste dinámico de Kelly (Fraccional)
    // El estándar prudente es 1/8-Kelly (8). Si el rendimiento es óptimo subimos a Quarter-Kelly (4).
    // Si caemos en racha de pérdidas o Sharpe deficiente, nos contraemos a 1/16-Kelly (16).
    let kellyFraction = 8;
    if (sharpe_ratio >= 1.8 && profit_factor >= 1.5 && max_drawdown_percentage < 6) {
      kellyFraction = 4; // Incremento controlado del tamaño por rendimiento estelar
    } else if (sharpe_ratio < 1.2 || profit_factor < 1.3 || max_drawdown_percentage > 10 || consecutiveLosses >= 3) {
      kellyFraction = 16; // Reducción drástica del riesgo para preservar capital
    }

    // 3. Calibrar Multiplicadores de ATR de Stops
    let stopLossMult = 1.5;
    let takeProfitMult = 3.0;

    if (regime === 'HIGH_VOLATILITY_CRASH') {
      stopLossMult = 1.2; // Stops de salida ultrarápida
      takeProfitMult = 4.5; // Aprovechar picos e ineficiencias de rebotes
    } else if (regime === 'MEAN_REVERTING') {
      stopLossMult = 2.0; // Evitar barridas de stops por ruido lateral
      takeProfitMult = 2.0; // Salidas prontas en resistencia
    }

    // Aplicar degradación defensiva si hay pérdidas consecutivas
    if (consecutiveLosses > 0) {
      stopLossMult = Number((stopLossMult * Math.max(0.7, degradationFactor)).toFixed(2));
    }

    // 4. Umbral de certeza decimal requerido por el Supervisor (min_confidence_threshold)
    let minConfidence = 0.65;
    if (sharpe_ratio < 1.2 || profit_factor < 1.3) {
      minConfidence = 0.75; // Exigimos mayor confianza ante condiciones de mercado adversas
    }
    minConfidence = Math.min(0.90, minConfidence + confidenceShift); // Añadir penalización por pérdidas

    // 5. Activación de bandera de suspensión temporal (suspension_flag)
    // Desconexión automática de seguridad si el Sharpe cae a niveles críticos (< 0.4) con operaciones realizadas,
    // o el drawdown global excede el 15%.
    let suspension = false;
    if (total_trades >= 5 && (sharpe_ratio < 0.4 || profit_factor < 0.85 || max_drawdown_percentage > 15.0)) {
      suspension = true;
      console.warn(`[AdaptiveIntelligenceEngine] [FALLBACK_CRÍTICO] Activando congelación temporal del motor. Sharpe: ${sharpe_ratio} | MaxDD: ${max_drawdown_percentage}%`);
    }

    return Object.freeze({
      market_regime: regime,
      classification_rationale: rationale,
      weights: Object.freeze(pesosNormalizados),
      adjusted_kelly_fraction: kellyFraction,
      atr_multipliers: Object.freeze({
        stop_loss: Number(stopLossMult.toFixed(2)),
        take_profit: Number(takeProfitMult.toFixed(2))
      }),
      min_confidence_threshold: Number(minConfidence.toFixed(2)),
      suspension_flag: suspension,
      timestamp: Date.now()
    });
  }

  /**
   * Persiste la propuesta adaptativa en la base de datos (Drizzle) e inyecta de forma
   * reactiva el nuevo estado en el Blackboard para su adopción inmediata.
   */
  public async commitAndPropagate(proposal: AdaptationProposal, symbol: string, timeframe: string): Promise<void> {
    console.log(`[AdaptiveIntelligenceEngine] Propagando propuesta adaptativa en el Fast-Loop para ${symbol}:${timeframe}...`);

    try {
      // 1. Guardar de forma detallada cada parámetro optimizado en learning_performance
      const metricasGrupales = [
        { key: 'weight_technical', val: proposal.weights.TechnicalAnalyst?.toString() || '0.25' },
        { key: 'weight_orderflow', val: proposal.weights.OrderFlow?.toString() || '0.20' },
        { key: 'weight_divergence', val: proposal.weights.Divergence?.toString() || '0.10' },
        { key: 'kelly_fraction', val: proposal.adjusted_kelly_fraction.toString() },
        { key: 'atr_stop_loss', val: proposal.atr_multipliers.stop_loss.toString() },
        { key: 'atr_take_profit', val: proposal.atr_multipliers.take_profit.toString() },
        { key: 'min_confidence_threshold', val: proposal.min_confidence_threshold.toString() },
        { key: 'suspension_flag', val: proposal.suspension_flag ? 'true' : 'false' }
      ];

      for (const metrica of metricasGrupales) {
        await db.insert(learningPerformance).values({
          symbol,
          agentName: 'Learning',
          parameterKey: metrica.key,
          parameterValue: metrica.val,
          performanceMetric: 'market_regime_tuning',
          metricValue: proposal.timestamp.toString()
        });
      }

      // 2. Persistir permanentemente de forma centralizada en la configuración global de riesgo (settings)
      const globalSettings = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'global_risk_limits'))
        .limit(1);

      if (globalSettings && globalSettings.length > 0) {
        const currentVal = globalSettings[0].value as Record<string, any>;
        const newVal = {
          ...currentVal,
          kellyFraction: proposal.adjusted_kelly_fraction,
          minConfidenceThreshold: proposal.min_confidence_threshold,
          weights: proposal.weights,
          atrMultipliers: proposal.atr_multipliers,
          suspensionFlag: proposal.suspension_flag,
          marketRegime: proposal.market_regime,
          lastTuningTimestamp: proposal.timestamp
        };

        await db
          .update(settings)
          .set({
            value: newVal,
            updatedAt: new Date()
          })
          .where(eq(settings.id, globalSettings[0].id));
        
        console.log(`[AdaptiveIntelligenceEngine] DB settings actualizada: 'global_risk_limits' sincronizada.`);
      }

      // 3. Insertar registro auditado formal
      await db.insert(auditLogs).values({
        agentName: 'Learning',
        level: proposal.suspension_flag ? 'WARN' : 'INFO',
        message: `Auto-Tuning completo: Calibración dinámica aplicada para régimen ${proposal.market_regime}.`,
        payload: proposal as any
      });

      // 4. Inyección atómica reactiva en el Blackboard como evaluación del agente 'Learning'
      const learningAssessment: AgentAssessment = {
        agentName: 'Learning',
        timestamp: proposal.timestamp,
        score: proposal.suspension_flag ? -100 : 100, // -100 si está suspendido, +100 operativo normal
        confidence: 1.0,
        data: {
          adaptationProposal: proposal
        },
        justification: `Calibración evolutiva para régimen de mercado ${proposal.market_regime}. Rationale: ${proposal.classification_rationale}`
      };

      // Guardado con TTL indefinido (0) en la pizarra para adopción reactiva
      this.blackboard.writeAssessment(symbol, timeframe, learningAssessment, 0);

      console.log(`[AdaptiveIntelligenceEngine] Propagación completa de la propuesta adaptativa en Blackboard [OK].`);

    } catch (err) {
      console.error(`[AdaptiveIntelligenceEngine] Error crítico durante la persistencia y propagación de la propuesta adaptativa:`, err);
      throw err;
    }
  }
}
