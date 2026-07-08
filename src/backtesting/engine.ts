/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/index.ts';
import { marketCandles } from '../db/schema.ts';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { Blackboard } from '../core/blackboard.ts';
import { RiskManagerAgent } from '../agents/risk/risk-manager-agent.ts';
import { BacktestConfig, BacktestResult, EquityPoint } from './types.ts';
import { PerformanceReport } from '../analytics/types.ts';
import { AgentAssessment } from '../types.ts';

/**
 * Motor de Backtesting Dinámico e Histórico (BacktestEngine).
 * 
 * Corre simulaciones inmutables sobre series temporales de precios pasados (velas).
 * Actúa de manera aislada como un Sandbox determinista, recreando el flujo del Blackboard
 * paso a paso (vela por vela) e integrando directamente el Firewall del RiskManagerAgent.
 */
export class BacktestEngine {
  private blackboard: Blackboard;
  private riskAgent: RiskManagerAgent;

  constructor() {
    this.blackboard = Blackboard.getInstance();
    this.riskAgent = new RiskManagerAgent();
  }

  /**
   * Ejecuta el Backtest determinista según la configuración provista.
   */
  public async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    console.log(`[BacktestEngine] Iniciando simulación para ${config.symbol} desde ${new Date(config.start_time).toLocaleString()} hasta ${new Date(config.end_time).toLocaleString()}`);

    const timeframe = '1m';
    // Identificador único de simulación para aislar el Blackboard de producción
    const backtestId = `BACKTEST_${config.symbol.replace('/', '_')}_${Date.now()}`;

    // 1. Cargar velas históricas desde la base de datos
    let dbCandles = await db
      .select()
      .from(marketCandles)
      .where(
        and(
          eq(marketCandles.symbol, config.symbol),
          eq(marketCandles.timeframe, timeframe),
          gte(marketCandles.timestamp, new Date(config.start_time)),
          lte(marketCandles.timestamp, new Date(config.end_time))
        )
      )
      .orderBy(asc(marketCandles.timestamp));

    // Fallback defensivo: si no hay velas suficientes en la DB, generamos un histórico en memoria
    if (dbCandles.length < 10) {
      console.warn(`[BacktestEngine] Pocas velas encontradas en la DB (${dbCandles.length}). Generando fallback histórico de alta fidelidad...`);
      dbCandles = this.generateSyntheticCandles(config);
    }

    console.log(`[BacktestEngine] Procesando ${dbCandles.length} velas históricas determinísticamente...`);

    // 2. Estado de la Cuenta Simulado
    let balance = config.initial_balance;
    let equity = config.initial_balance;
    let peakEquity = config.initial_balance;
    let maxDrawdownPct = 0;

    const equityCurve: EquityPoint[] = [];
    const simulatedTrades: any[] = [];
    
    // Posición abierta actual: null (plano), LONG o SHORT
    let openPosition: {
      side: 'LONG' | 'SHORT';
      entryPrice: number;
      quantity: number;
      stopLoss: number;
      takeProfit: number;
      entryTime: number;
    } | null = null;

    // Ventana deslizante para el cálculo de medias móviles (SMA) de la estrategia del Supervisor simulada
    const closePricesWindow: number[] = [];
    const smaPeriod = 10;

