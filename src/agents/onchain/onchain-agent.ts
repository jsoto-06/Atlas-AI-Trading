/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { OnChainAnalystOutput, WhaleActivityType, DormantCoinsType, MVRVStatusType, NVTStatusType } from './types.ts';
import { GoogleGenAI, Type } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

interface OnChainCache {
  timestamp: number;
  transactionCount: number;
  mempoolSize: number;
}

let btcOnChainCache: OnChainCache | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // Cache de 15 minutos

/**
 * Inicializador perezoso para el cliente oficial de Gemini API.
 */
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

/**
 * Consulta en tiempo real y con timeout los endpoints gratuitos de blockchain.info para BTC.
 * Retorna null ante cualquier error o si la caché de emergencia supera el límite de 2 horas.
 */
async function fetchBtcOnChainData(): Promise<{ transactionCount: number; mempoolSize: number; isStale: boolean } | null> {
  const now = Date.now();
  if (btcOnChainCache && (now - btcOnChainCache.timestamp < CACHE_TTL_MS)) {
    console.log('[OnChainAgent] Retornando datos on-chain de BTC desde la caché.');
    return {
      transactionCount: btcOnChainCache.transactionCount,
      mempoolSize: btcOnChainCache.mempoolSize,
      isStale: false
    };
  }

  const timeoutMs = 8000;
  try {
    console.log('[OnChainAgent] Consultando blockchain.info para transacciones de 24h de BTC...');
    const controller1 = new AbortController();
    const id1 = setTimeout(() => controller1.abort(), timeoutMs);
    const txCountRes = await fetch('https://blockchain.info/q/24hrtransactioncount', {
      signal: controller1.signal
    });
    clearTimeout(id1);

    if (!txCountRes.ok) {
      throw new Error(`Error en API transacciones: ${txCountRes.statusText}`);
    }
    const txCountText = await txCountRes.text();
    const transactionCount = parseInt(txCountText.trim(), 10);
    if (isNaN(transactionCount)) {
      throw new Error('La respuesta de transacciones no es un número válido');
    }

    console.log('[OnChainAgent] Consultando blockchain.info para el tamaño del mempool de BTC...');
    const controller2 = new AbortController();
    const id2 = setTimeout(() => controller2.abort(), timeoutMs);
    const mempoolRes = await fetch('https://blockchain.info/charts/mempool-size?timespan=2days&format=json', {
      signal: controller2.signal
    });
    clearTimeout(id2);

    if (!mempoolRes.ok) {
      throw new Error(`Error en API mempool: ${mempoolRes.statusText}`);
    }
    const mempoolJson = (await mempoolRes.json()) as any;
    let mempoolSize = 0;
    if (mempoolJson && Array.isArray(mempoolJson.values) && mempoolJson.values.length > 0) {
      const lastPoint = mempoolJson.values[mempoolJson.values.length - 1];
      if (lastPoint && typeof lastPoint.y === 'number') {
        mempoolSize = lastPoint.y;
      }
    }

    btcOnChainCache = {
      timestamp: now,
      transactionCount,
      mempoolSize
    };

    return { transactionCount, mempoolSize, isStale: false };
  } catch (error) {
    console.error('[OnChainAgent] Falló la consulta on-chain en tiempo real de blockchain.info:', error);
    const MAX_STALE_AGE_MS = 2 * 60 * 60 * 1000; // 2 horas de límite máximo para caché de emergencia
    if (btcOnChainCache) {
      const ageMs = now - btcOnChainCache.timestamp;
      if (ageMs < MAX_STALE_AGE_MS) {
        console.warn('[OnChainAgent] Retornando datos de caché expirados como salvaguarda secundaria (isStale: true).');
        return {
          transactionCount: btcOnChainCache.transactionCount,
          mempoolSize: btcOnChainCache.mempoolSize,
          isStale: true
        };
      } else {
        console.warn(`[OnChainAgent] La caché expirada supera el límite máximo de antigüedad de 2 horas (${(ageMs / 1000 / 60).toFixed(1)} minutos). Se trata como no disponible.`);
      }
    }
    return null;
  }
}

