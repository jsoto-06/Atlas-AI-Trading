import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealMarketDataProvider } from '../../src/providers/market-data-provider.ts';

describe('MARKET DATA PAGINATION & RANGE AUDIT', () => {
  let provider: RealMarketDataProvider;

  beforeEach(() => {
    provider = new RealMarketDataProvider();
    vi.restoreAllMocks();
  });

  it('debe solicitar múltiples tramos paginados cuando el rango excede 1000 velas', async () => {
    // Simular API que devuelve 1000 velas superiores (Page 1) y 344 velas inferiores (Page 2)
    const chunk1 = Array.from({ length: 1000 }).map((_, i) => [
      (1700000000000 + (344 + i) * 900000).toString(),
      '60000', '60100', '59900', '60050', '100'
    ]);

    const chunk2 = Array.from({ length: 344 }).map((_, i) => [
      (1700000000000 + i * 900000).toString(),
      '60050', '60200', '60000', '60150', '120'
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: '00000', data: chunk1 })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: '00000', data: chunk2 })
      } as Response);

    const startTime = 1700000000000;
    const endTime = 1700000000000 + 1344 * 900000;
    const candles = await provider.getCandles('BTC/USDT', '15m', startTime, endTime);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(candles.length).toBe(1344);
    expect(candles[0].timestamp).toBe(startTime);
    expect(candles[candles.length - 1].timestamp).toBe(1700000000000 + 1343 * 900000);
  });

  it('debe lanzar BACKTEST_DATA_ERROR si la API falla o no devuelve datos', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500
    } as Response);

    await expect(provider.getCandles('BTC/USDT', '15m', 1700000000000, 1700000000000 + 9000000))
      .rejects.toThrow(/BACKTEST_DATA_ERROR/);
  });

  it('debe fallar la validación si un rango de 14 días a 15m devuelve solo 1000 velas o menos', async () => {
    const endTime = Date.now();
    const startTime = endTime - (14 * 24 * 3600 * 1000);
    const candles = await provider.getCandles('BTC/USDT', '15m', startTime, endTime);

    // Debe ser estrictamente superior a 1000 velas (esperadas ~1344)
    expect(candles.length).toBeGreaterThan(1300);
    expect(candles.length).not.toBe(1000);
  });

  it('debe fallar la validación si un rango de 30 días a 15m devuelve solo 1000 velas o menos', async () => {
    const endTime = Date.now();
    const startTime = endTime - (30 * 24 * 3600 * 1000);
    const candles = await provider.getCandles('BTC/USDT', '15m', startTime, endTime);

    // Debe ser estrictamente superior a 2800 velas (esperadas ~2880)
    expect(candles.length).toBeGreaterThan(2800);
    expect(candles.length).not.toBe(1000);
  });
});
