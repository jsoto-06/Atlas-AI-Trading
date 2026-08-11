import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngineScheduler } from '../../src/core/engine-scheduler.ts';
import { ReconciliationEngine } from '../../src/execution/reconciliation-engine.ts';

describe('CRITICAL 2 — Startup Reconciliation & Engine State Machine', () => {
  let engine: EngineScheduler;

  beforeEach(() => {
    engine = EngineScheduler.getInstance();
    engine.stop();
    vi.restoreAllMocks();
  });

  it('debe completar el flujo STARTING -> RECONCILING -> READY -> TRADING al conciliar exitosamente', async () => {
    // Mockear reconciliación exitosa
    vi.spyOn(ReconciliationEngine.getInstance(), 'reconcileOnStartup').mockResolvedValue(true);
    vi.spyOn(engine as any, 'fetchMarketSnapshot').mockResolvedValue({
      symbol: 'BTC/USDT',
      price: 65000,
      volume24h: 100000,
      high24h: 66000,
      low24h: 64000,
      timestamp: Date.now()
    });

    const startRes = await engine.start({ symbol: 'BTC/USDT', intervalMs: 60000 });

    expect(startRes.ok).toBe(true);
    expect(startRes.state).toBe('TRADING');
    expect(engine.getStatus().state).toBe('TRADING');

    engine.stop();
    expect(engine.getStatus().state).toBe('STOPPED');
  });

  it('debe entrar en FAILED_SAFE y bloquear TRADING si la reconciliación falla', async () => {
    // Mockear falla de reconciliación
    vi.spyOn(ReconciliationEngine.getInstance(), 'reconcileOnStartup').mockResolvedValue(false);

    const startRes = await engine.start({ symbol: 'BTC/USDT', intervalMs: 60000 });

    expect(startRes.ok).toBe(false);
    expect(startRes.state).toBe('FAILED_SAFE');
    expect(engine.getStatus().state).toBe('FAILED_SAFE');
    expect(engine.getStatus().running).toBe(false);
  });
});
