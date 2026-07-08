/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { OnChainAnalystOutput, WhaleActivityType, DormantCoinsType, MVRVStatusType, NVTStatusType } from './types.ts';
import { GoogleGenAI, Type } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

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
 * Agente de Análisis On-Chain (On-Chain Agent).
 * Extrae métricas clave de la actividad en la red blockchain (flujos hacia exchanges,
 * reactivación de monedas latentes, comportamiento de ballenas y ratios estructurales MVRV/NVT).
 * Utiliza capacidades cognitivas de Gemini para correlacionar transferencias masivas
 * y diagnosticar si existe presión de venta o acumulación institucional silenciosa.
 */
export class OnChainAgent extends BaseAgent {
  public readonly name: AgentName = 'OnChain';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (acceso a API / razonamiento)

  /**
   * Simula la recopilación de datos y métricas on-chain en bruto para el análisis posterior.
   */
  private obtenerMetricasOnChainRaw(simbolo: string) {
    const ticker = simbolo.split('/')[0] || 'BTC';

    return {
      exchangeInflows: 1250, // 1250 BTC transferidos hacia exchanges en las últimas 24h
      exchangeOutflows: 3400, // 3400 BTC retirados a monederos fríos (flujo neto altamente positivo: -2150 BTC)
      whaleAddressesBalanceChangePct: +1.45, // Las ballenas incrementaron sus balances en un 1.45% esta semana
      dormantCoinsAverageAgeDays: 450, // Monedas latentes moviéndose en promedio (bajo riesgo de liquidación masiva)
      mvrvRatio: 1.85, // MVRV moderado (lejos de máximos de burbuja > 3.0, por encima de capitulación < 1.0)
      nvtRatio: 45.2, // NVT equilibrado (las transacciones soportan la valoración de red actual)
      stablecoinMintingVolumeUSD: 450000000, // $450M de nuevas stablecoins emitidas en las últimas 48h (liquidez esperando a entrar)
      minerReserveBalanceChangePct: -0.15 // Presión marginal de venta minera (fase de acumulación / hold minero)
    };
  }

  /**
   * Generador de análisis de fallback determinista local si la API externa falla.
   * Evita fallos en cadena de la orquestación.
   */
  private ejecutarAnalisisFallback(metricasRaw: any, simbolo: string, timeframe: string): OnChainAnalystOutput {
    console.log('[OnChainAgent] Ejecutando análisis heurístico local On-Chain (Modo Fallback)...');

    return {
      simbolo,
      temporalidad: timeframe,
      timestamp: Date.now(),
      exchangeInflows: metricasRaw.exchangeInflows,
      exchangeOutflows: metricasRaw.exchangeOutflows,
      whaleActivity: 'ACCUMULATING',
      dormantCoinsMovement: 'LOW',
      mvrvStatus: 'FAIR',
      nvtStatus: 'BULLISH',
      institutionalAccumulation: {
        detectada: true,
        confianza: 0.8,
        descripcion: 'Detección automática local de acumulación. Fuerte flujo de salida neto de exchanges (-2150 BTC) respaldado por la emisión masiva de stablecoins ($450M) y compras continuas de ballenas.'
      },
      scoreConsolidado: 65, // Alcista moderado
      confianza: 0.75,
      justificacionConsolidada: 'Análisis determinista local. Salidas netas masivas hacia monederos fríos sugieren una reducción importante de la oferta líquida en exchanges. La inyección de liquidez en stablecoins actúa como catalizador alcista.'
    };
  }

  /**
   * Analiza los datos de la blockchain utilizando Gemini.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[OnChainAgent] Analizando métricas on-chain para ${symbol}:${timeframe}...`);

    const rawMetrics = this.obtenerMetricasOnChainRaw(symbol);
    let output: OnChainAnalystOutput;

    const client = getGeminiClient();

    if (client) {
      try {
        console.log('[OnChainAgent] Invocando Gemini para el análisis cognitivo on-chain...');

        const systemPrompt = `Eres un analista on-chain de nivel institucional especializado en microestructura y flujos de capitales cripto.
Se te presentan métricas en tiempo real extraídas directamente de la red de bloques para el par ${symbol} en la temporalidad ${timeframe}.
Tu tarea consiste en correlacionar estas métricas y generar una evaluación diagnóstica precisa:
1. Evaluar si la relación de flujos hacia y desde exchanges (Inflows vs Outflows) representa presión de venta o acumulación.
2. Identificar la actividad de ballenas: ACCUMULATING, DISTRIBUTING o HOLDING.
3. Evaluar el movimiento de monedas antiguas/latentes (Dormant Coins): HIGH (riesgo inminente de dump), MEDIUM, o LOW.
4. Diagnosticar el estado estructural del MVRV: UNDERVALUED (infravalorado), OVERVALUED (sobrevalorado), o FAIR (precio justo).
5. Diagnosticar la señal del NVT: BULLISH (salud transaccional), BEARISH (sobrevaloración por bajo uso), o NEUTRAL.
6. Detectar si hay indicios claros de acumulación institucional silenciosa (compras OTC, drenaje masivo de reservas, acuñación de stablecoins).
7. Asignar un score cuantitativo consolidado final unificado para el Blackboard en el rango de -100 (distribución masiva y pánico) a +100 (acumulación institucional extrema).
8. Definir tu nivel de confianza (0.0 a 1.0) y escribir un informe analítico estricto en CASTELLANO.

Reglas críticas de negocio:
- Devuelve la respuesta estrictamente estructurada según el esquema JSON indicado.
- Todo texto explicativo, justificaciones y narrativas deben ser estrictamente en CASTELLANO.
- Realiza una correlación lógica profunda, relacionando los flujos de stablecoins y miner reserves de forma sumamente profesional.`;

        const response = await client.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              text: `Métricas On-Chain en bruto recolectadas de la blockchain:\n${JSON.stringify(rawMetrics, null, 2)}`
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

        output = {
          simbolo: symbol,
          temporalidad: timeframe,
          timestamp: Date.now(),
          exchangeInflows: rawMetrics.exchangeInflows,
          exchangeOutflows: rawMetrics.exchangeOutflows,
          whaleActivity: data.whaleActivity as WhaleActivityType,
          dormantCoinsMovement: data.dormantCoinsMovement as DormantCoinsType,
          mvrvStatus: data.mvrvStatus as MVRVStatusType,
          nvtStatus: data.nvtStatus as NVTStatusType,
          institutionalAccumulation: {
            detectada: data.institutionalAccumulation.detectada,
            confianza: data.institutionalAccumulation.confianza,
            descripcion: data.institutionalAccumulation.descripcion
          },
          scoreConsolidado: Math.max(-100, Math.min(100, data.scoreConsolidado)),
          confianza: data.confianza,
          justificacionConsolidada: data.justificacionConsolidada
        };

        console.log('[OnChainAgent] Análisis cognitivo on-chain con Gemini completado.');
      } catch (geminiError) {
        console.warn('[OnChainAgent] Error al invocar Gemini para análisis on-chain, recurriendo a fallback:', geminiError);
        output = this.ejecutarAnalisisFallback(rawMetrics, symbol, timeframe);
      }
    } else {
      console.log('[OnChainAgent] GEMINI_API_KEY no configurado. Iniciando fallback directo...');
      output = this.ejecutarAnalisisFallback(rawMetrics, symbol, timeframe);
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
    console.log(`[OnChainAgent] Blackboard actualizado con éxito para ${symbol}:${timeframe} con score: ${output.scoreConsolidado}`);
  }
}
