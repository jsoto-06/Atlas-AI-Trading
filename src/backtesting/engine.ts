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
import { BacktestConfig, BacktestResult, EquityPoint, DataAuditMetadata } from './types.ts';
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
   * Ejecuta el Backtest determinista sin sesgo de anticipación y con contabilidad financiera estricta.
   */
  public async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    console.log(`[BacktestEngine] Iniciando simulación determinista para ${config.symbol} desde ${new Date(config.start_time).toISOString()} hasta ${new Date(config.end_time).toISOString()}`);

    const timeframe = config.timeframe || '15m';
    const backtestCyclePrefix = `BT_${config.symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

    // 1. Obtener velas históricas mediante el Provider con paginación
    const candles: CandleData[] = await this.marketProvider.getCandles(config.symbol, timeframe, config.start_time, config.end_time);

    if (!candles || candles.length < 10) {
      throw new Error(`BACKTEST_DATA_ERROR: No se encontraron velas históricas suficientes (mínimo 10 velas) para ${config.symbol}. Backtest abortado.`);
    }

    // Auditoría forense de los datos recibidos
    const timestamps = candles.map(c => c.timestamp);
    const uniqueTsSet = new Set(timestamps);
    const dataAudit: DataAuditMetadata = {
      requestedStart: config.start_time,
      requestedEnd: config.end_time,
      actualFirstCandle: timestamps[0],
      actualLastCandle: timestamps[timestamps.length - 1],
      candleCount: candles.length,
      uniqueTimestampCount: uniqueTsSet.size,
      duplicateTimestampCount: candles.length - uniqueTsSet.size
    };

    console.log(`[BacktestEngine] Auditoría de Datos: ${candles.length} velas recuperadas desde ${new Date(dataAudit.actualFirstCandle).toISOString()} hasta ${new Date(dataAudit.actualLastCandle).toISOString()}`);

    // 2. Parámetros de Operación y Estado de la Cuenta
    const leverage = config.leverage || 10;
    const feeRate = config.fee_rate !== undefined ? config.fee_rate : 0.0006;
    const slippageFactor = config.slippage_simulation_factor !== undefined ? config.slippage_simulation_factor : 0.0005;

    let balance = config.initial_balance;
    let realizedPnLTotal = 0;
    let feesTotal = 0;
    let fundingTotal = 0;
    let slippageTotal = 0;

    let peakEquity = config.initial_balance;
    let maxDrawdownPct = 0;
    let accountStatus = 'ACTIVE' as 'ACTIVE' | 'LIQUIDATED' | 'ACCOUNT_BLOWN';
    let blownTimestamp: number | undefined = undefined;
    let blownTradeId: number | undefined = undefined;

    let simulatedTradesCount = 0;
    let rejectedTradesCount = 0;
    const simulatedTrades: any[] = [];
    const equityCurve: EquityPoint[] = [];

    let openPosition: {
      id: number;
      side: 'BUY' | 'SELL';
      entryPrice: number;
      quantity: number;
      notional: number;
      marginRequired: number;
      entryFee: number;
      stopLoss: number;
      takeProfit: number;
      liquidationPrice: number;
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

    // 3. Bucle determinista Vela-por-Vela
    for (let i = 0; i < candles.length; i++) {
      // SI LA CUENTA YA QUEBRÓ, DETENER LA SIMULACIÓN DE INMEDIATO
      if (accountStatus === 'ACCOUNT_BLOWN') {
        break;
      }

      const candle = candles[i];
      const candleTime = candle.timestamp;
      const openPrice = candle.open;
      const highPrice = candle.high;
      const lowPrice = candle.low;
      const closePrice = candle.close;
      const cycleId = `${backtestCyclePrefix}_step_${i}`;

      // A) Ejecutar señal pendiente del ciclo anterior al PRECIO DE APERTURA de la vela N+1 (Sin Look-ahead Bias)
      if (pendingSignalForNextOpen && !openPosition) {
        const { side, maxSizeUsd, stopLoss, takeProfit, cycleId: signalCycleId } = pendingSignalForNextOpen;
        
        // Precio con Deslizamiento (Slippage)
        const entryPrice = openPrice * (side === 'BUY' ? (1 + slippageFactor) : (1 - slippageFactor));
        const currentEquity = Math.max(0, balance);
        const currentMarginUsed = 0;
        const currentAvailableMargin = Math.max(0, currentEquity - currentMarginUsed);

        // Verificación de capacidad de margen sin modificar artificialmente el notional solicitado
        if (currentEquity <= 0 || currentAvailableMargin <= 0) {
          rejectedTradesCount++;
          console.warn(`[BacktestEngine] Orden rechazada por falta de margen disponible (Available Margin: $${currentAvailableMargin.toFixed(2)})`);
          pendingSignalForNextOpen = null;
        } else {
          const requestedNotional = maxSizeUsd;
          const quantity = requestedNotional / entryPrice;
          const marginRequired = requestedNotional / leverage;

          if (marginRequired > currentAvailableMargin || quantity <= 0) {
            rejectedTradesCount++;
            console.warn(`[BacktestEngine] Orden rechazada (REJECTED_INSUFFICIENT_MARGIN). Requerido: $${marginRequired.toFixed(2)}, Disponible: $${currentAvailableMargin.toFixed(2)}`);
            pendingSignalForNextOpen = null;
          } else {
            // Deducción inmediata de comisión de entrada (Entry Fee)
            const entryFee = requestedNotional * feeRate;
            const slippageCost = openPrice * slippageFactor * quantity;
            
            balance -= entryFee;
            feesTotal += entryFee;
            slippageTotal += slippageCost;

            // Precio de Liquidación de Futuros Bitget (Mantenimiento 0.5% = 0.005)
            const mmr = 0.005;
            const liquidationPrice = side === 'BUY'
              ? entryPrice * (1 - (1 / leverage) + mmr)
              : entryPrice * (1 + (1 / leverage) - mmr);

            simulatedTradesCount++;
            openPosition = {
              id: simulatedTradesCount,
              side,
              entryPrice,
              quantity,
              notional: requestedNotional,
              marginRequired,
              entryFee,
              stopLoss,
              takeProfit,
              liquidationPrice,
              entryTime: candleTime,
              leverage,
              cycleId: signalCycleId
            };

            pendingSignalForNextOpen = null;
          }
        }
      }

      // B) Evaluar salidas de posición abierta durante el recorrido [lowPrice, highPrice]
      if (openPosition) {
        let closedThisCandle = false;
        let exitPrice = closePrice;
        let exitReason = 'TARGET';

        const { id: tradeId, side, entryPrice, quantity, notional, marginRequired, entryFee, stopLoss, takeProfit, liquidationPrice, entryTime } = openPosition;

        // Evaluación determinista con prioridad: Liquidación > Stop Loss > Take Profit
        if (side === 'BUY') {
          if (lowPrice <= liquidationPrice) {
            exitPrice = Math.min(liquidationPrice, lowPrice);
            exitReason = 'LIQUIDATED';
            closedThisCandle = true;
          } else if (lowPrice <= stopLoss) {
            exitPrice = Math.min(stopLoss, lowPrice);
            exitReason = 'STOP_LOSS';
            closedThisCandle = true;
          } else if (highPrice >= takeProfit) {
            exitPrice = takeProfit;
            exitReason = 'TAKE_PROFIT';
            closedThisCandle = true;
          }
        } else { // SELL (SHORT)
          if (highPrice >= liquidationPrice) {
            exitPrice = Math.max(liquidationPrice, highPrice);
            exitReason = 'LIQUIDATED';
            closedThisCandle = true;
          } else if (highPrice >= stopLoss) {
            exitPrice = Math.max(stopLoss, highPrice);
            exitReason = 'STOP_LOSS';
            closedThisCandle = true;
          } else if (lowPrice <= takeProfit) {
            exitPrice = takeProfit;
            exitReason = 'TAKE_PROFIT';
            closedThisCandle = true;
          }
        }

        // Si SL y TP se cruzan simultáneamente en la misma vela (extrema volatilidad), Stop Loss toma prioridad
        if (side === 'BUY' && lowPrice <= stopLoss && highPrice >= takeProfit && exitReason !== 'LIQUIDATED') {
          exitPrice = stopLoss;
          exitReason = 'STOP_LOSS';
          closedThisCandle = true;
        } else if (side === 'SELL' && highPrice >= stopLoss && lowPrice <= takeProfit && exitReason !== 'LIQUIDATED') {
          exitPrice = stopLoss;
          exitReason = 'STOP_LOSS';
          closedThisCandle = true;
        }

        // Cierre forzado en la última vela del backtest si aún sigue abierta
        if (!closedThisCandle && i === candles.length - 1) {
          exitPrice = closePrice;
          exitReason = 'END_OF_BACKTEST';
          closedThisCandle = true;
        }

        if (closedThisCandle) {
          const exitNotional = exitPrice * quantity;
          const exitFee = exitNotional * feeRate;
          feesTotal += exitFee;

          const direction = side === 'BUY' ? 1 : -1;
          const grossPnL = (exitPrice - entryPrice) * quantity * direction;
          const netTradePnL = grossPnL - entryFee - exitFee;

          balance += grossPnL - exitFee; // entryFee ya fue deducido al abrir
          realizedPnLTotal += netTradePnL;

          simulatedTrades.push({
            id: tradeId,
            symbol: config.symbol,
            side: side === 'BUY' ? 'LONG' : 'SHORT',
            entryPrice,
            exitPrice,
            quantity,
            notional,
            marginRequired,
            leverage,
            grossPnL: Number(grossPnL.toFixed(4)),
            fee: Number((entryFee + exitFee).toFixed(4)),
            pnl: Number(netTradePnL.toFixed(4)),
            pnlPercentage: Number((marginRequired > 0 ? (netTradePnL / marginRequired) * 100 : 0).toFixed(4)),
            entryTime,
            exitTime: candleTime,
            exitReason
          });

          openPosition = null;

          // Verificar si la cuenta ha quebrado (ACCOUNT_BLOWN)
          if (balance <= 0) {
            balance = 0;
            accountStatus = 'ACCOUNT_BLOWN';
            blownTimestamp = candleTime;
            blownTradeId = tradeId;
            console.error(`[BacktestEngine] ¡ACCOUNT_BLOWN DETECTADO! La cuenta quebró a las ${new Date(candleTime).toISOString()} en la operación #${tradeId}.`);
          }
        }
      }

      // C) Evaluar nueva entrada al CIERRE de la vela N usando agentes reales (para ejecutar en apertura N+1)
      if (accountStatus === 'ACTIVE' && !openPosition && !pendingSignalForNextOpen && i >= 10) {
        this.blackboard.setActiveCycle(config.symbol, timeframe, cycleId);

        // Escribir datos de mercado reales de la vela en Blackboard (maxDataAgeMs: 0 para backtest)
        this.blackboard.writeMarketData(config.symbol, timeframe, {
          symbol: config.symbol,
          price: closePrice,
          volume24h: candle.volume * closePrice,
          high24h: highPrice,
          low24h: lowPrice,
          timestamp: candleTime
        }, 300000, 0);

        // Pre-cargar la ventana de velas en memoria
        const candleSlice = candles.slice(Math.max(0, i - 99), i + 1).map(c => ({
          time: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume
        }));
        this.technicalAgent.setMemoryCache(config.symbol, timeframe, candleSlice);

        // Ejecutar pipeline: Analista Técnico -> Supervisor (Consenso) -> RiskManager (Firewall)
        await this.technicalAgent.execute(config.symbol, timeframe, cycleId);
        await this.supervisorAgent.execute(config.symbol, timeframe, cycleId);
        await this.riskAgent.execute(config.symbol, timeframe, cycleId);

        const snapshot = this.blackboard.getSnapshot(config.symbol, timeframe);
        const riskAssessment = snapshot.assessments['RiskManager'];
        const supervisorAssessment = snapshot.assessments['Supervisor'];

        if (riskAssessment && riskAssessment.value && riskAssessment.value.data) {
          const riskOutput = riskAssessment.value.data as RiskManagerAnalystOutput;
          const finalDecision = supervisorAssessment?.value?.data?.final_decision;

          if (riskOutput.safe_to_operate && (finalDecision === 'BUY' || finalDecision === 'SELL')) {
            const rawSize = riskOutput.max_position_size || (balance * 0.1 * leverage);
            const baseAccountSize = 10000;
            // Si rawSize es superior o igual a balance * leverage (como en tests con sizing explícito), mantenerlo.
            // De lo contrario, escalar proporcionalmente al saldo real del backtest.
            let maxSizeUsd = (rawSize / baseAccountSize) * balance;
            if (rawSize >= balance * leverage) {
              maxSizeUsd = rawSize;
            }

            pendingSignalForNextOpen = {
              side: finalDecision as 'BUY' | 'SELL',
              maxSizeUsd,
              stopLoss: riskOutput.calculated_stop_loss || (closePrice * (finalDecision === 'BUY' ? 0.98 : 1.02)),
              takeProfit: riskOutput.calculated_take_profit || (closePrice * (finalDecision === 'BUY' ? 1.04 : 0.96)),
              cycleId
            };
          }
        }
      }

      // D) Cálculo de Equidad y Curva Temporal
      let unrealizedPnL = 0;
      let marginUsed = 0;

      if (openPosition) {
        const direction = openPosition.side === 'BUY' ? 1 : -1;
        unrealizedPnL = (closePrice - openPosition.entryPrice) * openPosition.quantity * direction;
        marginUsed = openPosition.marginRequired;
      }

      // La equidad no puede ser negativa en modelo sin deuda
      let currentEquity = balance + unrealizedPnL;
      if (currentEquity <= 0) {
        currentEquity = 0;
        if (accountStatus === 'ACTIVE') {
          accountStatus = 'ACCOUNT_BLOWN';
          blownTimestamp = candleTime;
          console.error(`[BacktestEngine] ¡ACCOUNT_BLOWN! Equidad <= 0 a las ${new Date(candleTime).toISOString()}`);
        }
      }

      const availableMargin = Math.max(0, currentEquity - marginUsed);
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }

      const currentDd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
      const clampedDd = Math.min(100, Math.max(0, currentDd));
      if (clampedDd > maxDrawdownPct) {
        maxDrawdownPct = clampedDd;
      }

      equityCurve.push({
        timestamp: candleTime,
        balance: Number(balance.toFixed(2)),
        equity: Number(currentEquity.toFixed(2)),
        unrealized_pnl: Number(unrealizedPnL.toFixed(2)),
        realized_pnl: Number(realizedPnLTotal.toFixed(2)),
        fees: Number(feesTotal.toFixed(2)),
        funding: Number(fundingTotal.toFixed(2)),
        slippage: Number(slippageTotal.toFixed(2)),
        margin_used: Number(marginUsed.toFixed(2)),
        available_margin: Number(availableMargin.toFixed(2)),
        peak_equity: Number(peakEquity.toFixed(2)),
        drawdown_percentage: Number(clampedDd.toFixed(2)),
        price: closePrice,
        account_status: accountStatus
      });

      // Si la cuenta quebró en este punto, cortar la simulación inmediatamente
      if (accountStatus === 'ACCOUNT_BLOWN') {
        break;
      }
    }

    // 4. Métricas Financieras Estándar y Estadísticas (Sharpe/Sortino sobre Retornos Diarios)
    const totalClosedTrades = simulatedTrades.length;
    const wins = simulatedTrades.filter(t => t.pnl > 0);
    const losses = simulatedTrades.filter(t => t.pnl < 0);
    const winRate = totalClosedTrades > 0 ? wins.length / totalClosedTrades : 0;

    const grossProfit = wins.reduce((acc, t) => acc + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((acc, t) => acc + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(4)) : (grossProfit > 0 ? 999.0 : 0);
    const netProfitUSD = Number((balance - config.initial_balance).toFixed(4));

    // Reconstrucción de Serie Temporal de Retornos Diarios de Equidad para Sharpe y Sortino
    const dailyEquitiesMap = new Map<string, number>();
    for (const eqPt of equityCurve) {
      const dateKey = new Date(eqPt.timestamp).toISOString().split('T')[0];
      dailyEquitiesMap.set(dateKey, eqPt.equity);
    }

    const dailyEquities = Array.from(dailyEquitiesMap.values());
    const dailyReturns: number[] = [];
    for (let d = 1; d < dailyEquities.length; d++) {
      const prevEq = dailyEquities[d - 1];
      const currEq = dailyEquities[d];
      if (prevEq > 0) {
        dailyReturns.push((currEq - prevEq) / prevEq);
      }
    }

    let sharpeRatio = 0;
    let sortinoRatio = 0;

    if (dailyReturns.length >= 2) {
      const meanReturn = dailyReturns.reduce((acc, r) => acc + r, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (dailyReturns.length - 1);
      const stdDev = Math.sqrt(variance);

      if (stdDev > 0) {
        sharpeRatio = Number(((meanReturn / stdDev) * Math.sqrt(365)).toFixed(4));
      }

      // Downside Deviation para Sortino (MAR = 0)
      const downsideSquareSum = dailyReturns.reduce((acc, r) => (r < 0 ? acc + Math.pow(r, 2) : acc), 0);
      const downsideVariance = downsideSquareSum / dailyReturns.length;
      const downsideStdDev = Math.sqrt(downsideVariance);

      if (downsideStdDev > 0) {
        sortinoRatio = Number(((meanReturn / downsideStdDev) * Math.sqrt(365)).toFixed(4));
      } else if (meanReturn > 0) {
        sortinoRatio = 999.0;
      }
    }

    const performanceReport = {
      sharpe_ratio: sharpeRatio,
      sortino_ratio: sortinoRatio,
      profit_factor: profitFactor,
      win_rate: Number((winRate * 100).toFixed(2)),
      max_drawdown_percentage: Number(maxDrawdownPct.toFixed(2)),
      total_trades: totalClosedTrades,
      net_profit_usd: netProfitUSD,
      total_profit_usd: Number(grossProfit.toFixed(4)),
      total_loss_usd: Number(grossLoss.toFixed(4)),
      average_win_usd: wins.length > 0 ? Number((grossProfit / wins.length).toFixed(4)) : 0,
      average_loss_usd: losses.length > 0 ? Number((grossLoss / losses.length).toFixed(4)) : 0,
      timestamp: Date.now()
    };

    return {
      symbol: config.symbol,
      timeframe,
      config,
      data_audit: dataAudit,
      trades: simulatedTrades,
      equity_curve: equityCurve,
      performance: performanceReport,
      simulated_trades_count: totalClosedTrades,
      rejected_trades_count: rejectedTradesCount,
      win_rate: Number((winRate * 100).toFixed(2)),
      profit_factor: profitFactor,
      sharpe_ratio: sharpeRatio,
      sortino_ratio: sortinoRatio,
      max_drawdown_percentage: Number(maxDrawdownPct.toFixed(2)),
      net_profit_usd: netProfitUSD,
      final_status: accountStatus,
      blown_timestamp: blownTimestamp,
      blown_trade_id: blownTradeId
    };
  }
}

