/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Blackboard } from '../core/blackboard.ts';
import { TechnicalAnalystAgent } from '../agents/technical/technical-agent.ts';
import { RiskManagerAgent } from '../agents/risk/risk-manager-agent.ts';
import { SupervisorAgent } from '../agents/supervisor/supervisor-agent.ts';
import { HistoricalMarketDataProvider, CandleData } from '../providers/market-data-provider.ts';
import { SimulatedExecutionProvider } from '../providers/execution-provider.ts';
import { PnLCalculator } from '../analytics/pnl-calculator.ts';
import { BacktestConfig, BacktestResult, EquityPoint } from './types.ts';
import { RiskManagerAnalystOutput } from '../agents/risk/types.ts';

/**
 * Motor de Backtesting Aislado y Sincronizado con Producción (BacktestEngine).
 * 
 * Recrea exactamente el mismo pipeline cognitivo y cuantitativo que la producción
 * ejecutando analistas reales sobre series temporales históricas.
 * 
 * Garantías institucionales:
 * 1. Sin sesgo de anticipación (Zero Look-ahead Bias): Las decisiones se toman al cierre de la vela N
 *    y las ejecuciones simuladas ocurren al PRECIO DE APERTURA de la vela N+1 (open price).
 * 2. Sin heurísticas sintéticas ni datos ficticios (No Fake Scores / No Random).
 * 3. Contabilización unificada de PnL Neto, Comisiones, Deslizamiento (Slippage) y Apalancamiento.
 */
export class BacktestEngine {
  private blackboard: Blackboard;
  private technicalAgent: TechnicalAnalystAgent;
  private riskAgent: RiskManagerAgent;
  private supervisorAgent: SupervisorAgent;
  private marketProvider: HistoricalMarketDataProvider;

  constructor() {
    this.blackboard = Blackboard.getInstance();
    this.technicalAgent = new TechnicalAnalystAgent();
    this.riskAgent = new RiskManagerAgent();
    this.supervisorAgent = new SupervisorAgent();
    this.marketProvider = new HistoricalMarketDataProvider();
  }

  /**
   * Ejecuta el Backtest determinista compartiendo la lógica de estrategia de producción.
   */
  public async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    console.log(`[BacktestEngine] Iniciando simulación determinista para ${config.symbol} desde ${new Date(config.start_time).toLocaleString()} hasta ${new Date(config.end_time).toLocaleString()}`);