/**
 * Agente de Análisis On-Chain (On-Chain Agent).
 * Extrae métricas clave de la actividad en la red blockchain (transacciones y congestión del mempool).
 * Utiliza capacidades cognitivas de Gemini para correlacionar transferencias masivas
 * e interpretar las señales reales en vez de emitir juicios ficticios.
 */
export class OnChainAgent extends BaseAgent {
  public readonly name: AgentName = 'OnChain';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (acceso a API / razonamiento)

  /**
   * Generador de análisis de fallback determinista local usando datos reales de BTC.
   * Evita fallos en cadena de la orquestación.
   */
  private ejecutarAnalisisFallbackConDatosReales(
    realData: { transactionCount: number; mempoolSize: number; isStale: boolean },
    symbol: string,
    timeframe: string
  ): OnChainAnalystOutput {
    console.log('[OnChainAgent] Ejecutando análisis heurístico local On-Chain con DATOS REALES (Modo Fallback)...');

    const txCount = realData.transactionCount;
    const mempool = realData.mempoolSize;

    // Evaluaciones heurísticas basadas en datos reales de Bitcoin
    const nvtStatus: NVTStatusType = txCount > 350000 ? 'BULLISH' : txCount > 250000 ? 'NEUTRAL' : 'BEARISH';
    const dormantCoinsMovement: DormantCoinsType = mempool > 150000000 ? 'HIGH' : mempool > 60000000 ? 'MEDIUM' : 'LOW';
    const whaleActivity: WhaleActivityType = txCount > 400000 ? 'ACCUMULATING' : 'HOLDING';

    let scoreConsolidado = 0;
    if (nvtStatus === 'BULLISH') scoreConsolidado += 30;
    if (nvtStatus === 'BEARISH') scoreConsolidado -= 30;
    if (dormantCoinsMovement === 'LOW') scoreConsolidado += 20;
    if (dormantCoinsMovement === 'HIGH') scoreConsolidado -= 20;

    const formattedMempoolMB = (mempool / (1024 * 1024)).toFixed(2);
    const staleSuffix = realData.isStale ? ' (DATOS HISTÓRICOS DE RESPALDO)' : '';
    const justificacionConsolidada = `Análisis heurístico local basado en datos on-chain de BTC reales${staleSuffix}. Volumen transaccional de 24h: ${txCount.toLocaleString()} transacciones, indicando un nivel de actividad de red ${nvtStatus === 'BULLISH' ? 'elevado (alcista)' : 'moderado'}. Tamaño del mempool: ${formattedMempoolMB} MB, sugiriendo congestión de red ${dormantCoinsMovement === 'HIGH' ? 'crítica (precaución)' : 'bajo control'}.`;

    const confianza = realData.isStale ? 0.3 : 0.6;

    return {
      simbolo: symbol,
      temporalidad: timeframe,
      timestamp: Date.now(),
      exchangeInflows: null,
      exchangeOutflows: null,
      whaleActivity,
      dormantCoinsMovement,
      mvrvStatus: 'FAIR',
      nvtStatus,
      institutionalAccumulation: {
        detectada: txCount > 350000,
        confianza: confianza,
        descripcion: `Actividad de acumulación estimada mediante volumen transaccional de red real (${txCount.toLocaleString()} txs/día).`
      },
      scoreConsolidado,
      confianza: confianza,
      justificacionConsolidada,
      dataSource: 'LOCAL_FALLBACK_ON_REAL_DATA'
    };
  }

  /**
   * Genera el output de tipo UNAVAILABLE cuando las fuentes on-chain no están disponibles.
   */
  private ejecutarAnalisisUnavailable(symbol: string, timeframe: string, razon: string): OnChainAnalystOutput {
    return {
      simbolo: symbol,
      temporalidad: timeframe,
      timestamp: Date.now(),
      exchangeInflows: null,
      exchangeOutflows: null,
      whaleActivity: 'HOLDING',
      dormantCoinsMovement: 'LOW',
      mvrvStatus: 'FAIR',
      nvtStatus: 'NEUTRAL',
      institutionalAccumulation: {
        detectada: false,
        confianza: 0.1,
        descripcion: 'Análisis on-chain no disponible.'
      },
      scoreConsolidado: 0,
      confianza: 0.1,
      justificacionConsolidada: razon,
      dataSource: 'UNAVAILABLE'
    };
  }

