/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { 
  TechnicalAnalystOutput, 
  IndicadoresCuantitativos, 
  AnalisisCognitivoVisual, 
  Candle 
} from './types.ts';
import { analizarVelasConGemini } from '../../integrations/gemini-visual.ts';
import { db } from '../../db/index.ts';
import { marketCandles } from '../../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { mapSymbol, getProductType, mapTimeframeToGranularity } from '../../execution/brokers/bitget-utils.ts';

/**
 * Agente de Análisis Técnico Inteligente.
 * Implementa una arquitectura dual:
 * - Fast-Loop: Cálculos matemáticos deterministas de indicadores cuantitativos (RSI, MACD, Bollinger, VWAP, EMA, SMA, ADX, ATR).
 * - Slow-Loop: Análisis cognitivo-visual de patrones complejos (SMC/ICT, Wyckoff, Elliott) invocando la API de Gemini Visual.
 */
export class TechnicalAnalystAgent extends BaseAgent {
  public readonly name: AgentName = 'TechnicalAnalyst';
  public readonly isFastLoop: boolean = true; // Habilitado para ejecuciones ultra rápidas cuantitativas

  private memoryCache: Map<string, { candles: Candle[], timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute memory cache for candles

  /**
   * Traduce un símbolo común como "BTC/USDT" al formato adecuado de Bitget.
   */
  private mapSymbol(symbol: string): string {
    return mapSymbol(symbol);
  }

  private getProductType(): string {
    return getProductType();
  }

  private mapTimeframeToGranularity(timeframe: string): string {
    return mapTimeframeToGranularity(timeframe);
  }


  private async fetchCandlesFromBitget(symbol: string, timeframe: string): Promise<Candle[]> {
    const mappedSymbol = this.mapSymbol(symbol);
    const productType = this.getProductType();
    const granularity = this.mapTimeframeToGranularity(timeframe);
    const limit = '100';

    const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${mappedSymbol}&productType=${productType}&granularity=${granularity}&limit=${limit}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }

      const json = await response.json();
      if (json.code !== '00000' || !json.data) {
        throw new Error(`Bitget error code: ${json.code}, msg: ${json.msg}`);
      }

      const candles: Candle[] = json.data.map((item: any[]) => {
        return {
          time: parseInt(item[0], 10),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
          volume: parseFloat(item[5])
        };
      });

      return candles.sort((a, b) => a.time - b.time);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[TechnicalAnalystAgent] Error fetching candles from Bitget:`, error);
      throw error;
    }
  }

  private async getCandles(symbol: string, timeframe: string): Promise<Candle[]> {
    const cacheKey = `${symbol}-${timeframe}`;
    const now = Date.now();

    // 1. Check memory cache first
    const cached = this.memoryCache.get(cacheKey);
    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      console.log(`[TechnicalAnalystAgent] Velas obtenidas desde cache de memoria para ${symbol} en ${timeframe}`);
      return cached.candles;
    }

    // 2. Try fetching from Bitget API
    try {
      console.log(`[TechnicalAnalystAgent] Fetching latest candles from Bitget API for ${symbol} en ${timeframe}...`);
      const candles = await this.fetchCandlesFromBitget(symbol, timeframe);

      if (candles && candles.length > 0) {
        this.memoryCache.set(cacheKey, { candles, timestamp: now });

        try {
          // Guardar en la base de datos sqlite/pg sin duplicados
          const dbCandles = await db
            .select({ timestamp: marketCandles.timestamp })
            .from(marketCandles)
            .where(
              and(
                eq(marketCandles.symbol, symbol),
                eq(marketCandles.timeframe, timeframe)
              )
            );

          const existingTimestamps = new Set(dbCandles.map(c => c.timestamp.getTime()));
          const newCandlesToInsert = candles.filter(c => !existingTimestamps.has(c.time));

          if (newCandlesToInsert.length > 0) {
            console.log(`[TechnicalAnalystAgent] Guardando ${newCandlesToInsert.length} nuevas velas en DB para ${symbol}:${timeframe}`);
            
            for (let i = 0; i < newCandlesToInsert.length; i += 50) {
              const chunk = newCandlesToInsert.slice(i, i + 50);
              await db.insert(marketCandles).values(
                chunk.map(c => ({
                  symbol,
                  timeframe,
                  open: c.open.toString(),
                  high: c.high.toString(),
                  low: c.low.toString(),
                  close: c.close.toString(),
                  volume: c.volume.toString(),
                  timestamp: new Date(c.time)
                }))
              );
            }
          }
        } catch (dbError) {
          console.error(`[TechnicalAnalystAgent] Error writing candles to DB:`, dbError);
        }

        return candles;
      }
    } catch (apiError) {
      console.warn(`[TechnicalAnalystAgent] API Fetch failed. Falling back to DB:`, apiError);
    }

    // 3. Fallback to database
    try {
      const dbCandles = await db
        .select()
        .from(marketCandles)
        .where(
          and(
            eq(marketCandles.symbol, symbol),
            eq(marketCandles.timeframe, timeframe)
          )
        )
        .orderBy(desc(marketCandles.timestamp))
        .limit(100);

      if (dbCandles && dbCandles.length >= 10) {
        const mappedCandles: Candle[] = dbCandles.map(c => ({
          time: c.timestamp.getTime(),
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.volume)
        })).sort((a, b) => a.time - b.time);

        console.log(`[TechnicalAnalystAgent] Velas obtenidas exitosamente desde DB como fallback (${mappedCandles.length} velas)`);
        
        this.memoryCache.set(cacheKey, { candles: mappedCandles, timestamp: now });
        return mappedCandles;
      }
    } catch (dbFallbackError) {
      console.error(`[TechnicalAnalystAgent] DB fallback failed:`, dbFallbackError);
    }

    throw new Error(`Data source unavailable for ${symbol}:${timeframe}`);
  }

  // ============================================================================
  // Fórmulas Matemáticas de Indicadores Técnicos Nativo-TS
  // ============================================================================

  private calcularSMA(valores: number[], periodo: number): number {
    if (valores.length < periodo) return valores[valores.length - 1] || 0;
    const suma = valores.slice(-periodo).reduce((a, b) => a + b, 0);
    return suma / periodo;
  }

  private calcularHistorialEMA(valores: number[], periodo: number): number[] {
    const emas: number[] = [];
    if (valores.length === 0) return emas;
    const k = 2 / (periodo + 1);
    let ema = valores[0];
    emas.push(ema);
    for (let i = 1; i < valores.length; i++) {
      ema = valores[i] * k + ema * (1 - k);
      emas.push(ema);
    }
    return emas;
  }

  private calcularRSI(valores: number[], periodo: number = 14): number {
    if (valores.length <= periodo) return 50;

    let ganancias = 0;
    let perdidas = 0;

    for (let i = 1; i <= periodo; i++) {
      const diff = valores[i] - valores[i - 1];
      if (diff > 0) ganancias += diff;
      else perdidas -= diff;
    }

    let avgGanancia = ganancias / periodo;
    let avgPerdida = perdidas / periodo;

    for (let i = periodo + 1; i < valores.length; i++) {
      const diff = valores[i] - valores[i - 1];
      const ganancia = diff > 0 ? diff : 0;
      const perdida = diff < 0 ? -diff : 0;

      avgGanancia = (avgGanancia * (periodo - 1) + ganancia) / periodo;
      avgPerdida = (avgPerdida * (periodo - 1) + perdida) / periodo;
    }

    if (avgPerdida === 0) return 100;
    const rs = avgGanancia / avgPerdida;
    return Number((100 - 100 / (1 + rs)).toFixed(2));
  }

  private calcularMACD(valores: number[]): { linea: number; senal: number; histograma: number; crossover: 'BULLISH' | 'BEARISH' | 'NEUTRAL' } {
    const ema12 = this.calcularHistorialEMA(valores, 12);
    const ema26 = this.calcularHistorialEMA(valores, 26);

    const macdLinea: number[] = [];
    const minLength = Math.min(ema12.length, ema26.length);
    for (let i = 0; i < minLength; i++) {
      const idx12 = ema12.length - minLength + i;
      const idx26 = ema26.length - minLength + i;
      macdLinea.push(ema12[idx12] - ema26[idx26]);
    }

    const senalLinea = this.calcularHistorialEMA(macdLinea, 9);

    const macdActual = macdLinea[macdLinea.length - 1] || 0;
    const senalActual = senalLinea[senalLinea.length - 1] || 0;
    const histogramaActual = macdActual - senalActual;

    const macdPrevio = macdLinea[macdLinea.length - 2] || 0;
    const senalPrevia = senalLinea[senalLinea.length - 2] || 0;

    let crossover: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (macdPrevio <= senalPrevia && macdActual > senalActual) {
      crossover = 'BULLISH';
    } else if (macdPrevio >= senalPrevia && macdActual < senalActual) {
      crossover = 'BEARISH';
    }

    return {
      linea: Number(macdActual.toFixed(4)),
      senal: Number(senalActual.toFixed(4)),
      histograma: Number(histogramaActual.toFixed(4)),
      crossover
    };
  }

  private calcularATR(velas: Candle[], periodo: number = 14): number {
    if (velas.length <= 1) return 0;
    const trs: number[] = [];

    for (let i = 1; i < velas.length; i++) {
      const h = velas[i].high;
      const l = velas[i].low;
      const pc = velas[i - 1].close;
      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      trs.push(tr);
    }

    const atrHistorico = this.calcularHistorialEMA(trs, periodo);
    return atrHistorico[atrHistorico.length - 1] || 0;
  }

  private calcularBandasBollinger(valores: number[], periodo: number = 20): { bandaSuperior: number; bandaMedia: number; bandaInferior: number; posicionPrecio: 'SOBRECOMPRA' | 'SOBREVENTA' | 'RANGO_MEDIO' } {
    const sma = this.calcularSMA(valores, periodo);
    const subset = valores.slice(-periodo);
    const sumSqDiff = subset.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0);
    const stdDev = Math.sqrt(sumSqDiff / periodo) || 1;

    const bandaSuperior = sma + 2 * stdDev;
    const bandaInferior = sma - 2 * stdDev;
    const precioActual = valores[valores.length - 1];

    let posicionPrecio: 'SOBRECOMPRA' | 'SOBREVENTA' | 'RANGO_MEDIO' = 'RANGO_MEDIO';
    if (precioActual >= bandaSuperior * 0.985) {
      posicionPrecio = 'SOBRECOMPRA';
    } else if (precioActual <= bandaInferior * 1.015) {
      posicionPrecio = 'SOBREVENTA';
    }

    return {
      bandaSuperior: Number(bandaSuperior.toFixed(2)),
      bandaMedia: Number(sma.toFixed(2)),
      bandaInferior: Number(bandaInferior.toFixed(2)),
      posicionPrecio
    };
  }

  private calcularVWAP(velas: Candle[]): { valor: number; precioRelativo: 'POR_ENCIMA' | 'POR_DEBAJO' | 'CRUZANDO' } {
    let sumaTpVol = 0;
    let sumaVol = 0;

    for (const v of velas) {
      const typicalPrice = (v.high + v.low + v.close) / 3;
      sumaTpVol += typicalPrice * v.volume;
      sumaVol += v.volume;
    }

    const vwapVal = sumaVol > 0 ? sumaTpVol / sumaVol : velas[velas.length - 1].close;
    const precioActual = velas[velas.length - 1].close;

    let precioRelativo: 'POR_ENCIMA' | 'POR_DEBAJO' | 'CRUZANDO' = 'CRUZANDO';
    if (precioActual > vwapVal * 1.0015) {
      precioRelativo = 'POR_ENCIMA';
    } else if (precioActual < vwapVal * 0.9985) {
      precioRelativo = 'POR_DEBAJO';
    }

    return {
      valor: Number(vwapVal.toFixed(2)),
      precioRelativo
    };
  }

  private calcularADX(velas: Candle[], periodo: number = 14): { valor: number; tendenciaFuerte: boolean; direccionalidad: 'ALCISTA' | 'BAJISTA' | 'NEUTRAL' } {
    if (velas.length <= periodo) {
      return { valor: 20, tendenciaFuerte: false, direccionalidad: 'NEUTRAL' };
    }

    const dmp: number[] = [];
    const dmn: number[] = [];
    const trs: number[] = [];

    for (let i = 1; i < velas.length; i++) {
      const highDiff = velas[i].high - velas[i - 1].high;
      const lowDiff = velas[i - 1].low - velas[i].low;

      let dp = 0;
      let dn = 0;

      if (highDiff > lowDiff && highDiff > 0) {
        dp = highDiff;
      }
      if (lowDiff > highDiff && lowDiff > 0) {
        dn = lowDiff;
      }

      dmp.push(dp);
      dmn.push(dn);

      const h = velas[i].high;
      const l = velas[i].low;
      const pc = velas[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }

    const smoothedTR = this.calcularHistorialEMA(trs, periodo);
    const smoothedDMP = this.calcularHistorialEMA(dmp, periodo);
    const smoothedDMN = this.calcularHistorialEMA(dmn, periodo);

    const dxs: number[] = [];
    const minLen = Math.min(smoothedTR.length, smoothedDMP.length, smoothedDMN.length);

    for (let i = 0; i < minLen; i++) {
      const tr = smoothedTR[i] || 1;
      const diPlus = 100 * (smoothedDMP[i] / tr);
      const diMinus = 100 * (smoothedDMN[i] / tr);

      const diff = Math.abs(diPlus - diMinus);
      const sum = diPlus + diMinus || 1;
      dxs.push(100 * (diff / sum));
    }

    const adxHist = this.calcularHistorialEMA(dxs, periodo);
    const adxVal = adxHist[adxHist.length - 1] || 20;

    const trLast = smoothedTR[smoothedTR.length - 1] || 1;
    const diPlusLast = 100 * (smoothedDMP[smoothedDMP.length - 1] / trLast);
    const diMinusLast = 100 * (smoothedDMN[smoothedDMN.length - 1] / trLast);

    let direccionalidad: 'ALCISTA' | 'BAJISTA' | 'NEUTRAL' = 'NEUTRAL';
    if (diPlusLast > diMinusLast + 2) direccionalidad = 'ALCISTA';
    else if (diMinusLast > diPlusLast + 2) direccionalidad = 'BAJISTA';

    return {
      valor: Number(adxVal.toFixed(2)),
      tendenciaFuerte: adxVal >= 25,
      direccionalidad
    };
  }

  // ============================================================================
  // Lógica de Ejecución de Análisis del Agente
  // ============================================================================

  /**
   * Ejecuta la confluencia analítica del Agente Técnico.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[TechnicalAnalystAgent] Iniciando análisis real para ${symbol} en ${timeframe}`);

