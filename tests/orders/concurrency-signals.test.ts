import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderRouter } from '../../src/execution/order-router.ts';
import { OrderManager } from '../../src/execution/order-manager.ts';
import { BitgetBroker } from '../../src/execution/brokers/bitget-broker.ts';
import { RiskManagerAnalystOutput } from '../../src/agents/risk/types.ts';
import { Blackboard } from '../../src/core/blackboard.ts';
import { db } from '../../src/db/index.ts';

describe('CRITICAL 8 — 10 Concurrent Signal Dispatch Mutex Test', () => {
  let broker: BitgetBroker;
  let orderManager: OrderManager;
  let router: OrderRouter;

  beforeEach(() => {
    broker = new BitgetBroker();
    orderManager = new OrderManager(broker);
    router = new OrderRouter(broker, orderManager);
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

  it('10 llamadas simultáneas a la misma señal deben producir exactamente 1 orden lógica despachada', async () => {
    const ts = 1750000000000;
    const cycleId = 'cycle_concurrent_test';

    // Establecer cycleId activo en Blackboard
    const blackboard = Blackboard.getInstance();
    blackboard.setActiveCycle('BTC/USDT', '15m', cycleId);

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

    // Registrar decisión en Blackboard
    blackboard.writeAssessment(
      'BTC/USDT',
      '15m',
      {
        agentName: 'Supervisor',
        timestamp: Date.now(),
        score: 80,
        confidence: 0.9,
        data: { final_decision: 'BUY' },
        justification: 'Consenso Fuerte'
      },
      1800000,
      cycleId
    );

    vi.spyOn(broker, 'getBalance').mockResolvedValue(10000);
    vi.spyOn(broker, 'setLeverage').mockResolvedValue(true);
    let brokerExecuteCount = 0;
    vi.spyOn(broker, 'executeOrder').mockImplementation(async (req) => {
      brokerExecuteCount++;
      return {
        exitoso: true,
        orderId: 'bitget_concurrent_123',
        clientOrderId: req.clientOid,
        mensajeRespuesta: 'OK',
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    });

    // Lanzar 10 llamadas concurrentes simultáneas
    const promises = Array.from({ length: 10 }).map(() =>
      router.dispatchOrder(mockRiskOutput, 10, cycleId)
    );

    const results = await Promise.all(promises);

    const successResults = results.filter(r => r.exitoso);
    const duplicateIgnoredResults = results.filter(r => r.error === 'DUPLICATE_SIGNAL_IGNORED');

    if (successResults.length === 0) {
      console.error('CONCURRENCY TEST FAILURE RESULT 0:', results[0]);
    }

    expect(successResults.length).toBe(1);
    expect(duplicateIgnoredResults.length).toBe(9);
    expect(brokerExecuteCount).toBe(1); // Exactamente 1 orden física despachada al exchange
  });
});
