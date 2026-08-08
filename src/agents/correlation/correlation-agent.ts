/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { CorrelationItem, CorrelationAnalystOutput } from './types.ts';

interface CacheEntry {
  prices: number[];
  timestamps: number[];
  timestamp: number;
}

/**
 * Agente de Análisis de Correlaciones Macro y Arbitraje Estadístico (Correlation Agent).
 * Calcula matemáticamente el coeficiente de correlación de Pearson en ventanas móviles
 * entre el activo analizado y un conjunto de activos macro de control:
 * - BTC (Bitcoin)
 * - ETH (Ethereum)
 * - NASDAQ (Tecnológicas de EE.UU.)
 * - SP500 (Rendimiento bursátil general)
 * - DXY (Índice del Dólar Estadounidense)
 * - VIX (Índice de Volatilidad / Miedo del Mercado)
 * - ORO (Activo de refugio tradicional)
 *
 * Emite alertas inmediatas si se detectan desvinculaciones o desacoples anómalos
 * que sugieren inminente rotación de capitales o anomalías de liquidez.
 */
export class CorrelationAgent extends BaseAgent {
  public readonly name: AgentName = 'Correlation';
  public readonly isFastLoop: boolean = true; // Habilitado para cálculos estadísticos directos

  private memoryCache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 60 seconds memory cache

  private mapSymbolToYahooTicker(symbol: string): string {
    const clean = symbol.replace('/', '').toUpperCase();
    if (clean.includes('BTC')) return 'BTC-USD';
    if (clean.includes('ETH')) return 'ETH-USD';
    if (clean.includes('SOL')) return 'SOL-USD';
    if (clean.includes('XRP')) return 'XRP-USD';
    if (clean.includes('ADA')) return 'ADA-USD';
    if (clean.includes('DOT')) return 'DOT-USD';
    if (clean.includes('DOGE')) return 'DOGE-USD';
    // Fallback general para crypto
    const base = symbol.split('/')[0] || clean.replace('USDT', '');
    return `${base}-USD`;
  }

  private async fetchYahooPriceSeries(ticker: string): Promise<{ prices: number[]; timestamps: number[] }> {
    const now = Date.now();
    const cached = this.memoryCache.get(ticker);
    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      return { prices: cached.prices, timestamps: cached.timestamps };
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=45d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const json = await response.json();
      const result = json?.chart?.result?.[0];
      if (!result) {
        throw new Error(`Structure invalid`);
      }

      const closes = result.indicators?.quote?.[0]?.close || [];
      const timestamps = result.timestamp || [];
      const validCloses: number[] = [];
      const validTimestamps: number[] = [];
      let lastPrice = 0;

      for (let i = 0; i < closes.length; i++) {
        const val = closes[i];
        const t = timestamps[i];
        if (t === undefined) continue;

        if (val !== null && typeof val === 'number' && !isNaN(val)) {
          validCloses.push(val);
          validTimestamps.push(t);
          lastPrice = val;
        } else if (lastPrice > 0) {
          validCloses.push(lastPrice); // forward fill weekends
          validTimestamps.push(t);
        }
      }

      this.memoryCache.set(ticker, { prices: validCloses, timestamps: validTimestamps, timestamp: now });
      return { prices: validCloses, timestamps: validTimestamps };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[CorrelationAgent] Failed fetching ticker ${ticker} from Yahoo:`, error);
      throw error;
    }
  }

  /**
   * Calcula el coeficiente de correlación de Pearson entre dos series numéricas de igual longitud.
   * Retorna un valor entre -1.0 (correlación inversa perfecta) y +1.0 (correlación directa perfecta).
   */
  private calcularPearson(serieA: number[], serieB: number[]): number {
    const n = Math.min(serieA.length, serieB.length);
    if (n === 0) return 0;

    const sliceA = serieA.slice(-n);
    const sliceB = serieB.slice(-n);

    const mediaA = sliceA.reduce((sum, val) => sum + val, 0) / n;
    const mediaB = sliceB.reduce((sum, val) => sum + val, 0) / n;

    let numerador = 0;
    let sumaCuadradosA = 0;
    let sumaCuadradosB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = sliceA[i] - mediaA;
      const diffB = sliceB[i] - mediaB;
      numerador += diffA * diffB;
      sumaCuadradosA += diffA * diffA;
      sumaCuadradosB += diffB * diffB;
    }

    if (sumaCuadradosA === 0 || sumaCuadradosB === 0) return 0;
    return Number((numerador / Math.sqrt(sumaCuadradosA * sumaCuadradosB)).toFixed(4));
  }

  /**
   * Clasifica cualitativamente la intensidad del coeficiente de Pearson.
   */
  private clasificarEstadoCorrelacion(coeficiente: number): 'FUERTE_DIRECTA' | 'MODERADA_DIRECTA' | 'DEBIL_DIRECTA' | 'NEUTRAL' | 'DEBIL_INVERSA' | 'MODERADA_INVERSA' | 'FUERTE_INVERSA' {
    if (coeficiente >= 0.7) return 'FUERTE_DIRECTA';
    if (coeficiente >= 0.4) return 'MODERADA_DIRECTA';
    if (coeficiente >= 0.15) return 'DEBIL_DIRECTA';
    if (coeficiente <= -0.7) return 'FUERTE_INVERSA';
    if (coeficiente <= -0.4) return 'MODERADA_INVERSA';
    if (coeficiente <= -0.15) return 'DEBIL_INVERSA';
    return 'NEUTRAL';
  }

  /**
   * Ejecuta el análisis de correlaciones estadísticas en tiempo real.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[CorrelationAgent] Analizando correlaciones macro reales para ${symbol}:${timeframe}...`);

