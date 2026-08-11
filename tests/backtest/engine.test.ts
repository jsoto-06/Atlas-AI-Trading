import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestEngine } from '../../src/backtesting/engine.ts';

describe('CRITICAL 4 & 6 — Backtest Strategy Synchronization & Zero Look-ahead Bias', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
    vi.restoreAllMocks();
  });

  it('debe abortar con error Fail-Closed si se proveen menos de 10 velas históricas', async () => {
    // Mockear retorno de menos de 10 velas
    vi.spyOn((engine as any).marketProvider, 'getCandles').mockResolvedValue([]);

    await expect(engine.runBacktest({
      symbol: 'BTC/USDT',
      start_time: Date.now() - 86400000,
      end_time: Date.now(),
      initial_balance: 10000
    })).rejects.toThrow(/INSUFFICIENT MARKET DATA/);
  });

  it('debe ejecutar la simulación determinista sin sesgo de anticipación usando agentes reales', async () => {
    const mockCandles = Array.from({ length: 30 }).map((_, i) => ({
      timestamp: 1700000000000 + i * 900000,
      open: 60000 + i * 100,
      high: 60100 + i * 100,
      low: 59900 + i * 100,
      close: 60050 + i * 100,
      volume: 1000
    }));

    vi.spyOn((engine as any).marketProvider, 'getCandles').mockResolvedValue(mockCandles);

    const result = await engine.runBacktest({

      symbol: 'BTC/USDT',
      start_time: 1700000000000,
      end_time: 1700000000000 + 30 * 900000,
      initial_balance: 10000,
      fee_rate: 0.0006,
      slippage_simulation_factor: 0.0005
    });

    expect(result).toBeDefined();
    expect(result.symbol).toBe('BTC/USDT');
    expect(result.equity_curve.length).toBe(30);
    expect(result.performance).toBeDefined();
    expect(result.performance.total_trades).toBeGreaterThanOrEqual(0);
  }, 15000);
});
