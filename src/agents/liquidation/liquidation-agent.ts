/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { LiquidationAnalystOutput, LiquidationPool, SqueezeRiskType } from './types.ts';
import { GoogleGenAI, Type } from '@google/genai';
import { mapSymbol, getProductType } from '../../execution/brokers/bitget-utils.ts';

let aiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

interface MemoryCacheEntry {
  dom: any;
  ticker: any;
  timestamp: number;
}

/**
 * Agente de Monitoreo de Zonas de Liquidación y Liquidez Magnética (Liquidation Agent).
 * Identifica grupos (pools) de alta densidad de órdenes apalancadas en el mercado de derivados.
 * Evalúa los riesgos de estrangulamiento de posiciones (Short / Long Squeezes) y utiliza
 * procesamiento cognitivo avanzado mediante Gemini para categorizar si los picos de liquidación
 * y barridos representan "claudicación" de minoristas o trampas institucionales (Spring/Upthrust de Wyckoff).
 */
export class LiquidationAgent extends BaseAgent {
  public readonly name: AgentName = 'Liquidation';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (evaluación profunda Wyckoff)

  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds memory cache

  private async fetchMarketDepthAndTicker(symbol: string): Promise<{ dom: any; ticker: any }> {
    const mappedSymbol = mapSymbol(symbol);
    const productType = getProductType();

    const depthUrl = `https://api.bitget.com/api/v2/mix/market/merge-depth?symbol=${mappedSymbol}&productType=${productType}&limit=50`;
    const tickerUrl = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${mappedSymbol}&productType=${productType}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

    try {
      const [depthResponse, tickerResponse] = await Promise.all([
        fetch(depthUrl, { signal: controller.signal }),
        fetch(tickerUrl, { signal: controller.signal })
      ]);
      clearTimeout(timeoutId);

      if (!depthResponse.ok || !tickerResponse.ok) {
        throw new Error(`Failed to fetch order book for liquidation. Depth: ${depthResponse.status}, Ticker: ${tickerResponse.status}`);
      }

      const depthJson = await depthResponse.json();
      const tickerJson = await tickerResponse.json();

      if (depthJson.code !== '00000' || !depthJson.data) {
        throw new Error(`Bitget depth API error: ${depthJson.code}`);
      }
      if (tickerJson.code !== '00000' || !tickerJson.data || tickerJson.data.length === 0) {
        throw new Error(`Bitget ticker API error: ${tickerJson.code}`);
      }

      return {
        dom: depthJson.data,
        ticker: tickerJson.data[0]
      };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[LiquidationAgent] Failed fetching market data from Bitget:`, error);
      throw error;
    }
  }

  /**
   * Estima de forma realista el mapa de calor de liquidaciones usando el apalancamiento retail típico (20x, 50x, 100x)
   * mapeado sobre la profundidad real (DOM) y volumen del ticker de Bitget.
   */
  private estimarMapaLiquidaciones(precioActual: number, dom: any, ticker: any): {
    volumenLiquidaciones24h: { longsUSD: number; shortsUSD: number; totalUSD: number };
    piscinasLiquidezMagnetica: LiquidationPool[];
    squeezeRisk: SqueezeRiskType;
  } {
    const asks = dom?.asks || [];
    const bids = dom?.bids || [];

    // Volumen operado en 24h real en USD
    const usdVolume24h = parseFloat(ticker.usdtVolume) || 100000000; 

    // Estimación empírica: el volumen de liquidación acumulado de 24h suele representar cerca del 0.05% al 0.15% del volumen de futuros
    const totalLiquidacionesEst = usdVolume24h * 0.001; 
    const skewLados = bids.length > asks.length ? 0.6 : 0.4; // sesgo por la liquidez actual

    const longsUSD = Math.round(totalLiquidacionesEst * skewLados);
    const shortsUSD = Math.round(totalLiquidacionesEst * (1 - skewLados));
    const totalUSD = longsUSD + shortsUSD;

    // Calcular el volumen de órdenes límite real promedio en el DOM
    let sumBidUSD = 0;
    bids.forEach((b: any[]) => sumBidUSD += parseFloat(b[0]) * parseFloat(b[1]));
    const avgBidLevelUSD = bids.length > 0 ? sumBidUSD / bids.length : 10000;

    let sumAskUSD = 0;
    asks.forEach((a: any[]) => sumAskUSD += parseFloat(a[0]) * parseFloat(a[1]));
    const avgAskLevelUSD = asks.length > 0 ? sumAskUSD / asks.length : 10000;

    // 100x leverage: +-1% del precio actual
    // 50x leverage: +-2% del precio actual
    // 20x leverage: +-5% del precio actual
    
    // Estimación de los pools de liquidación: combinamos los tamaños de órdenes límite reales del DOM
    // con un multiplicador de futuros retail (típicamente de 15x a 40x del tamaño de órdenes en el spot/límite)
    const factorApalancamientoFuturos = 35; 

    // Piscina 100x Longs: [precioActual * 0.985, precioActual * 0.995] (-1%)
    const vol100xLongs = Math.round(avgBidLevelUSD * factorApalancamientoFuturos * 1.5);
    // Piscina 50x Longs: [precioActual * 0.975, precioActual * 0.984] (-2%)
    const vol50xLongs = Math.round(avgBidLevelUSD * factorApalancamientoFuturos * 2.5);
    // Piscina 20x Longs: [precioActual * 0.945, precioActual * 0.965] (-5%)
    const vol20xLongs = Math.round(avgBidLevelUSD * factorApalancamientoFuturos * 4.0);

    // Piscina 100x Shorts: [precioActual * 1.005, precioActual * 1.015] (+1%)
    const vol100xShorts = Math.round(avgAskLevelUSD * factorApalancamientoFuturos * 1.5);
    // Piscina 50x Shorts: [precioActual * 1.016, precioActual * 1.025] (+2%)
    const vol50xShorts = Math.round(avgAskLevelUSD * factorApalancamientoFuturos * 2.5);
    // Piscina 20x Shorts: [precioActual * 1.045, precioActual * 1.055] (+5%)
    const vol20xShorts = Math.round(avgAskLevelUSD * factorApalancamientoFuturos * 3.5);

    const piscinasLiquidezMagnetica: LiquidationPool[] = [
      {
        rangoPrecio: {
          bajo: Number((precioActual * 0.985).toFixed(2)),
          alto: Number((precioActual * 0.995).toFixed(2))
        },
        volumenEstimadoUSD: vol100xLongs,
        densidad: vol100xLongs > 5000000 ? 'EXTREMA' : 'ALTA',
        distanciaPrecioPct: -1.0
      },
      {
        rangoPrecio: {
          bajo: Number((precioActual * 0.975).toFixed(2)),
          alto: Number((precioActual * 0.984).toFixed(2))
        },
        volumenEstimadoUSD: vol50xLongs,
        densidad: vol50xLongs > 8000000 ? 'EXTREMA' : 'MEDIA',
        distanciaPrecioPct: -2.0
      },
      {
        rangoPrecio: {
          bajo: Number((precioActual * 0.945).toFixed(2)),
          alto: Number((precioActual * 0.965).toFixed(2))
        },
        volumenEstimadoUSD: vol20xLongs,
        densidad: 'MEDIA',
        distanciaPrecioPct: -5.0
      },
      {
        rangoPrecio: {
          bajo: Number((precioActual * 1.005).toFixed(2)),
          alto: Number((precioActual * 1.015).toFixed(2))
        },
        volumenEstimadoUSD: vol100xShorts,
        densidad: vol100xShorts > 5000000 ? 'EXTREMA' : 'ALTA',
        distanciaPrecioPct: 1.0
      },
      {
        rangoPrecio: {
          bajo: Number((precioActual * 1.016).toFixed(2)),
          alto: Number((precioActual * 1.025).toFixed(2))
        },
        volumenEstimadoUSD: vol50xShorts,
        densidad: vol50xShorts > 8000000 ? 'EXTREMA' : 'MEDIA',
        distanciaPrecioPct: 2.0
      },
      {
        rangoPrecio: {
          bajo: Number((precioActual * 1.045).toFixed(2)),
          alto: Number((precioActual * 1.055).toFixed(2))
        },
        volumenEstimadoUSD: vol20xShorts,
        densidad: 'MEDIA',
        distanciaPrecioPct: 5.0
      }
    ];

    // Ordenar por densidad para identificar los polos gravitatorios de liquidez magnética
    piscinasLiquidezMagnetica.sort((a, b) => b.volumenEstimadoUSD - a.volumenEstimadoUSD);

    // Calcular el riesgo de Squeeze
    const totalLongPoolsUSD = vol100xLongs + vol50xLongs + vol20xLongs;
    const totalShortPoolsUSD = vol100xShorts + vol50xShorts + vol20xShorts;

    let squeezeRisk: SqueezeRiskType = 'NEUTRAL';
    if (totalLongPoolsUSD > totalShortPoolsUSD * 1.4) {
      squeezeRisk = 'HIGH_LONG_SQUEEZE'; // Riesgo alto de barrido descendente de longs
    } else if (totalShortPoolsUSD > totalLongPoolsUSD * 1.4) {
      squeezeRisk = 'HIGH_SHORT_SQUEEZE'; // Riesgo alto de barrido ascendente de shorts
    }

    return {
      volumenLiquidaciones24h: { longsUSD, shortsUSD, totalUSD },
      piscinasLiquidezMagnetica,
      squeezeRisk
    };
  }

  /**
   * Ejecuta un análisis determinista secundario si Gemini no está configurado o falla.
   */
  private ejecutarAnalisisFallback(
    raw: any,
    symbol: string,
    timeframe: string
  ): LiquidationAnalystOutput {
    console.log('[LiquidationAgent] Ejecutando diagnóstico local de piscinas de liquidación real (Modo Fallback)...');

    const scoreConsolidado = raw.squeezeRisk === 'HIGH_LONG_SQUEEZE' ? -40 : raw.squeezeRisk === 'HIGH_SHORT_SQUEEZE' ? 40 : 10;
    
    const principalPool = raw.piscinasLiquidezMagnetica[0];
    const justificacionConsolidada = `Análisis de microestructura y liquidaciones teóricas completado con éxito sobre el libro de órdenes real de Bitget. ` +
      `La piscina con mayor densidad se encuentra a $${principalPool.rangoPrecio.bajo.toLocaleString()} - $${principalPool.rangoPrecio.alto.toLocaleString()} ` +
      `con un volumen estimado de $${principalPool.volumenEstimadoUSD.toLocaleString()} (${principalPool.distanciaPrecioPct}% de distancia, densidad ${principalPool.densidad}). ` +
      `Volumen total estimado de liquidaciones en 24h: $${raw.volumenLiquidaciones24h.totalUSD.toLocaleString()}. ` +
      `El riesgo general de estrangulamiento de mercado (squeeze) se cataloga como ${raw.squeezeRisk}.`;

    return {
      simbolo: symbol,
      temporalidad: timeframe,
      timestamp: Date.now(),
      dataSource: 'ESTIMATED_FROM_REAL_ORDERBOOK',
      volumenLiquidaciones24h: raw.volumenLiquidaciones24h,
      squeezeRisk: raw.squeezeRisk,
      piscinasLiquidezMagnetica: raw.piscinasLiquidezMagnetica,
      stopHuntingPatronDetectado: raw.squeezeRisk !== 'NEUTRAL',
      scoreConsolidado,
      confianza: 0.85,
      justificacionConsolidada
    };
  }

  /**
   * Analiza las zonas de liquidaciones reales utilizando Gemini.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[LiquidationAgent] Analizando liquidez magnética y liquidación en tiempo real para ${symbol}:${timeframe}...`);
    const now = Date.now();

    let dom: any = null;
    let ticker: any = null;

    // 1. Obtener datos reales de Bitget
    const cacheKey = symbol;
    const cached = this.memoryCache.get(cacheKey);
    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      dom = cached.dom;
      ticker = cached.ticker;
    } else {
      try {
        const data = await this.fetchMarketDepthAndTicker(symbol);
        dom = data.dom;
        ticker = data.ticker;
        this.memoryCache.set(cacheKey, { dom, ticker, timestamp: now });
      } catch (error) {
        console.error(`[LiquidationAgent] Falló crítico al consultar Bitget:`, error);
        
        const assessment: AgentAssessment = {
          agentName: this.name,
          timestamp: Date.now(),
          score: 0,
          confidence: 0.1,
          data: { 
            dataSource: 'UNAVAILABLE',
            error: error instanceof Error ? error.message : String(error)
          },
          justification: `El agente Liquidation no pudo recuperar la profundidad del order book en tiempo real de Bitget.`
        };

        this.blackboard.writeAssessment(symbol, timeframe, assessment);
        return;
      }
    }