    // 1. Fase de Obtención de Datos de Mercado Reales
    let velas: Candle[] = [];
    try {
      velas = await this.getCandles(symbol, timeframe);
    } catch (error) {
      console.error(`[TechnicalAnalystAgent] Error crítico: No se pudieron obtener velas de mercado reales para ${symbol}:${timeframe}:`, error);

      // Escribir el assessment "UNAVAILABLE" en el Blackboard con confianza baja (0.1)
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'UNAVAILABLE', 
          error: error instanceof Error ? error.message : String(error) 
        },
        justification: `El agente Técnico no pudo recuperar datos reales del mercado (Bitget API y DB no disponibles).`
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    if (velas.length < 50) {
      console.warn(`[TechnicalAnalystAgent] Datos insuficientes de velas para ${symbol}:${timeframe}. Se necesitan al menos 50 velas y se obtuvieron ${velas.length}.`);

      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'INSUFFICIENT_DATA', 
          count: velas.length
        },
        justification: `El agente Técnico no pudo realizar el análisis por datos insuficientes en las velas (${velas.length}/50 requeridas).`
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    const precioActual = velas[velas.length - 1]?.close || 0;
    const preciosCierre = velas.map(v => v.close);

    const rsi = this.calcularRSI(preciosCierre, 14);
    const macd = this.calcularMACD(preciosCierre);
    
