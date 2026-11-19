/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MarketStateSnapshot } from '../types.ts';
import { db } from '../db/index.ts';
import { marketCandles } from '../db/schema.ts';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { mapSymbol, getProductType, mapTimeframeToGranularity } from '../execution/brokers/bitget-utils.ts';

export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface IMarketDataProvider {
  getCandles(symbol: string, timeframe: string, startTime: number, endTime: number): Promise<CandleData[]>;
  getTicker(symbol: string): Promise<MarketStateSnapshot>;
}

export class RealMarketDataProvider implements IMarketDataProvider {
  public async getCandles(symbol: string, timeframe: string, startTime: number, endTime: number): Promise<CandleData[]> {
    const clean = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    let candleSymbol = clean;
    if (clean.includes('BTC') || clean.includes('XBT')) candleSymbol = 'BTCUSDT';
    else if (clean.includes('ETH')) candleSymbol = 'ETHUSDT';
    else if (clean.includes('SOL')) candleSymbol = 'SOLUSDT';
    else if (!candleSymbol.endsWith('USDT') && !candleSymbol.endsWith('USDC')) candleSymbol = `${candleSymbol}USDT`;
    
    const productType = 'USDT-FUTURES';
    const granularity = mapTimeframeToGranularity(timeframe);

    const durationMs = endTime - startTime;
    const daysRequested = Number((durationMs / (24 * 3600 * 1000)).toFixed(1));
    const granularityMs = timeframe.toLowerCase() === '1h' ? 3600000 : 900000; // 15m default
    const expectedCandles = Math.floor(durationMs / granularityMs);

    console.log(`[PAGINATION] Requested: ${daysRequested} days / ~${expectedCandles} candles (${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()})`);

    const candleMap = new Map<number, CandleData>();
    let currentEnd = endTime;
    let rawTotalCandlesCount = 0;
    let page = 0;

    while (currentEnd > startTime && page < 20) {
      page++;
      const chunkStart = Math.max(startTime, currentEnd - (1000 * granularityMs));
      const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${candleSymbol}&productType=${productType}&granularity=${granularity}&startTime=${chunkStart}&endTime=${currentEnd}&limit=1000`;

      let res: Response;
      try {
        res = await fetch(url);
      } catch (err: any) {
        throw new Error(`BACKTEST_DATA_ERROR: Error de red al consultar velas de Bitget (${err.message || err})`);
      }

      if (!res.ok) {
        throw new Error(`BACKTEST_DATA_ERROR: HTTP ${res.status} al consultar velas de Bitget API`);
      }

      const json = await res.json();
      if (json.code !== '00000') {
        throw new Error(`BACKTEST_DATA_ERROR: Error de Bitget API [Code ${json.code}]: ${json.msg || 'Falla de mercado'}`);
      }

      if (!Array.isArray(json.data) || json.data.length === 0) {
        console.warn(`[PAGINATION] Page ${page}: 0 candles returned for chunk [${new Date(chunkStart).toISOString()} - ${new Date(currentEnd).toISOString()}]`);
        break;
      }

      let validCountInPage = 0;
      let minTsInChunk = currentEnd;

      for (const c of json.data) {
        const ts = parseInt(c[0]);
        if (!isNaN(ts) && ts >= startTime && ts <= endTime) {
          rawTotalCandlesCount++;
          validCountInPage++;
          candleMap.set(ts, {
            timestamp: ts,
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
          });
          if (ts < minTsInChunk) {
            minTsInChunk = ts;
          }
        }
      }

      console.log(`[PAGINATION] Page ${page}: ${validCountInPage} candles`);

      if (minTsInChunk >= currentEnd || validCountInPage === 0) {
        break;
      }
      currentEnd = minTsInChunk - 1;
    }

    const uniqueCandles = Array.from(candleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    const duplicates = rawTotalCandlesCount - uniqueCandles.length;
    const coveragePct = Number(((uniqueCandles.length / Math.max(1, expectedCandles)) * 100).toFixed(1));

    console.log(`[PAGINATION] Total raw candles: ${rawTotalCandlesCount}`);
    console.log(`[PAGINATION] Unique candles   : ${uniqueCandles.length}`);
    console.log(`[PAGINATION] Duplicates       : ${duplicates}`);
    console.log(`[PAGINATION] Coverage         : ${coveragePct}%`);

    if (uniqueCandles.length === 0) {
      throw new Error(`BACKTEST_DATA_ERROR: No se encontraron velas de mercado para ${symbol} en el rango especificado.`);
    }

    return uniqueCandles;
  }

  public async getTicker(symbol: string): Promise<MarketStateSnapshot> {
    const mappedSymbol = mapSymbol(symbol);
    const productType = getProductType();
    const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${mappedSymbol}&productType=${productType}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al consultar ticker de Bitget`);
    const json = await res.json();
    if (json.code !== '00000' || !json.data || json.data.length === 0) {
      throw new Error(`Respuesta inválida de ticker Bitget`);
    }

    const t = json.data[0];
    return {
      symbol,
      price: parseFloat(t.lastPr),
      volume24h: parseFloat(t.baseVolume ?? t.volume24h ?? '0'),
      high24h: parseFloat(t.high24h ?? t.lastPr),
      low24h: parseFloat(t.low24h ?? t.lastPr),
      timestamp: Date.now()
    };
  }
}

export class HistoricalMarketDataProvider implements IMarketDataProvider {
  public async getCandles(symbol: string, timeframe: string, startTime: number, endTime: number): Promise<CandleData[]> {
    const granularityMs = timeframe.toLowerCase() === '1h' ? 3600000 : 900000;
    const expectedCount = Math.floor((endTime - startTime) / granularityMs);

    try {
      const rows = await db
        .select()
        .from(marketCandles)
        .where(
          and(
            eq(marketCandles.symbol, symbol),
            eq(marketCandles.timeframe, timeframe),
            gte(marketCandles.timestamp, new Date(startTime)),
            lte(marketCandles.timestamp, new Date(endTime))
          )
        )
        .orderBy(asc(marketCandles.timestamp));

      // Solo utilizar la base de datos si cubre al menos el 75% de las velas requeridas (mínimo 50)
      if (rows && rows.length >= Math.max(50, Math.floor(expectedCount * 0.75))) {
        return rows.map(r => ({
          open: parseFloat(r.open),
          high: parseFloat(r.high),
          low: parseFloat(r.low),
          close: parseFloat(r.close),
          volume: parseFloat(r.volume),
          timestamp: r.timestamp.getTime()
        }));
      }
    } catch (e) {
      // Fallback a API pública de red si DB no está disponible
    }

    const realProvider = new RealMarketDataProvider();
    return realProvider.getCandles(symbol, timeframe, startTime, endTime);
  }

  public async getTicker(symbol: string): Promise<MarketStateSnapshot> {
    const realProvider = new RealMarketDataProvider();
    return realProvider.getTicker(symbol);
  }
}
