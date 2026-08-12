import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestEngine } from '../../src/backtesting/engine.ts';
import { PnLCalculator } from '../../src/analytics/pnl-calculator.ts';

describe('FINANCIAL & MATHEMATICAL CONSISTENCY TESTS', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
    vi.restoreAllMocks();
  });

  it('debe calcular PnL neto, comisiones y deslizamiento con precisión exacta', () => {
    // Posición LONG de 1 BTC desde 60,000 hasta 62,000 con fee 0.06%
    const breakdown = PnLCalculator.calculateRealizedPnL({
      side: 'LONG',
      entryPrice: 60000,
      exitPrice: 62000,
      quantity: 1,
      feeRate: 0.0006
    });

    expect(breakdown.grossPnL).toBe(2000);
    expect(breakdown.entryFee).toBe(36); // 60000 * 1 * 0.0006
    expect(breakdown.exitFee).toBe(37.2); // 62000 * 1 * 0.0006
    expect(breakdown.netRealizedPnL).toBe(2000 - 36 - 37.2);
  });

  it('debe mantener la identidad contable: Equity = Balance + Unrealized PnL', async () => {
    const mockCandles = Array.from({ length: 25 }).map((_, i) => ({
      timestamp: 1700000000000 + i * 900000,
      open: 60000 + (i % 2 === 0 ? 50 : -50),
      high: 60100,
      low: 59900,
      close: 60000 + i * 20,
      volume: 1000
    }));

    vi.spyOn((engine as any).marketProvider, 'getCandles').mockResolvedValue(mockCandles);

    const result = await engine.runBacktest({
      symbol: 'BTC/USDT',
      start_time: 1700000000000,
      end_time: 1700000000000 + 25 * 900000,
      initial_balance: 1000,
      fee_rate: 0.0006,
      slippage_simulation_factor: 0.0005,
      leverage: 10
    });

    for (const point of result.equity_curve) {
      const calculatedEquity = Number((point.balance + point.unrealized_pnl).toFixed(2));
      expect(point.equity).toBeCloseTo(calculatedEquity, 1);
    }
  });

  it('debe rechazar órdenes con REJECTED_INSUFFICIENT_MARGIN sin alterar el capital', async () => {
    const mockCandles = Array.from({ length: 20 }).map((_, i) => ({
      timestamp: 1700000000000 + i * 900000,
      open: 60000,
      high: 60100,
      low: 59900,
      close: 60000,
      volume: 1000
    }));

    vi.spyOn((engine as any).marketProvider, 'getCandles').mockResolvedValue(mockCandles);

    // Forzar intento de comprar $50,000 notional con solo $10 de saldo
    vi.spyOn((engine as any).supervisorAgent, 'execute').mockImplementation(async (symbol: string, timeframe: string, cycleId: string) => {
      (engine as any).blackboard.writeAssessment(symbol, timeframe, {
        agentName: 'Supervisor',
        timestamp: Date.now(),
        score: 80,
        confidence: 0.9,
        data: { final_decision: 'BUY' },
        justification: 'Mock BUY'
      });
    });

    vi.spyOn((engine as any).riskAgent, 'execute').mockImplementation(async (symbol: string, timeframe: string, cycleId: string) => {
      (engine as any).blackboard.writeAssessment(symbol, timeframe, {
        agentName: 'RiskManager',
        timestamp: Date.now(),
        score: 80,
        confidence: 0.9,
        data: {
          safe_to_operate: true,
          max_position_size: 50000, // Requeriría $5,000 de margen con 10x
          calculated_stop_loss: 58000,
          calculated_take_profit: 65000
        },
        justification: 'Excessive position size request'
      });
    });

    const result = await engine.runBacktest({
      symbol: 'BTC/USDT',
      start_time: 1700000000000,
      end_time: 1700000000000 + 20 * 900000,
      initial_balance: 10,
      leverage: 10
    });

    // La orden debe ser rechazada y el saldo mantenerse intacto ($10)
    expect(result.rejected_trades_count).toBeGreaterThan(0);
    expect(result.simulated_trades_count).toBe(0);
    expect(result.net_profit_usd).toBe(0);
  });
});