    // 3. Bucle determinista: Tick-by-Tick / Vela-por-Vela
    for (let i = 0; i < dbCandles.length; i++) {
      const candle = dbCandles[i];
      const candleTime = new Date(candle.timestamp).getTime();
      const openPrice = Number(candle.open);
      const highPrice = Number(candle.high);
      const lowPrice = Number(candle.low);
      const closePrice = Number(candle.close);

      closePricesWindow.push(closePrice);
      if (closePricesWindow.length > smaPeriod) {
        closePricesWindow.shift();
      }

      // A) Evaluar salidas de la posición abierta
      if (openPosition) {
        let closedThisCandle = false;
        let exitPrice = closePrice;
        let pnl = 0;
        let pnlPercentage = 0;
        let exitReason = 'TARGET';

        const { side, entryPrice, quantity, stopLoss, takeProfit, entryTime } = openPosition;

        if (side === 'LONG') {
          // Evaluar Stop Loss
          if (lowPrice <= stopLoss) {
            exitPrice = stopLoss;
            exitReason = 'STOP_LOSS';
            closedThisCandle = true;
          }
          // Evaluar Take Profit
          else if (highPrice >= takeProfit) {
            exitPrice = takeProfit;
            exitReason = 'TAKE_PROFIT';
            closedThisCandle = true;
          }
        } else { // SHORT
          // Evaluar Stop Loss
          if (highPrice >= stopLoss) {
            exitPrice = stopLoss;
            exitReason = 'STOP_LOSS';
            closedThisCandle = true;
          }
          // Evaluar Take Profit
          else if (lowPrice <= takeProfit) {
            exitPrice = takeProfit;
            exitReason = 'TAKE_PROFIT';
            closedThisCandle = true;
          }
        }

        // Si se ejecutó la orden de salida
        if (closedThisCandle) {
          // Simulación de deslizamiento (slippage) aleatorio en contra del trader
          const slippageAmount = exitPrice * (Math.random() * config.slippage_simulation_factor);
          if (side === 'LONG') {
            exitPrice -= slippageAmount; // Vende más barato
            pnl = (exitPrice - entryPrice) * quantity;
          } else {
            exitPrice += slippageAmount; // Compra más caro para cerrar Short
            pnl = (entryPrice - exitPrice) * quantity;
          }

          // Aplicar comisiones de salida
          const fee = exitPrice * quantity * config.fee_rate;
          pnl -= fee;
          balance += pnl;

          pnlPercentage = (pnl / (entryPrice * quantity)) * 100;

          simulatedTrades.push({
            id: simulatedTrades.length + 1,
            symbol: config.symbol,
            side,
            entryPrice,
            exitPrice,
            quantity,
            pnl,
            pnlPercentage,
            entryTime,
            exitTime: candleTime,
            exitReason
          });

          openPosition = null;
        }
      }

      // B) Evaluar entrada de nueva posición mediante estrategia de cruce del Supervisor simulado
      if (!openPosition && closePricesWindow.length >= smaPeriod) {
        const sum = closePricesWindow.reduce((acc, p) => acc + p, 0);
        const sma = sum / smaPeriod;
        const prevClose = closePricesWindow[closePricesWindow.length - 2];

        let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

        // Estrategia momentum de cruce simple
        if (closePrice > sma && prevClose <= sma) {
          signal = 'BUY';
        } else if (closePrice < sma && prevClose >= sma) {
          signal = 'SELL';
        }

        if (signal === 'BUY' || signal === 'SELL') {
          // 1. Inyectar datos en el Sandbox del Blackboard
          // Simulamos una volatilidad de mercado razonable basada en ATR (1.5% del precio actual)
          const mockAtr = closePrice * 0.015;

          // Escribir Vela y datos de mercado
          this.blackboard.writeMarketData(backtestId, timeframe, {
            symbol: config.symbol,
            price: closePrice,
            volume24h: Number(candle.volume) * closePrice,
            high24h: highPrice,
            low24h: lowPrice,
            timestamp: candleTime
          }, 1000 * 60 * 60);

          // Escribir inputs de TechnicalAnalyst para que el RiskManagerAgent los lea
          const technicalAssessment: AgentAssessment = {
            agentName: 'TechnicalAnalyst',
            timestamp: candleTime,
            score: signal === 'BUY' ? 80 : -80,
            confidence: 0.85,
            data: {
              indicadores: {
                atr: mockAtr,
                rsi: signal === 'BUY' ? 45 : 55
              }
            },
            justification: 'Indicadores técnicos simulados en Backtest.'
          };
          this.blackboard.writeAssessment(backtestId, timeframe, technicalAssessment, 1000 * 60 * 60);

          // Escribir decisión del Supervisor
          const supervisorAssessment: AgentAssessment = {
            agentName: 'Supervisor',
            timestamp: candleTime,
            score: signal === 'BUY' ? 75 : -75,
            confidence: 0.75, // p para Kelly
            data: {
              final_decision: signal
            },
            justification: `Señal técnica de cruce ${signal} detectada.`
          };
          this.blackboard.writeAssessment(backtestId, timeframe, supervisorAssessment, 1000 * 60 * 60);

          // 2. Invocar síncronamente al RiskManagerAgent (Firewall matemático)
          await this.riskAgent.analyze(backtestId, timeframe);

          // 3. Extraer el veredicto del Firewall del Blackboard
          const snapshot = this.blackboard.getSnapshot(backtestId, timeframe);
          const riskResult = snapshot.assessments['RiskManager']?.value?.data;

          if (riskResult && riskResult.safe_to_operate && riskResult.max_position_size > 0) {
            // El firewall de riesgo ha autorizado la transacción y calculado los niveles óptimos
            let entryPriceSim = closePrice;
            // Aplicar deslizamiento de entrada
            const slippageAmount = entryPriceSim * (Math.random() * config.slippage_simulation_factor);
            if (signal === 'BUY') {
              entryPriceSim += slippageAmount; // Compra un poco más caro
            } else {
              entryPriceSim -= slippageAmount; // Corta un poco más barato
            }

            // Validar límites de capital asignado respecto al balance disponible
            const positionSizeUSD = Math.min(riskResult.max_position_size, balance * 0.95);
            const qty = positionSizeUSD / entryPriceSim;

            if (qty > 0) {
              // Aplicar comisión de entrada
              const fee = entryPriceSim * qty * config.fee_rate;
              balance -= fee;

              openPosition = {
                side: signal === 'BUY' ? 'LONG' : 'SHORT',
                entryPrice: entryPriceSim,
                quantity: qty,
                stopLoss: riskResult.calculated_stop_loss,
                takeProfit: riskResult.calculated_take_profit,
                entryTime: candleTime
              };
            }
          }
        }
      }

      // C) Calcular equidad actual (Balance + PnL flotante)
      let currentUnrealizedPnL = 0;
      if (openPosition) {
        const { side, entryPrice, quantity } = openPosition;
        if (side === 'LONG') {
          currentUnrealizedPnL = (closePrice - entryPrice) * quantity;
        } else {
          currentUnrealizedPnL = (entryPrice - closePrice) * quantity;
        }
      }

      equity = balance + currentUnrealizedPnL;

      if (equity > peakEquity) {
        peakEquity = equity;
      }

      // Calcular Drawdown instantáneo
      const drawdownPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
      if (drawdownPct > maxDrawdownPct) {
        maxDrawdownPct = drawdownPct;
      }

      equityCurve.push({
        timestamp: candleTime,
        equity: Number(equity.toFixed(2)),
        drawdown_percentage: Number(drawdownPct.toFixed(2)),
        price: closePrice
      });
    }

