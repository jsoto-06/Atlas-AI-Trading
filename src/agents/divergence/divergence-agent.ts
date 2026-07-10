/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { DivergenceItem, DivergenceAnalystOutput, DivergenceType, IndicatorType } from './types.ts';
import { mapSymbol, getProductType, mapTimeframeToGranularity } from '../../execution/brokers/bitget-utils.ts';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CacheEntry {
  candles: Candle[];
  timestamp: number;
}

/**
 * Agente de Escaneo de Divergencias de Alta Probabilidad (Divergence Agent).
 * Opera en modo Fast-Loop procesando picos (máximos) y valles (mínimos) reales consecutivos.
 * Compara la acción del precio real de Bitget con cuatro osciladores y variables de volumen reales:
 * - RSI (Relative Strength Index)
 * - MACD (Moving Average Convergence Divergence)
 * - CVD (Cumulative Volume Delta / aproximado vía On-Balance Volume en velas)
 * - Volume (Volumen de transacción bruto)
 */
export class DivergenceAgent extends BaseAgent {
  public readonly name: AgentName = 'Divergence';
  public readonly isFastLoop: boolean = true; // Agente matemático de alta velocidad

  private memoryCache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute memory cache for candles

  private async fetchCandlesFromBitget(symbol: string, timeframe: string): Promise<Candle[]> {
    const mappedSymbol = mapSymbol(symbol);
    const productType = getProductType();
    const granularity = mapTimeframeToGranularity(timeframe);
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
      console.error(`[DivergenceAgent] Error fetching candles from Bitget:`, error);
      throw error;
    }
  }

  private calcularRSI(precios: number[], periodos = 14): number[] {
    const rsi: number[] = new Array(precios.length).fill(50);
    if (precios.length < periodos + 1) return rsi;

    let ganancias = 0;
    let perdidas = 0;

    for (let i = 1; i <= periodos; i++) {
      const diff = precios[i] - precios[i - 1];
      if (diff > 0) ganancias += diff;
      else perdidas -= diff;
    }

    let avgGain = ganancias / periodos;
    let avgLoss = perdidas / periodos;
    
    rsi[periodos] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = periodos + 1; i < precios.length; i++) {
      const diff = precios[i] - precios[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (periodos - 1) + gain) / periodos;
      avgLoss = (avgLoss * (periodos - 1) + loss) / periodos;

      rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }

    return rsi;
  }

  private calcularEMA(precios: number[], periodos: number): number[] {
    const ema: number[] = [];
    if (precios.length === 0) return [];
    const k = 2 / (periodos + 1);
    let val = precios[0];
    ema.push(val);
    for (let i = 1; i < precios.length; i++) {
      val = precios[i] * k + val * (1 - k);
      ema.push(val);
    }
    return ema;
  }

  private calcularMACD(precios: number[]): number[] {
    const ema12 = this.calcularEMA(precios, 12);
    const ema26 = this.calcularEMA(precios, 26);
    const macdLine: number[] = [];
    for (let i = 0; i < precios.length; i++) {
      macdLine.push((ema12[i] || 0) - (ema26[i] || 0));
    }
    return macdLine;
  }

  private calcularOBV(precios: number[], volumenes: number[]): number[] {
    const obv: number[] = [];
    if (precios.length === 0) return [];
    let currentOBV = 0;
    obv.push(currentOBV);
    for (let i = 1; i < precios.length; i++) {
      if (precios[i] > precios[i - 1]) {
        currentOBV += volumenes[i];
      } else if (precios[i] < precios[i - 1]) {
        currentOBV -= volumenes[i];
      }
      obv.push(currentOBV);
    }
    return obv;
  }

  /**
   * Encuentra los índices de los picos (máximos locales) o valles (mínimos locales) en una serie.
   * Un punto i es pico/valle si supera/es menor que sus N vecinos a la izquierda y derecha.
   */
  private encontrarPivotes(
    serie: number[],
    tipo: 'PICO' | 'VALLE',
    ventana = 3
  ): number[] {
    const indices: number[] = [];
    const n = serie.length;

    for (let i = ventana; i < n - ventana; i++) {
      const val = serie[i];
      let esPivote = true;

      for (let j = 1; j <= ventana; j++) {
        if (tipo === 'PICO') {
          if (serie[i - j] >= val || serie[i + j] >= val) {
            esPivote = false;
            break;
          }
        } else { // VALLE
          if (serie[i - j] <= val || serie[i + j] <= val) {
            esPivote = false;
            break;
          }
        }
      }

      if (esPivote) {
        indices.push(i);
      }
    }

    return indices;
  }

  /**
   * Escanea divergencias regulares y ocultas comparando los pivotes de las series de precio e indicador.
   */
  private escanearDivergencia(
    precios: number[],
    valoresIndicador: number[],
    indicador: IndicatorType
  ): DivergenceItem {
    let tipo: DivergenceType = 'NONE';
    let confirmado = false;
    let comentario = 'Sin divergencias estructurales de pivotes detectadas en este intervalo.';
    let indexA = Math.floor(precios.length * 0.2);
    let indexB = precios.length - 1;

    // 1. Escaneo de Divergencias Alcistas (Bullish) usando VALLES reales
    const valles = this.encontrarPivotes(precios, 'VALLE', 3);
    if (valles.length >= 2) {
      const valB = valles[valles.length - 1];
      const valA = valles[valles.length - 2];

      const pA = precios[valA];
      const pB = precios[valB];
      const indA = valoresIndicador[valA];
      const indB = valoresIndicador[valB];

      if (pB < pA && indB > indA) {
        tipo = 'BULLISH_REGULAR';
        confirmado = true;
        indexA = valA;
        indexB = valB;
        comentario = `Divergencia Alcista REGULAR confirmada en ${indicador}: El precio marcó un mínimo local más bajo en la vela #${valB} (${pB.toFixed(2)}) comparado con la vela #${valA} (${pA.toFixed(2)}), pero el indicador dibujó un mínimo más alto (${indB.toFixed(2)} vs ${indA.toFixed(2)}), señalando pérdida de momentum vendedor.`;
      } else if (pB > pA && indB < indA) {
        tipo = 'BULLISH_HIDDEN';
        confirmado = true;
        indexA = valA;
        indexB = valB;
        comentario = `Divergencia Alcista OCULTA confirmada en ${indicador}: El precio marcó un mínimo local más alto en la vela #${valB} (${pB.toFixed(2)}) comparado con la vela #${valA} (${pA.toFixed(2)}), pero el indicador creó un mínimo más bajo (${indB.toFixed(2)} vs ${indA.toFixed(2)}), sugiriendo continuación de tendencia alcista.`;
      }
    }

    // 2. Escaneo de Divergencias Bajistas (Bearish) usando PICOS reales
    if (!confirmado) {
      const picos = this.encontrarPivotes(precios, 'PICO', 3);
      if (picos.length >= 2) {
        const picB = picos[picos.length - 1];
        const picA = picos[picos.length - 2];

        const pA = precios[picA];
        const pB = precios[picB];
        const indA = valoresIndicador[picA];
        const indB = valoresIndicador[picB];

        if (pB > pA && indB < indA) {
          tipo = 'BEARISH_REGULAR';
          confirmado = true;
          indexA = picA;
          indexB = picB;
          comentario = `Divergencia Bajista REGULAR confirmada en ${indicador}: El precio marcó un máximo local más alto en la vela #${picB} (${pB.toFixed(2)}) comparado con la vela #${picA} (${pA.toFixed(2)}), pero el indicador dibujó un pico descendente (${indB.toFixed(2)} vs ${indA.toFixed(2)}), señalando agotamiento de la demanda.`;
        } else if (pB < pA && indB > indA) {
          tipo = 'BEARISH_HIDDEN';
          confirmado = true;
          indexA = picA;
          indexB = picB;
          comentario = `Divergencia Bajista OCULTA confirmada en ${indicador}: El precio marcó un máximo local más bajo en la vela #${picB} (${pB.toFixed(2)}) comparado con la vela #${picA} (${pA.toFixed(2)}), pero el indicador creó un pico más alto (${indB.toFixed(2)} vs ${indA.toFixed(2)}), sugiriendo continuación de tendencia bajista.`;
        }
      }
    }

    return {
      indicador,
      tipo,
      confirmado,
      precioPuntoA: { precio: precios[indexA], indice: indexA, valorIndicador: valoresIndicador[indexA] },
      precioPuntoB: { precio: precios[indexB], indice: indexB, valorIndicador: valoresIndicador[indexB] },
      comentario
    };
  }

  /**
   * Ejecuta el escaneo de divergencias en paralelo sobre múltiples osciladores reales.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[DivergenceAgent] Escaneando divergencias matemáticas reales para ${symbol}:${timeframe}...`);
    const now = Date.now();
    let candles: Candle[] = [];

    // 1. Obtener velas de Bitget (o de caché)
    const cacheKey = `${symbol}-${timeframe}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      candles = cached.candles;
    } else {
      try {
        candles = await this.fetchCandlesFromBitget(symbol, timeframe);
        this.memoryCache.set(cacheKey, { candles, timestamp: now });
      } catch (error) {
        console.error(`[DivergenceAgent] Error crítico al obtener velas de Bitget para divergencia:`, error);
        
        // Retornar assessment UNAVAILABLE en caso de falla de API
        const assessment: AgentAssessment = {
          agentName: this.name,
          timestamp: Date.now(),
          score: 0,
          confidence: 0.1,
          data: { 
            dataSource: 'UNAVAILABLE',
            error: error instanceof Error ? error.message : String(error)
          },
          justification: `El agente Divergence no pudo recuperar las velas en tiempo real de Bitget para su cálculo.`
        };

        this.blackboard.writeAssessment(symbol, timeframe, assessment);
        return;
      }
    }

    // 2. Validación de datos insuficientes (Checklist item #1)
    const minMuestras = 35;
    if (candles.length < minMuestras) {
      console.warn(`[DivergenceAgent] Datos insuficientes de velas para ${symbol}:${timeframe}. Se requieren al menos ${minMuestras} y se obtuvieron ${candles.length}.`);

      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'INSUFFICIENT_DATA', 
          count: candles.length
        },
        justification: `El agente Divergence no pudo realizar el escaneo por datos insuficientes en las velas (${candles.length}/${minMuestras} requeridas).`
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    // 3. Extraer series numéricas reales
    const preciosCierre = candles.map(c => c.close);
    const volumenes = candles.map(c => c.volume);

    // 4. Calcular indicadores técnicos reales
    const serieRSI = this.calcularRSI(preciosCierre, 14);
    const serieMACD = this.calcularMACD(preciosCierre);
    const serieOBV = this.calcularOBV(preciosCierre, volumenes); // OBV actúa como un proxy excelente de CVD histórico

    // 5. Escanear divergencias sobre los osciladores reales
    const items: DivergenceItem[] = [
      this.escanearDivergencia(preciosCierre, serieRSI, 'RSI'),
      this.escanearDivergencia(preciosCierre, serieMACD, 'MACD'),
      this.escanearDivergencia(preciosCierre, serieOBV, 'CVD'),
      this.escanearDivergencia(preciosCierre, volumenes, 'VOLUME')
    ];

    // 6. Evaluar confluencia y estado general de la divergencia
    const confirmados = items.filter(item => item.confirmado);
    const confluenciaDivergencias = confirmados.length >= 2;

    let estadoDivergenciaGeneral: 'ALCISTA' | 'BAJISTA' | 'NEUTRAL' = 'NEUTRAL';
    let conteoAlcista = 0;
    let conteoBajista = 0;

    for (const item of confirmados) {
      if (item.tipo.startsWith('BULLISH')) {
        conteoAlcista++;
      } else if (item.tipo.startsWith('BEARISH')) {
        conteoBajista++;
      }
    }

    if (conteoAlcista > conteoBajista) {
      estadoDivergenciaGeneral = 'ALCISTA';
    } else if (conteoBajista > conteoAlcista) {
      estadoDivergenciaGeneral = 'BAJISTA';
    }

    // 7. Determinar Score Consolidado (-100 a +100)
    let scoreConsolidado = 0;
    if (estadoDivergenciaGeneral === 'ALCISTA') {
      scoreConsolidado = Math.min(100, conteoAlcista * 25);
    } else if (estadoDivergenciaGeneral === 'BAJISTA') {
      scoreConsolidado = Math.max(-100, -conteoBajista * 25);
    }

    const confianza = confirmados.length > 0 ? (confluenciaDivergencias ? 0.95 : 0.75) : 0.50;

    // 8. Elaborar justificación narrativa real
    let justificacion = `Escaneo de fractales y divergencias sobre datos reales de Bitget finalizado. `;
    if (confirmados.length > 0) {
      justificacion += `Se detecta consenso ${estadoDivergenciaGeneral} activo confirmado por: ${confirmados.map(c => c.indicador).join(', ')}. `;
      if (confluenciaDivergencias) {
        justificacion += `¡ALTA PROBABILIDAD! Se consolida un patrón armónico de confluencia en múltiples osciladores. `;
      }
    } else {
      justificacion += `El precio y los osciladores reales se desplazan en sintonía. No existen divergencias estructurales en este intervalo.`;
    }

    const output: DivergenceAnalystOutput = {
      simbolo: symbol,
      temporalidad: timeframe,
      timestamp: Date.now(),
      divergenciasDetectadas: items,
      confluenciaDivergencias,
      estadoDivergenciaGeneral,
      scoreConsolidado,
      confianza,
      justificacionConsolidada: justificacion
    };

    // 9. Escribir al Blackboard
    const assessment: AgentAssessment = {
      agentName: this.name,
      timestamp: Date.now(),
      score: scoreConsolidado,
      confidence: confianza,
      data: output,
      justification: justificacion
    };

    this.blackboard.writeAssessment(symbol, timeframe, assessment);
    console.log(`[DivergenceAgent] Pizarra de divergencias reales actualizada para ${symbol}:${timeframe} con score: ${scoreConsolidado}`);
  }
}