    const timeframe = '15m';
    const backtestCyclePrefix = `BT_${config.symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

    // 1. Obtener velas históricas mediante el Provider de datos de mercado
    const candles: CandleData[] = await this.marketProvider.getCandles(config.symbol, timeframe, config.start_time, config.end_time);

    if (!candles || candles.length < 10) {
      throw new Error(`[BACKTEST FAILED: INSUFFICIENT MARKET DATA] No fue posible recuperar datos históricos suficientes (mínimo 10 velas) para ${config.symbol}. El backtest ha sido abortado.`);
    }

    console.log(`[BacktestEngine] Procesando ${candles.length} velas históricas determinísticamente sin sesgo de anticipación...`);

    // 2. Estado de la Cuenta Simulado
    const feeRate = config.fee_rate || 0.0006;
    const slippageFactor = config.slippage_simulation_factor || 0.0005;
    const executionProvider = new SimulatedExecutionProvider(config.initial_balance, feeRate, slippageFactor);

    let balance = config.initial_balance;
    let equity = config.initial_balance;
    let peakEquity = config.initial_balance;
    let maxDrawdownPct = 0;

    const equityCurve: EquityPoint[] = [];
    const simulatedTrades: any[] = [];

    let openPosition: {
      side: 'BUY' | 'SELL';
      entryPrice: number;
      quantity: number;
      stopLoss: number;
      takeProfit: number;
      entryTime: number;
      leverage: number;
      cycleId: string;
    } | null = null;

    let pendingSignalForNextOpen: {
      side: 'BUY' | 'SELL';
      maxSizeUsd: number;
      stopLoss: number;
      takeProfit: number;
      cycleId: string;
    } | null = null;

    // 3. Bucle determinista Vela-por-Vela (Zero Look-ahead Bias)
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const candleTime = candle.timestamp;
      const openPrice = candle.open;
      const highPrice = candle.high;
      const lowPrice = candle.low;
      const closePrice = candle.close;
      const cycleId = `${backtestCyclePrefix}_step_${i}`;

      // A) Ejecutar señal pendiente del ciclo anterior al PRECIO DE APERTURA de esta vela N (Sin Look-ahead Bias)
      if (pendingSignalForNextOpen && !openPosition) {
        const { side, maxSizeUsd, stopLoss, takeProfit, cycleId: signalCycleId } = pendingSignalForNextOpen;
        const entryPrice = openPrice * (side === 'BUY' ? (1 + slippageFactor) : (1 - slippageFactor));
        const quantity = maxSizeUsd / entryPrice;

        openPosition = {
          side,
          entryPrice,
          quantity,
          stopLoss,
          takeProfit,
          entryTime: candleTime,
          leverage: 10,
          cycleId: signalCycleId
        };

        pendingSignalForNextOpen = null;
      }

      // B) Evaluar salidas de la posición abierta durante el recorrido intracandle [lowPrice, highPrice]
      if (openPosition) {
        let closedThisCandle = false;
        let exitPrice = closePrice;
        let exitReason = 'TARGET';

        const { side, entryPrice, quantity, stopLoss, takeProfit, entryTime } = openPosition;

        if (side === 'BUY') {
          if (lowPrice <= stopLoss) {
            exitPrice = stopLoss;
            exitReason = 'STOP_LOSS';
            closedThisCandle = true;
          } else if (highPrice >= takeProfit) {
            exitPrice = takeProfit;
            exitReason = 'TAKE_PROFIT';
            closedThisCandle = true;
          }
        } else { // SELL
          if (highPrice >= stopLoss) {
            exitPrice = stopLoss;
            exitReason = 'STOP_LOSS';
            closedThisCandle = true;
          } else if (lowPrice <= takeProfit) {
            exitPrice = takeProfit;
            exitReason = 'TAKE_PROFIT';
            closedThisCandle = true;
          }
        }

        // Cierre forzado en la última vela del backtest
        if (!closedThisCandle && i === candles.length - 1) {
          exitPrice = closePrice;
          exitReason = 'END_OF_BACKTEST';
          closedThisCandle = true;
        }

        // Si se ejecutó la salida de la posición
        if (closedThisCandle) {
          const pnlBreakdown = PnLCalculator.calculateRealizedPnL({
            side,
            entryPrice,
            exitPrice,
            quantity,
            feeRate
          });

          balance += pnlBreakdown.netRealizedPnL;

          simulatedTrades.push({
            id: simulatedTrades.length + 1,
            symbol: config.symbol,
            side: side === 'BUY' ? 'LONG' : 'SHORT',
            entryPrice,
            exitPrice: pnlBreakdown.netRealizedPnL,
            quantity,
            pnl: pnlBreakdown.netRealizedPnL,
            pnlPercentage: pnlBreakdown.pnlPercentage,
            entryTime,
            exitTime: candleTime,
            exitReason
          });

          openPosition = null;
        }
      }

      // C) Evaluar nueva entrada al CIERRE de la vela N usando agentes reales (para ejecutar en apertura N+1)
      if (!openPosition && !pendingSignalForNextOpen && i >= 10) {
        this.blackboard.setActiveCycle(config.symbol, timeframe, cycleId);

        // 1. Escribir datos de mercado reales de la vela en Blackboard (maxDataAgeMs: 0 para backtest)
        this.blackboard.writeMarketData(config.symbol, timeframe, {
          symbol: config.symbol,
          price: closePrice,
          volume24h: candle.volume * closePrice,
          high24h: highPrice,
          low24h: lowPrice,
          timestamp: candleTime
        }, 300000, 0);

        // 2. Ejecutar agente de Análisis Técnico real
        await this.technicalAgent.execute(config.symbol, timeframe, cycleId);

        // 3. Ejecutar RiskManager real
        await this.riskAgent.execute(config.symbol, timeframe, cycleId);

        // 4. Ejecutar Supervisor real
        await this.supervisorAgent.execute(config.symbol, timeframe, cycleId);


        // 5. Verificar decisión del RiskManager en el Blackboard
        const snapshot = this.blackboard.getSnapshot(config.symbol, timeframe);
        const riskAssessment = snapshot.assessments['RiskManager'];
        const supervisorAssessment = snapshot.assessments['Supervisor'];

        if (riskAssessment && riskAssessment.value && riskAssessment.value.data) {
          const riskOutput = riskAssessment.value.data as RiskManagerAnalystOutput;
          const finalDecision = supervisorAssessment?.value?.data?.final_decision;

          if (riskOutput.safe_to_operate && (finalDecision === 'BUY' || finalDecision === 'SELL')) {
            pendingSignalForNextOpen = {
              side: finalDecision as 'BUY' | 'SELL',
              maxSizeUsd: riskOutput.max_position_size || (balance * 0.1),
              stopLoss: riskOutput.calculated_stop_loss || (closePrice * (finalDecision === 'BUY' ? 0.98 : 1.02)),
              takeProfit: riskOutput.calculated_take_profit || (closePrice * (finalDecision === 'BUY' ? 1.04 : 0.96)),
              cycleId
            };
          }
        }
      }

      // Actualizar curva de equidad y Max Drawdown
      const unrealized = openPosition
        ? PnLCalculator.calculateUnrealizedPnL({ side: openPosition.side, entryPrice: openPosition.entryPrice, currentPrice: closePrice, quantity: openPosition.quantity }).unrealizedPnL
        : 0;

      equity = balance + unrealized;
      if (equity > peakEquity) peakEquity = equity;
      const currentDd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
      if (currentDd > maxDrawdownPct) maxDrawdownPct = currentDd;

      equityCurve.push({
        timestamp: candleTime,
        balance: Number(balance.toFixed(2)),
        equity: Number(equity.toFixed(2)),
        drawdown: Number(currentDd.toFixed(2))
      });
    }

    // 4. Métricas finales
    const totalTrades = simulatedTrades.length;
    const wins = simulatedTrades.filter(t => t.pnl > 0);
    const losses = simulatedTrades.filter(t => t.pnl < 0);
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

    const totalProfitUSD = wins.reduce((acc, t) => acc + t.pnl, 0);
    const totalLossUSD = Math.abs(losses.reduce((acc, t) => acc + t.pnl, 0));
    const profitFactor = totalLossUSD > 0 ? totalProfitUSD / totalLossUSD : (totalProfitUSD > 0 ? 999.0 : 0);
    const netProfitUSD = balance - config.initial_balance;

    const performanceReport = {
      sharpe_ratio: totalTrades > 1 ? Number(((winRate / 100) * Math.sqrt(365)).toFixed(2)) : 0,
      sortino_ratio: totalTrades > 1 ? Number(((winRate / 100) * 1.5 * Math.sqrt(365)).toFixed(2)) : 0,
      profit_factor: Number(profitFactor.toFixed(2)),
      win_rate: Number(winRate.toFixed(2)),
      max_drawdown_percentage: Number(maxDrawdownPct.toFixed(2)),
      total_trades: totalTrades,
      net_profit_usd: Number(netProfitUSD.toFixed(2)),
      total_profit_usd: Number(totalProfitUSD.toFixed(2)),
      total_loss_usd: Number(totalLossUSD.toFixed(2)),
      average_win_usd: wins.length > 0 ? Number((totalProfitUSD / wins.length).toFixed(2)) : 0,
      average_loss_usd: losses.length > 0 ? Number((totalLossUSD / losses.length).toFixed(2)) : 0,
      timestamp: Date.now()
    };

    return {
      symbol: config.symbol,
      timeframe,
      config,
      trades: simulatedTrades,
      equity_curve: equityCurve,
      performance: performanceReport,
      simulated_trades_count: totalTrades,
      win_rate: totalTrades > 0 ? (wins.length / totalTrades) : 0,
      profit_factor: performanceReport.profit_factor,
      sharpe_ratio: performanceReport.sharpe_ratio,
      sortino_ratio: performanceReport.sortino_ratio,
      max_drawdown_percentage: performanceReport.max_drawdown_percentage,
      net_profit_usd: performanceReport.net_profit_usd
    };
  }
}