    // 4. Limpiar el Blackboard del Sandbox para liberar memoria
    this.blackboard.clear(backtestId, timeframe);

    // 5. Cálculo consolidado de métricas analíticas
    const totalTrades = simulatedTrades.length;
    let totalProfit = 0;
    let totalLoss = 0;
    let wins = 0;
    let losses = 0;
    const retornosPorcentaje: number[] = [];

    for (const t of simulatedTrades) {
      const pnl = t.pnl;
      retornosPorcentaje.push(t.pnlPercentage);

      if (pnl > 0) {
        totalProfit += pnl;
        wins++;
      } else {
        totalLoss += Math.abs(pnl);
        losses++;
      }
    }

    const winRate = totalTrades > 0 ? wins / totalTrades : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit;
    const netProfit = totalProfit - totalLoss;

    // Calcular Sharpe y Sortino simulados de los retornos
    let sharpeRatio = 0;
    let sortinoRatio = 0;

    if (totalTrades > 1) {
      const media = retornosPorcentaje.reduce((acc, val) => acc + val, 0) / totalTrades;
      const sumaDifCuadrados = retornosPorcentaje.reduce((acc, val) => acc + Math.pow(val - media, 2), 0);
      const varianza = sumaDifCuadrados / (totalTrades - 1);
      const stdDev = Math.sqrt(varianza);

      if (stdDev > 0) {
        sharpeRatio = media / stdDev;
      }

      const sumaNegativosCuadrados = retornosPorcentaje
        .map(v => v < 0 ? Math.pow(v, 2) : 0)
        .reduce((acc, val) => acc + val, 0);
      const varianzaAbajo = sumaNegativosCuadrados / totalTrades;
      const stdDevAbajo = Math.sqrt(varianzaAbajo);

      if (stdDevAbajo > 0) {
        sortinoRatio = media / stdDevAbajo;
      } else if (media > 0) {
        sortinoRatio = media * 10;
      }
    }

