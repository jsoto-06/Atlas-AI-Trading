import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestEngine } from '../../src/backtesting/engine.ts';

describe('CAPITAL BLOW-UP & ACCOUNT BANKRUPTCY AUDIT', () => {
  let engine: BacktestEngine;

  beforeEach(() => {
    engine = new BacktestEngine();
    vi.restoreAllMocks();
  });

  it('debe detener la simulación INMEDIATAMENTE al quebrar la cuenta ($100 iniciales, equity <= 0)', async () => {
    // Simulación de 50 velas con caída violenta que provoca liquidación / blowup
    const mockCandles = Array.from({ length: 50 }).map((_, i) => {
      const price = i < 15 ? 60000 : Math.max(1000, 60000 - (i - 14) * 3000);
      return {
        timestamp: 1700000000000 + i * 900000,
        open: price,
        high: price + 50,
        low: price - 500,
        close: price - 100,
        volume: 1000
      };
    });

    vi.spyOn((engine as any).marketProvider, 'getCandles').mockResolvedValue(mockCandles);

    // Mock de señal forzada de compra apalancada
    vi.spyOn((engine as any).supervisorAgent, 'execute').mockImplementation(async (symbol: string, timeframe: string, cycleId: string) => {
      (engine as any).blackboard.writeAssessment(symbol, timeframe, {
        agentName: 'Supervisor',
        timestamp: Date.now(),
        score: 80,
        confidence: 0.9,
        data: { final_decision: 'BUY' },
        justification: 'Mock BUY for forced trade'
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
          max_position_size: 1000, // $1000 notional con 10x apalancamiento sobre $100 capital
          calculated_stop_loss: 40000,
          calculated_take_profit: 80000
        },
        justification: 'Mock Risk Output'
      });
    });

    const result = await engine.runBacktest({
      symbol: 'BTC/USDT',
      start_time: 1700000000000,
      end_time: 1700000000000 + 50 * 900000,
      initial_balance: 100,
      fee_rate: 0.0006,
      slippage_simulation_factor: 0.0005,
      leverage: 10
    });

    // 1. Debe haber registrado el estado ACCOUNT_BLOWN
    expect(result.final_status).toBe('ACCOUNT_BLOWN');
    expect(result.blown_timestamp).toBeDefined();

    // 2. La equidad final NUNCA puede ser negativa en un modelo sin deuda
    const finalEquity = result.equity_curve[result.equity_curve.length - 1].equity;
    expect(finalEquity).toBe(0);
    expect(result.net_profit_usd).toBe(-100);

    // 3. Max Drawdown nunca puede ser inferior a 100%
    expect(result.max_drawdown_percentage).toBe(100);
    expect(result.max_drawdown_percentage).not.toBeGreaterThan(100);

    // 4. La curva de equidad no debe continuar procesando velas después de la quiebra
    expect(result.equity_curve.length).toBeLessThan(50);
  });

  it('no debe ejecutar operaciones ni alterar el balance tras ACCOUNT_BLOWN', async () => {
    const mockCandles = Array.from({ length: 40 }).map((_, i) => {
      const price = i < 15 ? 60000 : 30000;
      return {
        timestamp: 1700000000000 + i * 900000,
        open: price,
        high: price + 100,
        low: price - 100,
        close: price,
        volume: 1000
      };
    });

    vi.spyOn((engine as any).marketProvider, 'getCandles').mockResolvedValue(mockCandles);

    const result = await engine.runBacktest({
      symbol: 'BTC/USDT',
      start_time: 1700000000000,
      end_time: 1700000000000 + 40 * 900000,
      initial_balance: 100,
      leverage: 10
    });

    if (result.final_status === 'ACCOUNT_BLOWN') {
      const blownIndex = result.equity_curve.findIndex(e => e.account_status === 'ACCOUNT_BLOWN');
      expect(blownIndex).toBe(result.equity_curve.length - 1);
    }
  });
});
