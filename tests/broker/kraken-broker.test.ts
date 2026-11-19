import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KrakenFuturesBroker } from '../../src/execution/brokers/kraken-broker.ts';
import { mapKrakenSymbol, formatKrakenContracts, getKrakenBaseUrl } from '../../src/execution/brokers/kraken-utils.ts';
import { BrokerFactory } from '../../src/execution/brokers/broker-factory.ts';

describe('KrakenFuturesBroker Unit & Demo Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.KRAKEN_API_KEY;
    delete process.env.KRAKEN_API_SECRET;
    delete process.env.KRAKEN_MODO_REAL;
  });

  describe('Kraken Utils', () => {
    it('debe mapear correctamente símbolos a contratos perpetuos de Kraken Futures', () => {
      expect(mapKrakenSymbol('BTC/USDT')).toBe('PF_XBTUSD');
      expect(mapKrakenSymbol('BTC/USD')).toBe('PF_XBTUSD');
      expect(mapKrakenSymbol('ETH/USDT')).toBe('PF_ETHUSD');
      expect(mapKrakenSymbol('SOL/USDT')).toBe('PF_SOLUSD');
      expect(mapKrakenSymbol('PF_XBTUSD')).toBe('PF_XBTUSD');
    });

    it('debe seleccionar URL de Sandbox en modo demo y producción en modo real', () => {
      expect(getKrakenBaseUrl(false)).toBe('https://demo-futures.kraken.com/derivatives/api/v3');
      expect(getKrakenBaseUrl(true)).toBe('https://futures.kraken.com/derivatives/api/v3');
    });

    it('debe calcular correctamente el número de contratos', () => {
      // 1 contrato PF_XBTUSD = 1 USD nocional
      expect(formatKrakenContracts('BTC/USDT', 500, 95000)).toBe(500);
      expect(formatKrakenContracts('ETH/USDT', 250.7, 3400)).toBe(251);
      expect(formatKrakenContracts('BTC/USDT', 0, 95000)).toBe(1);
    });
  });

  describe('BrokerFactory Integration', () => {
    it('debe instanciar KrakenFuturesBroker cuando ACTIVE_EXCHANGE=kraken', () => {
      BrokerFactory.reset();
      process.env.ACTIVE_EXCHANGE = 'kraken';
      const broker = BrokerFactory.getBroker();
      expect(broker.exchangeId).toBe('kraken');
      expect(broker.nombreBroker).toBe('Kraken Futures');
    });
  });

  describe('Modo Simulación Demo (Zero-Friction sin claves)', () => {
    it('debe reportar isConfigured() = false si no hay claves', () => {
      const broker = new KrakenFuturesBroker();
      expect(broker.isConfigured()).toBe(false);
    });

    it('debe retornar saldo de margen virtual de prueba ($10,000 USD)', async () => {
      const broker = new KrakenFuturesBroker();
      const balance = await broker.getBalance('USDT');
      expect(balance).toBe(10000);
    });

    it('debe ejecutar órdenes en simulación local consultando precio de mercado real', async () => {
      const broker = new KrakenFuturesBroker();

      // Mock getMarketPrice para simular ticker en vivo
      vi.spyOn(broker, 'getMarketPrice').mockResolvedValue(94500);

      const res = await broker.executeOrder({
        simbolo: 'BTC/USDT',
        temporalidad: '15m',
        lado: 'BUY',
        tipo: 'MARKET',
        tamano: 1000, // $1000 USD
        clientOid: 'test_kraken_client_oid_123',
        timestamp: Date.now()
      });

      expect(res.exitoso).toBe(true);
      expect(res.clientOrderId).toBe('test_kraken_client_oid_123');
      expect(res.precioEjecutado).toBe(94500);
      expect(res.tamanoEjecutado).toBe(1000); // 1000 contratos
      expect(res.orderId).toContain('sim_kraken_');

      // Verificar que la posición quedó registrada en memoria
      const pos = await broker.getPosition('BTC/USDT');
      expect(pos).not.toBeNull();
      expect(pos?.holdSide).toBe('long');
      expect(pos?.size).toBe(1000);
      expect(pos?.entryPrice).toBe(94500);

      // Cerrar posición simulada
      const closeRes = await broker.closePosition('BTC/USDT');
      expect(closeRes.exitoso).toBe(true);

      const posAfterClose = await broker.getPosition('BTC/USDT');
      expect(posAfterClose).toBeNull();
    });
  });

  describe('Fail-Closed Error Handling', () => {
    it('getMarketPrice debe fallar cerrado cuando la API de Kraken no responde', async () => {
      const broker = new KrakenFuturesBroker();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Kraken Timeout')));

      await expect(broker.getMarketPrice('BTC/USDT')).rejects.toThrow('[FAIL CLOSED]');
      vi.unstubAllGlobals();
    });
  });
});