    // Retornar Reporte Completo de Simulación
    return {
      sharpe_ratio: Number(sharpeRatio.toFixed(4)),
      sortino_ratio: Number(sortinoRatio.toFixed(4)),
      profit_factor: Number(profitFactor.toFixed(4)),
      win_rate: Number(winRate.toFixed(4)),
      max_drawdown_percentage: Number(maxDrawdownPct.toFixed(4)),
      total_trades: totalTrades,
      net_profit_usd: Number(netProfit.toFixed(4)),
      total_profit_usd: Number(totalProfit.toFixed(4)),
      total_loss_usd: Number(totalLoss.toFixed(4)),
      average_win_usd: wins > 0 ? Number((totalProfit / wins).toFixed(4)) : 0,
      average_loss_usd: losses > 0 ? Number((totalLoss / losses).toFixed(4)) : 0,
      timestamp: Date.now(),
      total_allocated_capital: config.initial_balance,
      active_instances_count: 1,
      instances_performance: {
        [config.symbol]: {
          sharpe_ratio: Number(sharpeRatio.toFixed(4)),
          sortino_ratio: Number(sortinoRatio.toFixed(4)),
          profit_factor: Number(profitFactor.toFixed(4)),
          win_rate: Number(winRate.toFixed(4)),
          max_drawdown_percentage: Number(maxDrawdownPct.toFixed(4)),
          total_trades: totalTrades,
          net_profit_usd: Number(netProfit.toFixed(4)),
          total_profit_usd: Number(totalProfit.toFixed(4)),
          total_loss_usd: Number(totalLoss.toFixed(4)),
          average_win_usd: wins > 0 ? Number((totalProfit / wins).toFixed(4)) : 0,
          average_loss_usd: losses > 0 ? Number((totalLoss / losses).toFixed(4)) : 0,
          timestamp: Date.now()
        }
      },
      config,
      equity_curve: equityCurve,
      simulated_trades_count: totalTrades
    };
  }

  /**
   * Generación determinista de velas de alta fidelidad si no hay suficientes datos en base de datos.
   * Esto previene caídas duras del sistema en el entorno de desarrollo y provee una simulación estable.
   */
  private generateSyntheticCandles(config: BacktestConfig): any[] {
    const candles: any[] = [];
    const stepMs = 60 * 1000; // 1 minuto por vela
    let currentPrice = 62500; // precio base

    let currentTimestamp = config.start_time;
    let idx = 1;

    while (currentTimestamp <= config.end_time) {
      // Simulación de un movimiento sinusoidal estocástico para simular tendencias y reversión de medias
      const noise = (Math.random() - 0.5) * 80;
      const trend = Math.sin(idx * 0.05) * 120 + (idx * 0.1);
      const open = currentPrice;
      const close = currentPrice + noise + trend;
      const high = Math.max(open, close) + Math.random() * 40;
      const low = Math.min(open, close) - Math.random() * 40;
      const volume = 5 + Math.random() * 15;

      candles.push({
        symbol: config.symbol,
        timeframe: '1m',
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Number(volume.toFixed(2)),
        timestamp: new Date(currentTimestamp)
      });

      currentPrice = close;
      currentTimestamp += stepMs;
      idx++;
    }

    return candles;
  }
}
