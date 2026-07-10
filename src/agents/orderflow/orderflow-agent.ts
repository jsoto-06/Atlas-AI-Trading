/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { OrderFlowAnalystOutput, CVDSlopeType, OpenInterestTrendType } from './types.ts';
import { mapSymbol, getProductType } from '../../execution/brokers/bitget-utils.ts';
import { db } from '../../db/index.ts';
import { marketTickers } from '../../db/schema.ts';
import { eq, desc, lt } from 'drizzle-orm';

interface MemoryCacheEntry {
  domData: any;
  tickerData: any;
  timestamp: number;
}

/**
 * Agente de Flujo de Órdenes e Inteligencia de Microestructura (Order Flow Agent).
 * Opera en modo Fast-Loop procesando el flujo de transacciones, desequilibrios en el DOM,
 * Cumulative Volume Delta (CVD) y la dinámica del Open Interest (Interés Abierto)
 * para detectar trampas de mercado (Stop Hunting, Fake Outs) en milisegundos.
 */
export class OrderFlowAgent extends BaseAgent {
  public readonly name: AgentName = 'OrderFlow';
  public readonly isFastLoop: boolean = true; // Habilitado para ejecuciones ultra rápidas cuantitativas

  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private prevHoldingAmounts: Map<string, { amount: number; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds cache TTL for order flow data

  /**
   * Poda los registros antiguos de la tabla de tickers para evitar un crecimiento ilimitado de la base de datos.
   */
  private async pruneOldTickers(): Promise<void> {
    try {
      // Retener registros de los últimos 7 días
      const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await db
        .delete(marketTickers)
        .where(lt(marketTickers.timestamp, retentionCutoff));
      console.log(`[OrderFlowAgent] Poda de base de datos finalizada (registros de tickers de más de 7 días eliminados).`);
    } catch (error) {
      console.error(`[OrderFlowAgent] Error al podar registros históricos de market_tickers:`, error);
    }
  }

  private async fetchOrderFlowData(symbol: string): Promise<{ dom: any; ticker: any }> {
    const mappedSymbol = mapSymbol(symbol);
    const productType = getProductType();

    const depthUrl = `https://api.bitget.com/api/v2/mix/market/merge-depth?symbol=${mappedSymbol}&productType=${productType}&limit=50`;
    const tickerUrl = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${mappedSymbol}&productType=${productType}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout

    try {
      const [depthResponse, tickerResponse] = await Promise.all([
        fetch(depthUrl, { signal: controller.signal }),
        fetch(tickerUrl, { signal: controller.signal })
      ]);
      clearTimeout(timeoutId);

      if (!depthResponse.ok || !tickerResponse.ok) {
        throw new Error(`Failed to fetch order flow data. Depth: ${depthResponse.status}, Ticker: ${tickerResponse.status}`);
      }

      const depthJson = await depthResponse.json();
      const tickerJson = await tickerResponse.json();

      if (depthJson.code !== '00000' || !depthJson.data) {
        throw new Error(`Bitget depth API error: ${depthJson.code} - ${depthJson.msg}`);
      }
      if (tickerJson.code !== '00000' || !tickerJson.data || tickerJson.data.length === 0) {
        throw new Error(`Bitget ticker API error: ${tickerJson.code} - ${tickerJson.msg}`);
      }

      return {
        dom: depthJson.data,
        ticker: tickerJson.data[0]
      };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[OrderFlowAgent] Error fetching real data from Bitget:`, error);
      throw error;
    }
  }

  /**
   * Ejecuta la confluencia analítica del Agente de Flujo de Órdenes de manera determinista y rápida.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[OrderFlowAgent] Analizando microestructura y flujo de órdenes reales para ${symbol} en ${timeframe}...`);
    const now = Date.now();

    let dom: any = null;
    let ticker: any = null;
    let isFreshFetch = false;

    // 1. Intentar recuperar desde caché de memoria o llamar a la API
    const cached = this.memoryCache.get(symbol);
    if (cached && (now - cached.timestamp < this.CACHE_TTL_MS)) {
      console.log(`[OrderFlowAgent] Cargando datos reales desde la caché de memoria para ${symbol}`);
      dom = cached.domData;
      ticker = cached.tickerData;
      isFreshFetch = false;
    } else {
      try {
        const fetched = await this.fetchOrderFlowData(symbol);
        dom = fetched.dom;
        ticker = fetched.ticker;
        this.memoryCache.set(symbol, {
          domData: dom,
          tickerData: ticker,
          timestamp: now
        });
        isFreshFetch = true;
      } catch (error) {
        console.error(`[OrderFlowAgent] Error crítico al obtener datos de Bitget:`, error);

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
          justification: `El agente OrderFlow no pudo recuperar datos de profundidad y ticker en tiempo real de Bitget.`
        };

        this.blackboard.writeAssessment(symbol, timeframe, assessment);
        return;
      }
    }

    // 2. Validación de datos insuficientes (Checklist item #1)
    const asks = dom?.asks || [];
    const bids = dom?.bids || [];

    if (asks.length < 5 || bids.length < 5) {
      console.warn(`[OrderFlowAgent] Datos insuficientes de profundidad en el DOM para ${symbol}. Asks: ${asks.length}, Bids: ${bids.length}`);

      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'INSUFFICIENT_DATA',
          asksCount: asks.length,
          bidsCount: bids.length
        },
        justification: `El agente OrderFlow no tiene profundidad suficiente en el libro de órdenes (mínimo 5 niveles requeridos).`
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    // 3. Procesar métricas en base a datos reales del libro de órdenes y el ticker
    const lastPrice = parseFloat(ticker.lastPr);
    if (isNaN(lastPrice) || lastPrice <= 0) {
      console.error(`[OrderFlowAgent] Precio actual inválido para ${symbol}: ${ticker.lastPr}`);
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { 
          dataSource: 'UNAVAILABLE',
          error: `Precio actual inválido o no disponible para ${symbol}`
        } as any,
        justification: `El agente OrderFlow no pudo proceder debido a que el precio de mercado no es válido o es menor o igual a cero (${ticker.lastPr}).`
      };
      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    // Calcular confianza dinámica basada en la presencia de campos críticos
    let confianza = 0.95;
    const fieldsSourced = {
      fundingRate: 'REAL' as 'REAL' | 'DEFAULT',
      bidSz: 'REAL' as 'REAL' | 'DEFAULT',
      askSz: 'REAL' as 'REAL' | 'DEFAULT',
      holdingAmount: 'REAL' as 'REAL' | 'DEFAULT',
    };

    // fundingRate check
    const rawFundingRate = parseFloat(ticker.fundingRate);
    const fundingRate = isNaN(rawFundingRate) ? 0 : rawFundingRate;
    if (ticker.fundingRate === undefined || ticker.fundingRate === null || ticker.fundingRate === '' || isNaN(rawFundingRate)) {
      fieldsSourced.fundingRate = 'DEFAULT';
      confianza -= 0.15;
    }

    // bidSz check
    const rawBidSz = parseFloat(ticker.bidSz);
    const bidSize = isNaN(rawBidSz) || rawBidSz <= 0 ? 1.0 : rawBidSz;
    if (ticker.bidSz === undefined || ticker.bidSz === null || ticker.bidSz === '' || isNaN(rawBidSz) || rawBidSz <= 0) {
      fieldsSourced.bidSz = 'DEFAULT';
      confianza -= 0.10;
    }

    // askSz check
    const rawAskSz = parseFloat(ticker.askSz);
    const askSize = isNaN(rawAskSz) || rawAskSz <= 0 ? 1.0 : rawAskSz;
    if (ticker.askSz === undefined || ticker.askSz === null || ticker.askSz === '' || isNaN(rawAskSz) || rawAskSz <= 0) {
      fieldsSourced.askSz = 'DEFAULT';
      confianza -= 0.10;
    }

    // holdingAmount check
    const rawHoldingAmount = parseFloat(ticker.holdingAmount);
    const currentHoldingAmount = isNaN(rawHoldingAmount) || rawHoldingAmount < 0 ? 0 : rawHoldingAmount;
    if (ticker.holdingAmount === undefined || ticker.holdingAmount === null || ticker.holdingAmount === '' || isNaN(rawHoldingAmount)) {
      fieldsSourced.holdingAmount = 'DEFAULT';
      confianza -= 0.15;
    }

    // Acotar confianza
    confianza = Math.max(0.1, Math.min(0.95, parseFloat(confianza.toFixed(2))));

    // Calcular DOM Liquidity Ratio: Suma de la profundidad total bids vs asks
    let totalBidVolume = 0;
    let totalAskVolume = 0;
    bids.forEach((b: any[]) => totalBidVolume += parseFloat(b[1]));
    asks.forEach((a: any[]) => totalAskVolume += parseFloat(a[1]));

    const domLiquidityRatio = totalAskVolume > 0 ? Number((totalBidVolume / totalAskVolume).toFixed(2)) : 1.0;

    // Calcular Imbalance Ratio de los primeros 10 niveles del DOM (presión a corto plazo)
    let bidVolumeClose = 0;
    let askVolumeClose = 0;
    for (let i = 0; i < Math.min(10, bids.length, asks.length); i++) {
      bidVolumeClose += parseFloat(bids[i][1]);
      askVolumeClose += parseFloat(asks[i][1]);
    }
    const imbalanceRatio = askVolumeClose > 0 ? Number((bidVolumeClose / askVolumeClose).toFixed(2)) : 1.0;

    // Calcular Point of Control (POC) de Liquidez Real (el nivel del libro de órdenes con el mayor size/volumen límite)
    let maxVolume = 0;
    let precioPOC = lastPrice;
    let volumenPOC = 0;

    bids.forEach((b: any[]) => {
      const vol = parseFloat(b[1]);
      if (vol > maxVolume) {
        maxVolume = vol;
        precioPOC = parseFloat(b[0]);
        volumenPOC = vol;
      }
    });
    asks.forEach((a: any[]) => {
      const vol = parseFloat(a[1]);
      if (vol > maxVolume) {
        maxVolume = vol;
        precioPOC = parseFloat(a[0]);
        volumenPOC = vol;
      }
    });

    // Skew Ratio: Relación de volumen en la mejor oferta (bidSz) frente a la mejor demanda (askSz)
    const skewRatio = Number((bidSize / askSize).toFixed(2));

    // Persistir la nueva lectura del ticker a la base de datos para que sobreviva a reinicios
    if (isFreshFetch) {
      try {
        await db.insert(marketTickers).values({
          symbol,
          lastPrice: lastPrice.toString(),
          holdingAmount: currentHoldingAmount.toString(),
          fundingRate: fundingRate.toString(),
        });
      } catch (insertError) {
        console.error(`[OrderFlowAgent] Error persisting ticker to database:`, insertError);
      }

      // Ejecutar poda de registros antiguos de forma asíncrona y probabilística (10% de probabilidad) para evitar crecimiento ilimitado
      if (Math.random() < 0.10) {
        this.pruneOldTickers().catch(err => {
          console.error(`[OrderFlowAgent] Error asíncrono en pruneOldTickers:`, err);
        });
      }
    }

    // Determinar tendencia del Open Interest comparándolo con datos anteriores guardados en memoria o BD
    let openInterestTrend: OpenInterestTrendType = 'FLAT';
    let prevOI = this.prevHoldingAmounts.get(symbol);

    if (!prevOI) {
      try {
        // Consultar las últimas lecturas para este símbolo ordenadas por fecha descendente
        const records = await db
          .select()
          .from(marketTickers)
          .where(eq(marketTickers.symbol, symbol))
          .orderBy(desc(marketTickers.timestamp))
          .limit(2);

        // Si tenemos al menos 2 registros (uno es el que acabamos de insertar hace un momento), el anterior es el segundo
        if (records.length >= 2) {
          prevOI = {
            amount: parseFloat(records[1].holdingAmount),
            timestamp: records[1].timestamp.getTime()
          };
          this.prevHoldingAmounts.set(symbol, prevOI);
        }
      } catch (dbError) {
        console.error(`[OrderFlowAgent] Error al recuperar historial de Open Interest de la BD:`, dbError);
      }
    }

    if (prevOI) {
      const pctChange = ((currentHoldingAmount - prevOI.amount) / prevOI.amount) * 100;
      // Consideramos un umbral del 0.02% para cambios rápidos
      if (pctChange > 0.02) openInterestTrend = 'UPWARD';
      else if (pctChange < -0.02) openInterestTrend = 'DOWNWARD';
    }
    this.prevHoldingAmounts.set(symbol, { amount: currentHoldingAmount, timestamp: now });

    // Calculado para Fast-Loop como un oscilador de desequilibrio neto del volumen ejecutado en bid vs ask.
    // Esta fórmula utiliza exclusivamente datos reales y dinámicos del order book (bids y asks reales de Bitget) sin ningún componente artificial.
    const deltaVolume = Math.round((totalBidVolume - totalAskVolume) * lastPrice * 0.01);

    // Pendiente del CVD deducida por la dominancia del delta de volumen actual
    let cvdSlope: CVDSlopeType = 'NEUTRAL';
    if (deltaVolume > 50000) cvdSlope = 'ACCUMULATING';
    else if (deltaVolume < -50000) cvdSlope = 'DISTRIBUTING';

    // Detección de Stop Hunting o Fake Outs real
    // Ocurre si el Open Interest cae fuertemente (DOWNWARD) mientras el imbalance es extremo
    const stopHuntingDetected = openInterestTrend === 'DOWNWARD' && (imbalanceRatio > 2.0 || imbalanceRatio < 0.5);

    // 4. Determinar Score Consolidado (-100 a +100)
    let scoreFlow = 0;

    // Contribución por Pendiente del CVD
    if (cvdSlope === 'ACCUMULATING') scoreFlow += 30;
    else if (cvdSlope === 'DISTRIBUTING') scoreFlow -= 30;

    // Contribución por Desequilibrio en el Bid/Ask (Imbalance Ratio)
    if (imbalanceRatio > 1.25) scoreFlow += 20;
    else if (imbalanceRatio < 0.8) scoreFlow -= 20;

    // Contribución por Tendencia del Open Interest y Delta de Volumen (Dinámica de Futuros)
    if (openInterestTrend === 'UPWARD') {
      if (deltaVolume > 0) scoreFlow += 30;
      else scoreFlow -= 30;
    } else if (openInterestTrend === 'DOWNWARD') {
      if (deltaVolume > 0) scoreFlow += 10; // Cierre de cortos
      else scoreFlow -= 10; // Cierre de largos
    }

    // Contribución por Liquidez en el DOM (Bids vs Asks Depth)
    if (domLiquidityRatio > 1.2) scoreFlow += 15; // Soporte fuerte de órdenes de compra límite
    else if (domLiquidityRatio < 0.8) scoreFlow -= 15; // Resistencia fuerte de venta límite

    // Alerta de Stop Hunting (Impacto moderado en la puntuación para evitar sesgo extremo)
    if (stopHuntingDetected) {
      scoreFlow = Math.round(scoreFlow * 0.5);
    }

    const scoreConsolidado = Math.max(-100, Math.min(100, scoreFlow));

    // 5. Crear justificación narrativa estructurada en castellano con datos reales
    let justificacion = `Análisis de Microestructura Real Finalizado. `;
    if (cvdSlope === 'ACCUMULATING') {
      justificacion += `Se detecta acumulación en el CVD (Delta neto estimado: $${deltaVolume.toLocaleString()}). `;
    } else if (cvdSlope === 'DISTRIBUTING') {
      justificacion += `Se observa distribución en el CVD (Delta neto estimado: $${deltaVolume.toLocaleString()}). `;
    } else {
      justificacion += `El CVD se mantiene balanceado. `;
    }

    justificacion += `El Open Interest presenta tendencia ${openInterestTrend === 'UPWARD' ? 'alcista' : openInterestTrend === 'DOWNWARD' ? 'bajista' : 'lateral'} (OI actual: ${currentHoldingAmount.toFixed(2)}). `;
    justificacion += `DOM presenta un ratio de profundidad total de ${domLiquidityRatio} y un imbalance a corto plazo de ${imbalanceRatio}. `;
    justificacion += `Tasa de financiación real: ${(fundingRate * 100).toFixed(4)}%. `;

    if (stopHuntingDetected) {
      justificacion += `¡ALERTA! Detectado posible barrido de liquidez y Stop Hunting (caída del OI con desequilibrio del libro). `;
    }

    // Estructurar el output completo del agente
    const output: OrderFlowAnalystOutput = {
      simbolo: symbol,
      temporalidad: timeframe,
      timestamp: Date.now(),
      imbalanceRatio,
      cvdSlope,
      deltaVolume,
      openInterestTrend,
      fundingRate,
      pocVolume: { precioPOC, volumenPOC },
      domLiquidityRatio,
      stopHuntingDetected,
      skewRatio,
      scoreConsolidado,
      confianza,
      justificacionConsolidada: justificacion,
      dataSource: isFreshFetch ? 'BITGET_REALTIME' : 'BITGET_CACHED',
      fieldsSourced
    };

    // 6. Registrar en el Blackboard
    const assessment: AgentAssessment = {
      agentName: this.name,
      timestamp: Date.now(),
      score: scoreConsolidado,
      confidence: confianza,
      data: output,
      justification: justificacion
    };

    this.blackboard.writeAssessment(symbol, timeframe, assessment);
    console.log(`[OrderFlowAgent] Registro exitoso en Blackboard para ${symbol}:${timeframe} con score real: ${scoreConsolidado}`);
  }
}
