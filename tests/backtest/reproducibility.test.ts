import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestEngine } from '../../src/backtesting/engine.ts';

describe('DETERMINISM & REPRODUCIBILITY AUDIT', () => {
  let engine1: BacktestEngine;
  let engine2: BacktestEngine;

  beforeEach(() => {
    engine1 = new BacktestEngine();
    engine2 = new BacktestEngine();
    vi.restoreAllMocks();
  });

  it('debe generar exactamente los mismos resultados en dos ejecuciones idénticas (100% Determinista)', async () => {
    const mockCandles = Array.from({ length: 30 }).map((_, i) => ({
      timestamp: 1700000000000 + i * 900000,
      open: 60000 + (i % 3 === 0 ? 100 : -50),
      high: 60200,
      low: 59800,
      close: 60000 + (i % 2 === 0 ? 80 : -40),
      volume: 1000
    }));

    vi.spyOn((engine1 as any).marketProvider, 'getCandles').mockResolvedValue(mockCandles);
    vi.spyOn((engine2 as any).marketProvider, 'getCandles').mockResolvedValue(mockCandles);

    const config = {
      symbol: 'BTC/USDT',
      start_time: 1700000000000,
      end_time: 1700000000000 + 30 * 900000,
      initial_balance: 100,
      fee_rate: 0.0006,
      slippage_simulation_factor: 0.0005,
      leverage: 10
    };

    const res1 = await engine1.runBacktest(config);
    const res2 = await engine2.runBacktest(config);

    expect(res1.simulated_trades_count).toBe(res2.simulated_trades_count);
    expect(res1.net_profit_usd).toBe(res2.net_profit_usd);
    expect(res1.win_rate).toBe(res2.win_rate);
    expect(res1.profit_factor).toBe(res2.profit_factor);
    expect(res1.sharpe_ratio).toBe(res2.sharpe_ratio);
    expect(res1.sortino_ratio).toBe(res2.sortino_ratio);
    expect(res1.max_drawdown_percentage).toBe(res2.max_drawdown_percentage);
    expect(res1.equity_curve).toEqual(res2.equity_curve);
    expect(res1.trades).toEqual(res2.trades);
  });
});
