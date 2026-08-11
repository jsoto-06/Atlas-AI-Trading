import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderManager } from '../../src/execution/order-manager.ts';
import { BitgetBroker } from '../../src/execution/brokers/bitget-broker.ts';
import { OrderRequest } from '../../src/execution/types.ts';
import { db } from '../../src/db/index.ts';

describe('CRITICAL 1 — Fail-Closed DB Persistence Failure Blocks Execution', () => {
  let broker: BitgetBroker;
  let orderManager: OrderManager;

  beforeEach(() => {
    broker = new BitgetBroker();
    orderManager = new OrderManager(broker);
    vi.restoreAllMocks();
  });

  it('debe fallar si db.insert falla y bloquear 100% las llamadas al broker (0 executeOrder)', async () => {
    const cycleId = 'cycle_db_fail_test_insert';
    const signalId = 'BTC/USDT:15m:1800000000000';
    const timestamp = Date.now();
    const orderRequest: OrderRequest = {
      simbolo: 'BTC/USDT',
      temporalidad: '15m',
      lado: 'BUY',
      tipo: 'MARKET',
      tamano: 1000,
      stopLoss: 60000,
      takeProfit: 66000,
      leverage: 10,
      timestamp
    };

    // Mock db.select para retornar sin coincidencias y permitir pasar a db.insert
    vi.spyOn(db, 'select').mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => []
        })
      })
    } as any);

    // Mock db.insert para lanzar un fallo catastrófico de conexión a DB
    const dbInsertSpy = vi.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error('PostgreSQL Connection Failed / Database Offline');
    });

    let brokerExecuteCount = 0;
    const executeOrderSpy = vi.spyOn(broker, 'executeOrder').mockImplementation(async () => {
      brokerExecuteCount++;
      return {
        exitoso: true,
        orderId: 'unexpected_broker_order_id',
        mensajeRespuesta: 'UNEXPECTED CALL',
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    });

    // Demostrar que createOrderIntent() rechaza de forma fail-closed la intención si db.insert falla
    await expect(
      orderManager.createOrderIntent(orderRequest, signalId, cycleId, 10)
    ).rejects.toThrow(/DB Persistence Failed/);

    // Demostrar que submitOrder() también falla de forma fail-closed
    await expect(
      orderManager.submitOrder(orderRequest, signalId, cycleId, 10)
    ).rejects.toThrow(/DB Persistence Failed/);

    // VERIFICACIÓN ARQUITECTÓNICA ABSOLUTA:
    // broker.executeOrder() debe llamarse EXACTAMENTE 0 VECES.
    expect(brokerExecuteCount).toBe(0);
    expect(executeOrderSpy).toHaveBeenCalledTimes(0);
    expect(dbInsertSpy).toHaveBeenCalled();
  });

  it('debe fallar si db.select consulta inicial falla y bloquear 100% las llamadas al broker (0 executeOrder)', async () => {
    const cycleId = 'cycle_db_fail_test_select';
    const signalId = 'BTC/USDT:15m:1800000000001';
    const timestamp = Date.now();
    const orderRequest: OrderRequest = {
      simbolo: 'BTC/USDT',
      temporalidad: '15m',
      lado: 'BUY',
      tipo: 'MARKET',
      tamano: 1000,
      stopLoss: 60000,
      takeProfit: 66000,
      leverage: 10,
      timestamp
    };

    // Mock db.select para simular fallo de lectura de DB
    vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('PostgreSQL Read Query Failed / Connection Refused');
    });

    let brokerExecuteCount = 0;
    const executeOrderSpy = vi.spyOn(broker, 'executeOrder').mockImplementation(async () => {
      brokerExecuteCount++;
      return {
        exitoso: true,
        orderId: 'unexpected_broker_order_id',
        mensajeRespuesta: 'UNEXPECTED CALL',
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    });

    // Demostrar que submitOrder() falla inmediatamente sin tocar el broker
    await expect(
      orderManager.submitOrder(orderRequest, signalId, cycleId, 10)
    ).rejects.toThrow(/DB Persistence Failed/);

    expect(brokerExecuteCount).toBe(0);
    expect(executeOrderSpy).toHaveBeenCalledTimes(0);
  });
});
