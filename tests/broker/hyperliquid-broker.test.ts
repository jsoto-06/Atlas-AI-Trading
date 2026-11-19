import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidBroker } from '../../src/execution/brokers/hyperliquid-broker.ts';
import { BrokerFactory } from '../../src/execution/brokers/broker-factory.ts';

describe('HyperliquidBroker Unit & Demo Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.HYPERLIQUID_PRIVATE_KEY;
    delete process.env.HYPERLIQUID_WALLET_ADDRESS;
    delete process.env.HYPERLIQUID_MODO_REAL;
  });

  describe('BrokerFactory Integration', () => {
    it('debe instanciar HyperliquidBroker cuando ACTIVE_EXCHANGE=hyperliquid', () => {
      BrokerFactory.reset();
      process.env.ACTIVE_EXCHANGE = 'hyperliquid';
      const broker = BrokerFactory.getBroker();
      expect(broker.exchangeId).toBe('hyperliquid');
      expect(broker.nombreBroker).toBe('Hyperliquid DEX');
    });
  });

  describe('Modo Simulación Demo (Zero-Friction Fallback)', () => {
    it('debe reportar isConfigured() = false si no hay clave privada configurada', () => {
      const broker = new HyperliquidBroker();
      expect(broker.isConfigured()).toBe(false);
    });

    it('debe retornar saldo virtual de $1,000 USD en Testnet cuando la wallet no tiene fondos on-chain', async () => {
      const broker = new HyperliquidBroker();
      const balance = await broker.getBalance('USDC');
      expect(balance).toBe(1000);
    });

    it('debe ejecutar órdenes en simulación local consultando precio de mercado real', async () => {
      const broker = new HyperliquidBroker();

      vi.spyOn(broker, 'getMarketPrice').mockResolvedValue(63500);

      const res = await broker.executeOrder({
        simbolo: 'BTC/USDT',
        temporalidad: '15m',
        lado: 'BUY',
        tipo: 'MARKET',
        tamano: 150,
        stopLoss: 62500,
        takeProfit: 65500,
        leverage: 10,
        timestamp: Date.now()
      });

      expect(res.exitoso).toBe(true);
      expect(res.precioEjecutado).toBe(63500);
      expect(res.orderId).toContain('hl_sim_');
      expect(res.mensajeRespuesta).toContain('Simulación DEX');
    });

    it('getMarketPrice debe retornar fallback cuando la API L1 no responde', async () => {
      const broker = new HyperliquidBroker();
      // En caso de fallo total, retorna 0 (fail-closed)
      const price = await broker.getMarketPrice('INVALID_PAIR_XYZ');
      expect(price).toBe(0);
    });
  });
});