    const emaRapidaVal = this.calcularSMA(preciosCierre, 9); // SMA de periodo rápido (9) como proxy de tendencia rápida
    const emaLentaVal = this.calcularSMA(preciosCierre, 21);  // SMA de periodo lento (21) como proxy de tendencia lenta
    const emaTendencia = emaRapidaVal > emaLentaVal ? 'ALCISTA' : 'BAJISTA';

    const sma200 = this.calcularSMA(preciosCierre, 50); // SMA de control de tendencia a mediano plazo (50)
    const precioPorEncima = precioActual > sma200;

    const vwap = this.calcularVWAP(velas);
    const atr = this.calcularATR(velas, 14);
    const bollinger = this.calcularBandasBollinger(preciosCierre, 20);
    const adx = this.calcularADX(velas, 14);

    const indicadores: IndicadoresCuantitativos = {
      rsi,
      macd,
      ema: { rapida: Number(emaRapidaVal.toFixed(2)), lenta: Number(emaLentaVal.toFixed(2)), tendencia: emaTendencia },
      sma: { sma200: Number(sma200.toFixed(2)), precioPorEncima },
      vwap,
      atr: Number(atr.toFixed(2)),
      bollinger,
      adx
    };

    // Calcular score cuantitativo preliminar (-100 a +100)
    let scoreCuant = 0;