    // 2. Validación de datos insuficientes (Checklist item #1)
    if (!dom || !dom.bids || dom.bids.length < 5 || !dom.asks || dom.asks.length < 5) {
      console.warn(`[LiquidationAgent] Datos de profundidad insuficientes para estimar liquidaciones para ${symbol}.`);

      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'INSUFFICIENT_DATA',
          bidsCount: dom?.bids?.length || 0,
          asksCount: dom?.asks?.length || 0
        },
        justification: `El agente Liquidation no tiene datos suficientes en el libro de órdenes (mínimo 5 niveles requeridos).`
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    // 3. Estimar mapa de calor de liquidaciones real
    const precioActual = parseFloat(ticker.lastPr);
    if (isNaN(precioActual) || precioActual <= 0) {
      console.error(`[LiquidationAgent] Invalid ticker last price for ${symbol}: ${ticker.lastPr}`);
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'UNAVAILABLE',
          error: `Precio actual inválido o no disponible para ${symbol}`
        },
        justification: `El agente Liquidation no pudo proceder debido a que el precio actual no es un número válido (${ticker.lastPr}).`
      };
      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    const rawData = this.estimarMapaLiquidaciones(precioActual, dom, ticker);

    let output: LiquidationAnalystOutput;
    const client = getGeminiClient();

    if (client) {
      try {
        console.log('[LiquidationAgent] Invocando Gemini para la decodificación estructural de liquidaciones reales (Esquema Wyckoff)...');

        const systemPrompt = `Eres un experto en microestructura de mercado, trading de orden de flujo y analista sénior en derivados.
Tu especialidad consiste en interpretar cómo las instituciones manipulan las piscinas de liquidación minorista para acumular o distribuir (Esquema de Wyckoff: Spring, Upthrust, Test, Liquidity Sweeps).
Analiza los datos de liquidaciones reales estimadas y piscinas magnéticas recopilados para el par ${symbol} en la temporalidad ${timeframe}, y determina:
1. Si los picos de liquidaciones teóricas representan claudicación de minoristas o una trampa institucional deliberada para tomar liquidez.
2. Identifica si existe riesgo de un Short Squeeze o Long Squeeze.
3. Evalúa si el patrón es concordante con un Spring de Wyckoff (barrido de mínimos con reversión alcista) o un Upthrust (barrido de máximos con reversión bajista).
4. Determina si el precio actual se siente atraído de manera gravitatoria a los pools de liquidez más densos cercanos.
5. Asigna un score cuantitativo unificado para el Blackboard entre -100 (inminente barrido en cascada de longs / pánico bajista) y +100 (inminente short squeeze masivo / catalizador alcista).
6. Proporciona tu nivel de confianza y redacta un informe analítico sumamente profesional en CASTELLANO.

Reglas críticas de negocio:
- Devuelve la respuesta estrictamente adaptada al esquema JSON indicado.
- Todo texto explicativo, justificaciones y narrativas deben ser estrictamente en CASTELLANO.`;

        const response = await client.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              text: `Métricas de derivados y Pools de Liquidación basados en el libro de órdenes en tiempo real de Bitget:\n${JSON.stringify({ precioActual, ...rawData }, null, 2)}`
            }
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                squeezeRisk: {
                  type: Type.STRING,
                  enum: ['HIGH_LONG_SQUEEZE', 'HIGH_SHORT_SQUEEZE', 'NEUTRAL']
                },
                stopHuntingPatronDetectado: {
                  type: Type.BOOLEAN,
                  description: 'Indica si se detecta un patrón de Wyckoff (Spring/Upthrust/Stop Hunt)'
                },
                scoreConsolidado: {
                  type: Type.INTEGER,
                  description: 'Puntuación consolidada final de -100 a +100 para el Blackboard'
                },
                confianza: {
                  type: Type.NUMBER
                },
                justificacionConsolidada: {
                  type: Type.STRING,
                  description: 'Informe estructural profundo de liquidaciones y análisis Wyckoff escrito en castellano.'
                }
              },
              required: [
                'squeezeRisk',
                'stopHuntingPatronDetectado',
                'scoreConsolidado',
                'confianza',
                'justificacionConsolidada'
              ]
            }
          }
        });

        if (!response.text) {
          throw new Error('La respuesta de Gemini para el análisis de liquidación está vacía.');
        }

        const data = JSON.parse(response.text);

        output = {
          simbolo: symbol,
          temporalidad: timeframe,
          timestamp: Date.now(),
          dataSource: 'ESTIMATED_FROM_REAL_ORDERBOOK',
          volumenLiquidaciones24h: rawData.volumenLiquidaciones24h,
          squeezeRisk: data.squeezeRisk as SqueezeRiskType,
          piscinasLiquidezMagnetica: rawData.piscinasLiquidezMagnetica,
          stopHuntingPatronDetectado: data.stopHuntingPatronDetectado,
          scoreConsolidado: Math.max(-100, Math.min(100, data.scoreConsolidado)),
          confianza: data.confianza,
          justificacionConsolidada: data.justificacionConsolidada
        };

        console.log('[LiquidationAgent] Análisis cognitivo de derivados y liquidación completado.');
      } catch (geminiError) {
        console.warn('[LiquidationAgent] Error al invocar Gemini, recurriendo a fallback determinista:', geminiError);
        output = this.ejecutarAnalisisFallback(rawData, symbol, timeframe);
      }
    } else {
      console.log('[LiquidationAgent] GEMINI_API_KEY no configurado. Ejecutando fallback directo...');
      output = this.ejecutarAnalisisFallback(rawData, symbol, timeframe);
    }

    // Registrar en Blackboard
    const assessment: AgentAssessment = {
      agentName: this.name,
      timestamp: Date.now(),
      score: output.scoreConsolidado,
      confidence: output.confianza,
      data: output,
      justification: output.justificacionConsolidada
    };

    this.blackboard.writeAssessment(symbol, timeframe, assessment);
    console.log(`[LiquidationAgent] Registro exitoso en Blackboard para ${symbol}:${timeframe} con score real: ${output.scoreConsolidado}`);
  }
}
