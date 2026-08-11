/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MarketStateSnapshot } from '../types.ts';
import { db } from '../db/index.ts';
import { marketCandles } from '../db/schema.ts';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { mapSymbol, getProductType } from '../execution/brokers/bitget-utils.ts';

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
    const mappedSymbol = mapSymbol(symbol);
    const productType = getProductType();
    const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${mappedSymbol}&productType=${productType}&granularity=15m&startTime=${startTime}&endTime=${endTime}&limit=1000`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al consultar velas de Bitget`);
    const json = await res.json();
    if (json.code !== '00000' || !Array.isArray(json.data)) return [];

    return json.data.map((c: any) => ({
      timestamp: parseInt(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5])
    })).sort((a: CandleData, b: CandleData) => a.timestamp - b.timestamp);
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

      if (rows && rows.length >= 10) {
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