    // RSI
    if (rsi > 70) scoreCuant -= 20; // Sobrecompra
    else if (rsi < 30) scoreCuant += 20; // Sobreventa
    else if (rsi > 50) scoreCuant += 10;
    else scoreCuant -= 10;

    // MACD
    if (macd.crossover === 'BULLISH') scoreCuant += 25;
    else if (macd.crossover === 'BEARISH') scoreCuant -= 25;
    if (macd.histograma > 0) scoreCuant += 10;
    else scoreCuant -= 10;

    // EMA
    if (emaTendencia === 'ALCISTA') scoreCuant += 15;
    else scoreCuant -= 15;

    // SMA
    if (precioPorEncima) scoreCuant += 10;
    else scoreCuant -= 10;

    // VWAP
    if (vwap.precioRelativo === 'POR_ENCIMA') scoreCuant += 15;
    else if (vwap.precioRelativo === 'POR_DEBAJO') scoreCuant -= 15;

    // ADX
    if (adx.tendenciaFuerte) {
      if (adx.direccionalidad === 'ALCISTA') scoreCuant += 15;
      if (adx.direccionalidad === 'BAJISTA') scoreCuant -= 15;
    }

    // Clampar a rango seguro
    scoreCuant = Math.max(-100, Math.min(100, scoreCuant));

