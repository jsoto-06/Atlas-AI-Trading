import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderManager } from '../../src/execution/order-manager.ts';
import { BitgetBroker } from '../../src/execution/brokers/bitget-broker.ts';
import { OrderRequest } from '../../src/execution/types.ts';
import { db } from '../../src/db/index.ts';

describe('CRITICAL 1 — Order Idempotency & Network Timeout (No Duplication)', () => {
  let broker: BitgetBroker;
  let orderManager: OrderManager;

  beforeEach(() => {
    broker = new BitgetBroker();
    orderManager = new OrderManager(broker);
    vi.restoreAllMocks();

    // Mockear persistencia de DB para simular PostgreSQL activo y funcional durante la prueba unitaria
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

  it('debe mantener exactamente el mismo clientOid y consultar al exchange tras timeout de red sin duplicar la orden', async () => {
    const cycleId = 'cycle_test_1001';
    const signalId = 'BTC/USDT:15m:1700000000000';
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

    // 1. Generar e inspeccionar clientOid inicial (verificando que DB insert no lanza error)
    const managedOrder = await orderManager.createOrderIntent(orderRequest, signalId, cycleId, 10);
    const originalClientOid = managedOrder.clientOid;

    expect(originalClientOid).toBeDefined();
    expect(originalClientOid).toContain('atlas_btcusdt_cycle_test_1001_');

    // 2. Mockear el broker: primer executeOrder lanza un timeout de red (respuesta HTTP perdida)
    let placeOrderCalls = 0;
    vi.spyOn(broker, 'setLeverage').mockResolvedValue(true);
    vi.spyOn(broker, 'executeOrder').mockImplementation(async (req) => {
      placeOrderCalls++;
      // Verificar que el broker recibe EXACTAMENTE el mismo clientOid
      expect(req.clientOid).toBe(originalClientOid);
      throw new Error('ETIMEDOUT / Response Lost');
    });

    // Mockear la consulta por clientOid: la orden SÍ llegó y se ejecutó en Bitget
    const mockExchangeOrder = {
      orderId: 'bitget_exchange_999888',
      clientOid: originalClientOid,
      state: 'filled',
      priceAvg: '64000',
      size: '0.015'
    };
    const getOrderByClientOidSpy = vi.spyOn(broker, 'getOrderByClientOid').mockResolvedValue(mockExchangeOrder);

    // 3. Ejecutar submitOrder: debe capturar la falla de red, consultar al exchange por clientOid y resolver a FILLED
    const result1 = await orderManager.submitOrder(orderRequest, signalId, cycleId, 10);

    expect(result1.exitoso).toBe(true);
    expect(result1.orderId).toBe('bitget_exchange_999888');
    expect(result1.clientOrderId).toBe(originalClientOid);
    expect(placeOrderCalls).toBe(1); // Se envió 1 sola vez a la API de place-order
    expect(getOrderByClientOidSpy).toHaveBeenCalledWith('BTC/USDT', originalClientOid);

    // 4. SIMULAR REINICIO DEL PROCESO: Nueva llamada a submitOrder con el mismo clientOid e intención
    const orderRequestWithOriginalOid: OrderRequest = {
      ...orderRequest,
      clientOid: originalClientOid
    };

    // Re-ejecutar submitOrder con la misma intención tras el reinicio
    const result2 = await orderManager.submitOrder(orderRequestWithOriginalOid, signalId, cycleId, 10);

    // 5. VERIFICACIÓN DE SEGURIDAD ABSOLUTA
    expect(result2.exitoso).toBe(true);
    expect(result2.orderId).toBe('bitget_exchange_999888');
    expect(result2.clientOrderId).toBe(originalClientOid);
    // ¡CRÍTICO: NO SE HA REALIZADO NINGÚN SEGUNDO POST DE CREACIÓN EN EL EXCHANGE!
    expect(placeOrderCalls).toBe(1); 
  });
});
