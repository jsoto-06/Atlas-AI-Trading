import { describe, it, expect, vi } from 'vitest';
import { BitgetBroker } from '../../src/execution/brokers/bitget-broker.ts';

describe('BitgetBroker Unit Tests', () => {
  it('getMarketPrice debe fallar cerrado (fail closed) cuando la API de Bitget no responde', async () => {
    const broker = new BitgetBroker();
    
    // Mock fetch para simular falla de red
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network Error')));

    await expect(broker.getMarketPrice('BTC/USDT')).rejects.toThrow('[FAIL CLOSED]');
    
    vi.unstubAllGlobals();
  });

  it('getPosition debe filtrar estrictamente por el símbolo solicitado (C05)', async () => {
    const broker = new BitgetBroker();
    
    // Mock sendRequest interno
    const mockPositions = [
      { symbol: 'SBTCSUSDT', total: '0.005', holdSide: 'long', openPrice: '65000' },
      { symbol: 'SETHSUSDT', total: '0.05', holdSide: 'short', openPrice: '3400' }
    ];

    vi.spyOn(broker as any, 'sendRequest').mockResolvedValue(mockPositions);

    // Consulta por ETH no debe retornar la posición de BTC
    const ethPos = await broker.getPosition('ETH/USDT');
    expect(ethPos).not.toBeNull();
    expect(ethPos?.rawSymbol).toBe('SETHSUSDT');
    expect(ethPos?.size).toBe(-0.05); // Short es negativo

    const btcPos = await broker.getPosition('BTC/USDT');
    expect(btcPos).not.toBeNull();
    expect(btcPos?.rawSymbol).toBe('SBTCSUSDT');
    expect(btcPos?.size).toBe(0.005);
  });
});