  /**
   * Analiza los datos de la blockchain utilizando Gemini y datos reales integrados de blockchain.info.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[OnChainAgent] Analizando métricas on-chain para ${symbol}:${timeframe}...`);

    const baseAsset = symbol.split('/')[0]?.toUpperCase() || symbol.split('-')[0]?.toUpperCase() || '';
    
    // 1. Validar que sea Bitcoin (BTC). Si no lo es, retornar UNAVAILABLE inmediatamente sin inventar datos.
    if (baseAsset !== 'BTC') {
      const output = this.ejecutarAnalisisUnavailable(
        symbol,
        timeframe,
        `La fuente de datos on-chain en tiempo real está limitada temporalmente a Bitcoin (BTC). El activo actual (${baseAsset || symbol}) no tiene soporte de métricas on-chain en este agente por el momento.`
      );

      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: output.scoreConsolidado,
        confidence: output.confianza,
        data: output,
        justification: output.justificacionConsolidada
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      console.log(`[OnChainAgent] Agente no disponible para ${symbol}. Guardado assessment UNAVAILABLE.`);
      return;
    }

    // 2. Intentar obtener datos reales para BTC
    const realData = await fetchBtcOnChainData();

    let output: OnChainAnalystOutput;

    if (!realData) {
      // Si falló blockchain.info y no hay caché, retornar UNAVAILABLE
      output = this.ejecutarAnalisisUnavailable(
        symbol,
        timeframe,
        'Las fuentes de datos on-chain en tiempo real para BTC (blockchain.info) no respondieron o están temporalmente fuera de servicio. Bloqueo de seguridad activo.'
      );
    } else {
      const client = getGeminiClient();

      if (client) {
        try {
          console.log('[OnChainAgent] Invocando Gemini para el análisis cognitivo on-chain con datos reales de BTC...');

          const systemPrompt = `Eres un analista on-chain de nivel institucional especializado en microestructura y flujos de capitales de Bitcoin.
Se te presentan métricas en tiempo real extraídas directamente de la red de bloques de Bitcoin (BTC) para el par ${symbol} en la temporalidad ${timeframe}.
Tu tarea consiste en interpretar estas métricas reales y generar una evaluación diagnóstica precisa:
- Transacciones de las últimas 24 horas en la red de Bitcoin: ${realData.transactionCount.toLocaleString()}
- Tamaño actual del mempool (en bytes): ${realData.mempoolSize.toLocaleString()} bytes (${(realData.mempoolSize / (1024 * 1024)).toFixed(2)} MB)

Por favor, realiza un análisis en profundidad:
1. Evalúa si el volumen transaccional diario es alto (por encima de 300,000 es saludable/bullish) o bajo (por debajo de 250,000 indica desinterés/bearish).
2. Evalúa si la congestión del mempool representa pánico o un nivel ordinario de actividad.
3. Identifica la actividad de ballenas: ACCUMULATING, DISTRIBUTING o HOLDING.
4. Evalúa el movimiento de monedas antiguas/latentes (Dormant Coins): HIGH, MEDIUM, o LOW (basándote de manera indirecta en la congestión y el dinamismo de la red).
5. Diagnosticar el estado estructural del MVRV: UNDERVALUED (infravalorado), OVERVALUED (sobrevalorado), o FAIR (precio justo).
6. Diagnosticar la señal del NVT: BULLISH (salud transaccional), BEARISH (sobrevaloración por bajo uso), o NEUTRAL.
7. Detectar si hay indicios claros de acumulación institucional silenciosa.
8. Asignar un score cuantitativo consolidado final unificado para el Blackboard en el rango de -100 (desinterés, pánico o red vacía) a +100 (acumulación institucional extrema y alta utilidad).
9. Definir tu nivel de confianza (0.0 a 1.0) y escribir un informe analítico estricto en CASTELLANO.

Reglas críticas de negocio:
- Devuelve la respuesta strictly estructurada según el esquema JSON indicado.
- Todo texto explicativo, justificaciones y narrativas deben ser estrictamente en CASTELLANO.
- Basa tu análisis de manera rigurosa en los datos cuantitativos reales provistos. No inventes transacciones ni datos no proporcionados.`;

          const response = await client.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [
              {
                text: `Métricas reales de blockchain.info recolectadas de la red de bloques:\n${JSON.stringify(realData, null, 2)}`
              }
            ],
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  whaleActivity: {
                    type: Type.STRING,
                    enum: ['ACCUMULATING', 'DISTRIBUTING', 'HOLDING']
                  },
                  dormantCoinsMovement: {
                    type: Type.STRING,
                    enum: ['HIGH', 'MEDIUM', 'LOW']
                  },
                  mvrvStatus: {
                    type: Type.STRING,
                    enum: ['UNDERVALUED', 'OVERVALUED', 'FAIR']
                  },
                  nvtStatus: {
                    type: Type.STRING,
                    enum: ['BULLISH', 'BEARISH', 'NEUTRAL']
                  },
                  institutionalAccumulation: {
                    type: Type.OBJECT,
                    properties: {
                      detectada: { type: Type.BOOLEAN },
                      confianza: { type: Type.NUMBER },
                      descripcion: { type: Type.STRING }
                    },
                    required: ['detectada', 'confianza', 'descripcion']
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
                    description: 'Análisis detallado de correlación on-chain escrito en castellano.'
                  }
                },
                required: [
                  'whaleActivity',
                  'dormantCoinsMovement',
                  'mvrvStatus',
                  'nvtStatus',
                  'institutionalAccumulation',
                  'scoreConsolidado',
                  'confianza',
                  'justificacionConsolidada'
                ]
              }
            }
          });

          if (!response.text) {
            throw new Error('La respuesta de Gemini para el análisis on-chain está vacía.');
          }

          const data = JSON.parse(response.text);

          const finalConfianza = Math.max(0.1, Math.min(1.0, realData.isStale ? (data.confianza * 0.5) : data.confianza));
          const finalJustificacion = realData.isStale
            ? `${data.justificacionConsolidada} (Nota: Análisis realizado con datos históricos de respaldo debido a fallo temporal en la API en tiempo real).`
            : data.justificacionConsolidada;

          output = {
            simbolo: symbol,
            temporalidad: timeframe,
            timestamp: Date.now(),
            exchangeInflows: null,
            exchangeOutflows: null,
            whaleActivity: data.whaleActivity as WhaleActivityType,
            dormantCoinsMovement: data.dormantCoinsMovement as DormantCoinsType,
            mvrvStatus: data.mvrvStatus as MVRVStatusType,
            nvtStatus: data.nvtStatus as NVTStatusType,
            institutionalAccumulation: {
              detectada: data.institutionalAccumulation.detectada,
              confianza: realData.isStale ? Math.max(0.1, data.institutionalAccumulation.confianza * 0.5) : data.institutionalAccumulation.confianza,
              descripcion: data.institutionalAccumulation.descripcion
            },
            scoreConsolidado: Math.max(-100, Math.min(100, data.scoreConsolidado)),
            confianza: finalConfianza,
            justificacionConsolidada: finalJustificacion,
            dataSource: 'GEMINI_ANALYSIS'
          };

          console.log('[OnChainAgent] Análisis cognitivo on-chain con Gemini completado.');
        } catch (geminiError) {
          console.warn('[OnChainAgent] Error al invocar Gemini para análisis on-chain, recurriendo a fallback con datos reales:', geminiError);
          output = this.ejecutarAnalisisFallbackConDatosReales(realData, symbol, timeframe);
        }
      } else {
        console.log('[OnChainAgent] GEMINI_API_KEY no configurado. Iniciando fallback local con datos reales...');
        output = this.ejecutarAnalisisFallbackConDatosReales(realData, symbol, timeframe);
      }
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
    console.log(`[OnChainAgent] Blackboard actualizado con éxito para ${symbol}:${timeframe} con score: ${output.scoreConsolidado} (DataSource: ${output.dataSource})`);
  }
}
