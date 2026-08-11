import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderRouter } from '../../src/execution/order-router.ts';
import { RiskManagerAnalystOutput } from '../../src/agents/risk/types.ts';
import { Blackboard } from '../../src/core/blackboard.ts';
import { db } from '../../src/db/index.ts';

describe('OrderRouter Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(db, 'insert').mockReturnValue({
      values: () => ({
        onConflictDoNothing: async () => ({})
      })
    } as any);
    vi.spyOn(db, 'update').mockReturnValue({
      set: () => ({
        where: async () => ({})
      })
    } as any);
    vi.spyOn(db, 'select').mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => []
        })
      })
    } as any);
  });

  it('debe abortar si safe_to_operate es false', async () => {
    const router = new OrderRouter();
    const mockRiskOutput: RiskManagerAnalystOutput = {
      simbolo: 'BTC/USDT',
      temporalidad: '15m',
      timestamp: Date.now(),
      safe_to_operate: false,
      max_position_size: 0,
      calculated_stop_loss: 0,
      calculated_take_profit: 0,
      trailing_stop_activation: 0,
      kelly_fraction: 0,
      risk_reward_ratio: 0,
      rejection_reason: 'Drawdown excedido',
      justificacionConsolidada: 'Rechazado',
      dataSource: 'REAL_TIME_VERIFIED'
    };

    const res = await router.dispatchOrder(mockRiskOutput);
    expect(res.exitoso).toBe(false);
    expect(res.error).toBe('BLOCKED_BY_RISK_MANAGER');
  });

  it('debe ignorar señales duplicadas por idempotencia', async () => {
    const router = new OrderRouter();
    const ts = Date.now();
    const mockRiskOutput: RiskManagerAnalystOutput = {
      simbolo: 'BTC/USDT',
      temporalidad: '15m',
      timestamp: ts,
      safe_to_operate: true,
      max_position_size: 500,
      calculated_stop_loss: 64000,
      calculated_take_profit: 69000,
      trailing_stop_activation: 66000,
      kelly_fraction: 0.01,
      risk_reward_ratio: 2.2,
      rejection_reason: null,
      justificacionConsolidada: 'Aprobado',
      dataSource: 'REAL_TIME_VERIFIED'
    };

    // Escribir decisión del Supervisor en Blackboard
    const blackboard = Blackboard.getInstance();
    blackboard.writeAssessment('BTC/USDT', '15m', {
      agentName: 'Supervisor',
      timestamp: ts,
      score: 75,
      confidence: 0.8,
      data: { final_decision: 'BUY' },
      justification: 'OK'
    });

    // Mock broker
    vi.spyOn((router as any).broker, 'getBalance').mockResolvedValue(1000);
    vi.spyOn((router as any).broker, 'executeOrder').mockResolvedValue({
      exitoso: true,
      orderId: '123456',
      mensajeRespuesta: 'OK',
      timestamp: ts,
      reintentosRealizados: 0
    });

    const res1 = await router.dispatchOrder(mockRiskOutput);
    expect(res1.exitoso).toBe(true);

    // Segundo intento con la misma señal debe omitirse por idempotencia
    const res2 = await router.dispatchOrder(mockRiskOutput);
    expect(res2.exitoso).toBe(false);
    expect(res2.error).toBe('DUPLICATE_SIGNAL_IGNORED');
  });
});