    // 2. Fase de Análisis Cognitivo (Slow-Loop) via Gemini
    let analisisVisual: AnalisisCognitivoVisual | undefined;
    let visualScoreContrib = 0;
    let confianza = 0.85; // Confianza base del modelo cuantitativo
    let notaContradiccion = '';

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        console.log('[TechnicalAnalystAgent] Ejecutando Slow-Loop. Invocando API de Gemini con datos OHLC reales...');

        // Llamamos al servicio con la serie temporal real
        analisisVisual = await analizarVelasConGemini(velas, symbol, timeframe);

        // Ajustamos la contribución de score basada en el análisis visual de Gemini
        if (analisisVisual.estructuraMercado === 'ALCISTA') visualScoreContrib += 40;
        else if (analisisVisual.estructuraMercado === 'BAJISTA') visualScoreContrib -= 40;

        if (analisisVisual.faseWyckoff === 'ACUMULACION' || analisisVisual.faseWyckoff === 'PARTICIPACION_ALCISTA') {
          visualScoreContrib += 20;
        } else if (analisisVisual.faseWyckoff === 'DISTRIBUCION' || analisisVisual.faseWyckoff === 'PARTICIPACION_BAJISTA') {
          visualScoreContrib -= 20;
        }

        const esBullishEst = analisisVisual.estructuraMercado === 'ALCISTA';
        const esBearishEst = analisisVisual.estructuraMercado === 'BAJISTA';
        const esBullishWyckoff = analisisVisual.faseWyckoff === 'ACUMULACION' || analisisVisual.faseWyckoff === 'PARTICIPACION_ALCISTA';
        const esBearishWyckoff = analisisVisual.faseWyckoff === 'DISTRIBUCION' || analisisVisual.faseWyckoff === 'PARTICIPACION_BAJISTA';