    // Símbolo del activo operado mapeado a Yahoo ticker
    const activeTicker = this.mapSymbolToYahooTicker(symbol);

    // Listado de tickers macro a descargar de Yahoo Finance
    const tickersToFetch = {
      activo: activeTicker,
      btc: 'BTC-USD',
      eth: 'ETH-USD',
      nasdaq: '^IXIC',
      sp500: '^GSPC',
      dxy: 'DX-Y.NYB',
      vix: '^VIX',
      oro: 'GC=F'
    };

    const seriesData: { [key: string]: { prices: number[]; timestamps: number[] } } = {};
    const errors: string[] = [];

    // Fetches concurrentes para no bloquear
    const promises = Object.entries(tickersToFetch).map(async ([key, val]) => {
      try {
        const data = await this.fetchYahooPriceSeries(val);
        seriesData[key] = data;
      } catch (err) {
        errors.push(`${key} (${val}): ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    await Promise.allSettled(promises);

    // 1. Manejo de error de origen (Si falla el activo base, no hay análisis posible)
    if (!seriesData['activo'] || seriesData['activo'].prices.length === 0) {
      console.error(`[CorrelationAgent] Falló crítico: No se obtuvieron datos reales de precio para el activo base ${activeTicker}. Errores:`, errors);
      
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'UNAVAILABLE',
          errors
        },
        justification: `El agente Correlation no pudo recuperar las series de datos de precio reales desde Yahoo Finance.`
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    // 2. Validación de datos insuficientes (Checklist item #1)
    const minMuestrasRequeridas = 15;
    const lenActivo = seriesData['activo'].prices.length;

    if (lenActivo < minMuestrasRequeridas) {
      console.warn(`[CorrelationAgent] Datos insuficientes en el activo base ${activeTicker} (${lenActivo}/${minMuestrasRequeridas} muestras).`);

      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'INSUFFICIENT_DATA',
          muestrasObtenidas: lenActivo
        },
        justification: `El agente Correlation no tiene series de precios suficientemente largas (${lenActivo}/${minMuestrasRequeridas} requeridas).`
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    // Alinear las longitudes de las series para calcular Pearson
    const serieActivo = seriesData['activo'];

    const activosControlConfig = [
      { keyName: 'btc', nombre: 'BTC', comportamientoEsperado: 'DIRECTA' },
      { keyName: 'eth', nombre: 'ETH', comportamientoEsperado: 'DIRECTA' },
      { keyName: 'nasdaq', nombre: 'NASDAQ', comportamientoEsperado: 'DIRECTA' },
      { keyName: 'sp500', nombre: 'SP500', comportamientoEsperado: 'DIRECTA' },
      { keyName: 'dxy', nombre: 'DXY', comportamientoEsperado: 'INVERSA' },
      { keyName: 'vix', nombre: 'VIX', comportamientoEsperado: 'INVERSA' },
      { keyName: 'oro', nombre: 'ORO', comportamientoEsperado: 'CUALQUIERA' }
    ];

    const correlaciones: CorrelationItem[] = [];
    let descorrelacionAnomalaActiva = false;
    const anomaliasDetectadas: string[] = [];
    const baseSymbol = symbol.split('/')[0] || '';
    let controlesAusentes = 0;

    for (const ctrl of activosControlConfig) {
      const serieCtrl = seriesData[ctrl.keyName];

      if (!serieCtrl || serieCtrl.prices.length < minMuestrasRequeridas) {
        controlesAusentes++;
        // Marcamos este control como no disponible sin tirar todo el análisis
        correlaciones.push({
          activo: ctrl.nombre,
          coeficientePearson: 0,
          estado: 'NEUTRAL',
          anomaliaDetectada: false,
          comentario: `Datos reales de ${ctrl.nombre} no disponibles para el cálculo de Pearson.`
        });
        continue;
      }

      let pearson = 0;
      if (baseSymbol === ctrl.nombre) {
        pearson = 1.0;
      } else {
        // Alinear usando timestamps reales (normalizados a fecha YYYY-MM-DD para resolver fin de semana de mercados tradicionales)
        const mapActivo = new Map<string, number>();
        for (let i = 0; i < serieActivo.timestamps.length; i++) {
          const dateStr = new Date(serieActivo.timestamps[i] * 1000).toISOString().split('T')[0];
          mapActivo.set(dateStr, serieActivo.prices[i]);
        }

        const mapCtrl = new Map<string, number>();
        for (let i = 0; i < serieCtrl.timestamps.length; i++) {
          const dateStr = new Date(serieCtrl.timestamps[i] * 1000).toISOString().split('T')[0];
          mapCtrl.set(dateStr, serieCtrl.prices[i]);
        }

        // Intersección ordenada de fechas comunes
        const commonDates = Array.from(mapActivo.keys())
          .filter(date => mapCtrl.has(date))
          .sort();

        if (commonDates.length < minMuestrasRequeridas) {
          controlesAusentes++;
          correlaciones.push({
            activo: ctrl.nombre,
            coeficientePearson: 0,
            estado: 'NEUTRAL',
            anomaliaDetectada: false,
            comentario: `Muestras comunes insuficientes (${commonDates.length}/${minMuestrasRequeridas}) para ${ctrl.nombre}.`
          });
          continue;
        }

        const alignedActivo = commonDates.map(date => mapActivo.get(date)!);
        const alignedCtrl = commonDates.map(date => mapCtrl.get(date)!);

        pearson = this.calcularPearson(alignedActivo, alignedCtrl);
      }

      const estado = this.clasificarEstadoCorrelacion(pearson);
      let anomaliaDetectada = false;

      // Reglas de anomalía macro
      if (ctrl.comportamientoEsperado === 'DIRECTA' && pearson < -0.35 && baseSymbol !== ctrl.nombre) {
        anomaliaDetectada = true;
        descorrelacionAnomalaActiva = true;
        anomaliasDetectadas.push(`${ctrl.nombre} (Desacople bajista anómalo: ${pearson})`);
      } else if (ctrl.comportamientoEsperado === 'INVERSA' && pearson > 0.35) {
        anomaliaDetectada = true;
        descorrelacionAnomalaActiva = true;
        anomaliasDetectadas.push(`${ctrl.nombre} (Alineación alcista anómala: ${pearson})`);
      }

      let comentario = '';
      if (anomaliaDetectada) {
        comentario = `Alerta: Desacoplamiento estructural crítico detectado respecto a ${ctrl.nombre}.`;
      } else {
        comentario = `Correlación ${estado.toLowerCase().replace('_', ' ')} stable dentro de rangos macro.`;
      }

      correlaciones.push({
        activo: ctrl.nombre,
        coeficientePearson: pearson,
        estado,
        anomaliaDetectada,
        comentario
      });
    }

    // 3. Calcular Beta respecto a NASDAQ
    let betaMercado = 1.0;
    const nasdaqPrices = seriesData['nasdaq'];
    if (nasdaqPrices && nasdaqPrices.prices.length >= minMuestrasRequeridas) {
      // Alinear usando timestamps reales para Beta
      const mapActivo = new Map<string, number>();
      for (let i = 0; i < serieActivo.timestamps.length; i++) {
        const dateStr = new Date(serieActivo.timestamps[i] * 1000).toISOString().split('T')[0];
        mapActivo.set(dateStr, serieActivo.prices[i]);
      }

      const mapNasdaq = new Map<string, number>();
      for (let i = 0; i < nasdaqPrices.timestamps.length; i++) {
        const dateStr = new Date(nasdaqPrices.timestamps[i] * 1000).toISOString().split('T')[0];
        mapNasdaq.set(dateStr, nasdaqPrices.prices[i]);
      }

      const commonDates = Array.from(mapActivo.keys())
        .filter(date => mapNasdaq.has(date))
        .sort();

      if (commonDates.length >= minMuestrasRequeridas) {
        const alignedActivo = commonDates.map(date => mapActivo.get(date)!);
        const alignedNasdaq = commonDates.map(date => mapNasdaq.get(date)!);
        const size = commonDates.length;

        const meanActivo = alignedActivo.reduce((a, b) => a + b, 0) / size;
        const meanNasdaq = alignedNasdaq.reduce((a, b) => a + b, 0) / size;
        
        let cov = 0;
        let varNasdaq = 0;
        for (let i = 0; i < size; i++) {
          const diffActivo = alignedActivo[i] - meanActivo;
          const diffNasdaq = alignedNasdaq[i] - meanNasdaq;
          cov += diffActivo * diffNasdaq;
          varNasdaq += diffNasdaq * diffNasdaq;
        }
        betaMercado = varNasdaq === 0 ? 1.0 : Number((cov / varNasdaq).toFixed(2));
      }
    }

    // 4. Consolidar Score de Sentimiento (-100 a +100)
    let scoreAcumulado = 0;
    const nasdaqCorr = correlaciones.find(c => c.activo === 'NASDAQ')?.coeficientePearson || 0;
    const sp500Corr = correlaciones.find(c => c.activo === 'SP500')?.coeficientePearson || 0;
    const dxyCorr = correlaciones.find(c => c.activo === 'DXY')?.coeficientePearson || 0;
    const vixCorr = correlaciones.find(c => c.activo === 'VIX')?.coeficientePearson || 0;

    scoreAcumulado += nasdaqCorr * 40; 
    scoreAcumulado += sp500Corr * 20; 
    scoreAcumulado -= dxyCorr * 30;    
    scoreAcumulado -= vixCorr * 10;    

    let scoreConsolidado = Math.round(scoreAcumulado);

    if (descorrelacionAnomalaActiva) {
      scoreConsolidado = Math.round(scoreConsolidado * 0.7); // Atenuar por incertidumbre
    }

    scoreConsolidado = Math.max(-100, Math.min(100, scoreConsolidado));
    
    // Confianza reducida proporcionalmente según cuántos de los activos de control no se pudieron obtener (-0.1 por cada uno)
    let confianzaBase = descorrelacionAnomalaActiva ? 0.75 : 0.95;
    const confianza = Math.max(0.1, Number((confianzaBase - (controlesAusentes * 0.1)).toFixed(2)));

    // 5. Elaboración de la justificación consolidada
    let justificacion = `Análisis de Correlaciones Reales Completado. Beta de mercado respecto a NASDAQ: ${betaMercado}. `;
    if (descorrelacionAnomalaActiva) {
      justificacion += `¡ATENCIÓN! Se detectan anomalías de desacoplamiento macro en: ${anomaliasDetectadas.join(', ')}. `;
    } else {
      justificacion += `El comportamiento muestra sintonía con índices globales (NASDAQ r=${nasdaqCorr.toFixed(2)}) e inversa con el índice del dólar (DXY r=${dxyCorr.toFixed(2)}). `;
    }
    justificacion += `VIX operando en r=${vixCorr.toFixed(2)}.`;

    // Estructura oficial del output de correlaciones
    const output: CorrelationAnalystOutput = {
      simbolo: symbol,
      temporalidad: timeframe,
      timestamp: Date.now(),
      correlaciones,
      descorrelacionAnomalaActiva,
      betaMercado,
      scoreConsolidado,
      confianza,
      justificacionConsolidada: justificacion
    };

    // Registrar en Blackboard
    const assessment: AgentAssessment = {
      agentName: this.name,
      timestamp: Date.now(),
      score: scoreConsolidado,
      confidence: confianza,
      data: output,
      justification: justificacion
    };

    this.blackboard.writeAssessment(symbol, timeframe, assessment);
    console.log(`[CorrelationAgent] Escritura en Blackboard finalizada para ${symbol}:${timeframe} con score real: ${scoreConsolidado}`);
  }
}
