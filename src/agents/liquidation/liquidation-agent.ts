/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { LiquidationAnalystOutput, LiquidationPool, SqueezeRiskType } from './types.ts';
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
 * Agente de Monitoreo de Zonas de Liquidación y Liquidez Magnética (Liquidation Agent).
 * Identifica grupos (pools) de alta densidad de órdenes apalancadas en el mercado de derivados.
 * Evalúa los riesgos de estrangulamiento de posiciones (Short / Long Squeezes) y utiliza
 * procesamiento cognitivo avanzado mediante Gemini para categorizar si los picos de liquidación
 * y barridos representan "claudicación" de minoristas o trampas institucionales (Spring/Upthrust de Wyckoff).
 */
export class LiquidationAgent extends BaseAgent {
  public readonly name: AgentName = 'Liquidation';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (evaluación profunda Wyckoff)

  /**
   * Simula la extracción de piscinas de liquidación magnética y flujos en tiempo real.
   */
  private obtenerMetricasLiquidacionRaw(precioActual: number): {
    volumenLiquidaciones24h: { longsUSD: number; shortsUSD: number; totalUSD: number };
    piscinasLiquidezMagnetica: LiquidationPool[];
    squeezeRisk: SqueezeRiskType;
  } {
    const longsUSD = 3450000; // $3.45M de longs liquidados en 24h
    const shortsUSD = 1200000; // $1.2M de shorts liquidados en 24h
    const totalUSD = longsUSD + shortsUSD;

    // Generar pools de liquidaciones magneticas por encima y por debajo del precio actual
    const piscinasLiquidezMagnetica: LiquidationPool[] = [
      {
        rangoPrecio: {
          bajo: Number((precioActual * 1.015).toFixed(2)),
          alto: Number((precioActual * 1.025).toFixed(2))
        },
        volumenEstimadoUSD: 8500000, // $8.5M esperando a ser barridos por arriba
        densidad: 'ALTA',
        distanciaPrecioPct: 2.0
      },
      {
        rangoPrecio: {
          bajo: Number((precioActual * 0.975).toFixed(2)),
          alto: Number((precioActual * 0.985).toFixed(2))
        },
        volumenEstimadoUSD: 14200000, // $14.2M esperando a ser barridos por abajo
        densidad: 'EXTREMA',
        distanciaPrecioPct: -2.0
      },
      {
        rangoPrecio: {
          bajo: Number((precioActual * 1.05).toFixed(2)),
          alto: Number((precioActual * 1.06).toFixed(2))
        },
        volumenEstimadoUSD: 4100000,
        densidad: 'MEDIA',
        distanciaPrecioPct: 5.5
      }
    ];

    // Evaluamos el riesgo de squeeze primario
    // Mayor densidad acumulada por abajo sugiere un imán gravitatorio bajista antes de subir (Squeeze de Largos)
    let squeezeRisk: SqueezeRiskType = 'NEUTRAL';
    if (longsUSD > shortsUSD * 2.5) {
      squeezeRisk = 'HIGH_LONG_SQUEEZE';
    } else if (shortsUSD > longsUSD * 2.5) {
      squeezeRisk = 'HIGH_SHORT_SQUEEZE';
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
    simbolo: string,
    timeframe: string
  ): LiquidationAnalystOutput {
    console.log('[LiquidationAgent] Ejecutando diagnóstico local de piscinas de liquidación (Modo Fallback)...');

    // Lógica determinista heurística: si la piscina de abajo es extrema y el riesgo es de squeeze alcista/bajista
    const scoreConsolidado = raw.squeezeRisk === 'HIGH_LONG_SQUEEZE' ? -45 : 35;

    return {
      simbolo,
      temporalidad: timeframe,
      timestamp: Date.now(),
      volumenLiquidaciones24h: raw.volumenLiquidaciones24h,
      squeezeRisk: raw.squeezeRisk,
      piscinasLiquidezMagnetica: raw.piscinasLiquidezMagnetica,
      stopHuntingPatronDetectado: raw.squeezeRisk !== 'NEUTRAL',
      scoreConsolidado,
      confianza: 0.8,
      justificacionConsolidada: 'Análisis determinista local. Las zonas magnéticas por debajo del precio muestran alta densidad de apalancamiento minorista ($14.2M en -2.0%). El riesgo de Long Squeeze aumenta a corto plazo debido a un desequilibrio de liquidación hacia el lado comprador.'
    };
  }

  /**
   * Analiza las zonas de liquidaciones utilizando Gemini.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    const snapshot = this.blackboard.getSnapshot(symbol, timeframe);
    const precioActual = snapshot.marketData?.value?.price || 68000;

    console.log(`[LiquidationAgent] Analizando liquidez magnética para ${symbol}:${timeframe}...`);

    const rawData = this.obtenerMetricasLiquidacionRaw(precioActual);
    let output: LiquidationAnalystOutput;

    const client = getGeminiClient();

    if (client) {
      try {
        console.log('[LiquidationAgent] Invocando Gemini para la decodificación estructural de liquidaciones (Esquema Wyckoff)...');

        const systemPrompt = `Eres un experto en microestructura de mercado, trading de orden de flujo y analista sénior en derivados.
Tu especialidad consiste en interpretar cómo las instituciones manipulan las piscinas de liquidación minorista para acumular o distribuir (Esquema de Wyckoff: Spring, Upthrust, Test, Liquidity Sweeps).
Analiza los datos de liquidaciones y piscinas magnéticas recopilados para el par ${symbol} en la temporalidad ${timeframe}, y determina:
1. Si los picos de liquidaciones recientes representan claudicación de minoristas o una trampa institucional deliberada para tomar liquidez.
2. Identifica si existe riesgo inminente de un Short Squeeze o Long Squeeze.
3. Evalúa si el patrón es concordante con un Spring de Wyckoff (barrido de mínimos con reversión alcista) o un Upthrust (barrido de máximos con reversión bajista).
4. Determina si el precio actual se siente atraído de manera gravitatoria a los pools de liquidez más densos cercanos.
5. Asigna un score cuantitativo unificado para el Blackboard entre -100 (inminente barrido en cascada de largos / pánico bajista) y +100 (inminente short squeeze masivo / catalizador alcista).
6. Proporciona tu nivel de confianza y redacta un informe analítico sumamente profesional en CASTELLANO.

Reglas críticas de negocio:
- Devuelve la respuesta estrictamente adaptada al esquema JSON indicado.
- Todo texto explicativo, justificaciones y narrativas deben ser estrictamente en CASTELLANO.`;

        const response = await client.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              text: `Métricas de derivados y Pools de Liquidación en tiempo real:\n${JSON.stringify({ precioActual, ...rawData }, null, 2)}`
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
    console.log(`[LiquidationAgent] Registro exitoso en Blackboard para ${symbol}:${timeframe} con score: ${output.scoreConsolidado}`);
  }
}