        if ((esBullishEst && esBearishWyckoff) || (esBearishEst && esBullishWyckoff)) {
          confianza = 0.75;
          notaContradiccion = ' [¡ALERTA!: Contradicción detectada entre la estructura de mercado y la fase Wyckoff]';
        } else if ((esBullishEst || esBearishEst) && (esBullishWyckoff || esBearishWyckoff)) {
          confianza = 0.95; // Señal cognitiva clara y coherente
        } else {
          confianza = 0.85; // Sin subir, solo confirmó ambigüedad
        }

        console.log('[TechnicalAnalystAgent] Análisis cognitivo visual integrado con éxito.');
      } catch (geminiError) {
        console.warn('[TechnicalAnalystAgent] Error en Slow-Loop de Gemini, continuando solo con indicadores matemáticos:', geminiError);
        // Fallback: Si falla Gemini, mantenemos el análisis cuantitativo puro
      }
    } else {
      console.log('[TechnicalAnalystAgent] Variable GEMINI_API_KEY no detectada. Operando exclusivamente en modo cuantitativo determinista.');
    }

    // 3. Consolidación Final
    let scoreFinal = scoreCuant;
    let justificacionConsolidada = '';

    if (analisisVisual) {
      // Ponderación: 50% Cuantitativo + 50% Visual de Gemini
      scoreFinal = Math.round((scoreCuant * 0.5) + (visualScoreContrib * 0.5));
      scoreFinal = Math.max(-100, Math.min(100, scoreFinal));

      justificacionConsolidada = `Confluencia Dual Alcanzada. [Matemático: ${scoreCuant > 0 ? '+' : ''}${scoreCuant} | Visual: ${visualScoreContrib > 0 ? '+' : ''}${visualScoreContrib}]. Estructura observada: ${analisisVisual.estructuraMercado}. Wyckoff: ${analisisVisual.faseWyckoff}.${notaContradiccion} Justificación: ${analisisVisual.resumenVisual}`;
    } else {
      const tendenciaRsi = rsi > 50 ? 'fuerza alcista' : 'debilidad bajista';
      const cruzamientoMacd = macd.crossover === 'BULLISH' ? 'cruce alcista' : macd.crossover === 'BEARISH' ? 'cruce bajista' : 'dirección estable';
      justificacionConsolidada = `Análisis Cuantitativo Determinista Completado. RSI en zona de ${tendenciaRsi} (${rsi}). MACD presenta un ${cruzamientoMacd}. Estructura general de medias móviles se muestra ${emaTendencia.toLowerCase()}.`;
    }

    // Estructuramos el output completo
    const output: TechnicalAnalystOutput = {
      simbolo: symbol,
      temporalidad: timeframe,
      timestamp: Date.now(),
      indicadores,
      analisisVisual,
      scoreConsolidado: scoreFinal,
      confianza,
      justificacionConsolidada
    };

    // 4. Escritura oficial tipada en el Blackboard
    const assessment: AgentAssessment = {
      agentName: this.name,
      timestamp: Date.now(),
      score: scoreFinal,
      confidence: confianza,
      data: output, // Encapsula todo el payload estructurado
      justification: justificacionConsolidada
    };

    this.blackboard.writeAssessment(symbol, timeframe, assessment);
    console.log(`[TechnicalAnalystAgent] Escritura en Blackboard exitosa para ${symbol}:${timeframe} con score: ${scoreFinal}`);
  }
}
