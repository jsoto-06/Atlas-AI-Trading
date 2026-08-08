/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { SentimentMetrics, SentimentAnalystOutput } from './types.ts';
import { GoogleGenAI, Type } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

// Caché en memoria para el Fear & Greed Index (TTL de 1 hora)
let fngCache: { value: number; classification: string; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Inicializador perezoso para el cliente oficial de Gemini API.
 * Configura headers de telemetría institucionales.
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
 * Agente de Sentimiento Social e Índice de Miedo/Codicia (Sentiment Agent).
 * Monitorea el Fear and Greed Index en tiempo real como su única fuente de datos real actual.
 * Extrae la psicología de masas y detecta trampas semánticas del sector retail (FOMO, pánico, etc.).
 */
export class SentimentAgent extends BaseAgent {
  public readonly name: AgentName = 'Sentiment';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (procesamiento NLP)

  /**
   * Obtiene de forma dinámica los datos de sentimiento reales.
   * X/Twitter y Reddit han sido eliminados por completo para evitar contaminar el cálculo con datos simulados.
   */
  private obtenerMetricasSociales(symbol: string, fngValue: number, fngClass: string): SentimentMetrics[] {
    return [
      {
        fuente: 'FearAndGreedIndex',
        score: fngValue,
        frecuenciaMenciones: 1,
        fomoDetectado: fngValue >= 75,
        panicoDetectado: fngValue <= 25,
        manipulacionDetectado: false,
        justificacion: `El índice oficial de Fear & Greed obtenido de la API es de ${fngValue}/100, clasificado actualmente en estado de '${fngClass}'.`
      }
    ];
  }

  /**
   * Generador de análisis de fallback determinista local si la API externa o Gemini fallan,
   * utilizando los datos reales obtenidos del Fear & Greed Index.
   */
  private ejecutarAnalisisFallback(
    fuentes: SentimentMetrics[],
    simbolo: string,
    timeframe: string,
    fngValue: number,
    fngClass: string
  ): SentimentAnalystOutput {
    console.log('[SentimentAgent] Ejecutando análisis heurístico local de psicología de masas (Fallback)...');

    // Mapear el Fear & Greed de 0..100 al rango de Blackboard -100..+100
    // 50 -> 0; 100 -> +100; 0 -> -100
    const scoreConsolidado = Math.round((fngValue - 50) * 2);

    return {
      simbolo,
      temporalidad: timeframe,
      timestamp: Date.now(),
      scoreSocial: fngValue,
      sesgosDetectados: fngValue > 70 ? ['FOMO'] : fngValue < 30 ? ['PÁNICO'] : ['NARRATIVAS'],
      fuentesAnalizadas: fuentes,
      scoreConsolidado: Math.max(-100, Math.min(100, scoreConsolidado)),
      confianza: 0.75,
      justificacionConsolidada: `Análisis de fallback heurístico basado exclusivamente en el Fear & Greed Index real (${fngValue}/100 - ${fngClass}). El sentimiento unificado refleja condiciones de mercado estables con un sesgo condicionado por el indicador general.`
    };
  }

  /**
   * Analiza la psicología del mercado.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[SentimentAgent] Analizando psicología de masas para ${symbol}:${timeframe}...`);

    let fngData: { value: number; classification: string } | null = null;
    const now = Date.now();

    if (fngCache && (now - fngCache.timestamp < CACHE_TTL_MS)) {
      console.log(`[SentimentAgent] Utilizando datos de Fear & Greed en caché (edad: ${Math.round((now - fngCache.timestamp) / 1000)}s)`);
      fngData = {
        value: fngCache.value,
        classification: fngCache.classification
      };
    } else {
      console.log('[SentimentAgent] Cache expirada o vacía. Solicitando datos reales al endpoint de Fear & Greed Index con timeout de 5s...');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch('https://api.alternative.me/fng/?limit=1', {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json();
          if (json && json.data && json.data.length > 0) {
            const valStr = json.data[0].value;
            const classStr = json.data[0].value_classification;
            fngData = {
              value: parseInt(valStr, 10),
              classification: classStr
            };
            
            // Guardar en caché
            fngCache = {
              value: fngData.value,
              classification: fngData.classification,
              timestamp: Date.now()
            };
            console.log(`[SentimentAgent] Datos obtenidos con éxito y cacheados. Valor: ${fngData.value}, Clasificación: ${fngData.classification}`);
          }
        } else {
          console.warn(`[SentimentAgent] El endpoint de Fear & Greed Index respondió con estado: ${response.status}`);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('[SentimentAgent] Solicitud al Fear & Greed Index abortada por exceder el timeout de 5 segundos.');
        } else {
          console.warn('[SentimentAgent] Excepción al consultar el Fear & Greed Index:', fetchError);
        }
      }
    }

    // Si la llamada falla o no responde, tratamos al agente como no disponible sin fallback técnico
    if (!fngData) {
      console.warn('[SentimentAgent] Fear & Greed Index no disponible. Marcando agente como UNAVAILABLE.');
      
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: { dataSource: 'UNAVAILABLE' },
        justification: 'Fear & Greed Index API is currently unavailable. No sentiment data can be retrieved.'
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      return;
    }

    const fuentesSociales = this.obtenerMetricasSociales(symbol, fngData.value, fngData.classification);
    let output: SentimentAnalystOutput;

    const client = getGeminiClient();

    if (client) {
      try {
        console.log('[SentimentAgent] Invocando Gemini para el análisis semántico de psicología de masas...');

        const systemPrompt = `Eres un psicólogo de mercados financieros institucional y un analista cuantitativo de datos alternativos (Alternative Data).
Tu objetivo es analizar el sentimiento general del mercado del par ${symbol} en la temporalidad ${timeframe}.
Se te proporciona como única fuente real el Fear & Greed Index con un valor de ${fngData.value}/100, clasificado como '${fngData.classification}'.
Las fuentes de redes sociales como X/Twitter y Reddit NO están integradas actualmente; no asumas, infieras ni inventes datos cuantitativos o cualitativos sobre ellas.

Debes diagnosticar de forma precisa la psicología colectiva basándote únicamente en el Fear & Greed Index:
1. Evalúa el estado del indicador real y analiza las implicaciones psicológicas de su valor.
2. Identifica sesgos cognitivos o trampas de comportamiento minorista presentes en el mercado, limitándote a: FOMO, PÁNICO, MANIPULACIÓN, o NARRATIVAS.
3. Calcula el score social unificado (0 a 100), el cual debe derivar directamente del Fear & Greed Index y su clasificación.
4. Mapear y estandarizar la psicología agregada en un Score Consolidado para el Blackboard en el rango de -100 (capitulación de pánico absoluto) a +100 (euforia extrema de FOMO / codicia insostenible).
5. Definir tu nivel de confianza (el cual debe verse influenciado positivamente por la certeza de un dato real de API y la madurez de su análisis).
6. Escribir un informe de confluencia de psicología de masas estricto en CASTELLANO.

Reglas críticas de negocio:
- Devuelve la respuesta estrictamente estructurada según el esquema JSON indicado.
- Todo texto explicativo, justificaciones y narrativas deben ser estrictamente en CASTELLANO.
- Evita redundancias de sesgos e identifica trampas sintácticas de manera rigurosa.`;

        const response = await client.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              text: `Métricas reales de sentimiento de Fear & Greed Index:\n${JSON.stringify(fuentesSociales, null, 2)}`
            }
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                fuentesAnalizadas: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      fuente: { type: Type.STRING },
                      score: { type: Type.INTEGER, description: 'Score individual del indicador real' },
                      frecuenciaMenciones: { type: Type.INTEGER },
                      fomoDetectado: { type: Type.BOOLEAN },
                      panicoDetectado: { type: Type.BOOLEAN },
                      manipulacionDetectado: { type: Type.BOOLEAN },
                      justificacion: { type: Type.STRING }
                    },
                    required: ['fuente', 'score', 'frecuenciaMenciones', 'fomoDetectado', 'panicoDetectado', 'manipulacionDetectado', 'justificacion']
                  }
                },
                scoreSocial: {
                  type: Type.INTEGER,
                  description: 'Score de sentimiento social derivado únicamente del Fear & Greed Index de 0 a 100'
                },
                sesgosDetectados: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                    enum: ['FOMO', 'PÁNICO', 'MANIPULACIÓN', 'NARRATIVAS']
                  }
                },
                scoreConsolidado: {
                  type: Type.INTEGER,
                  description: 'Puntuación consolidada de -100 a +100 basada en el Fear & Greed Index real + análisis cualitativo'
                },
                confianza: {
                  type: Type.NUMBER
                },
                justificacionConsolidada: {
                  type: Type.STRING,
                  description: 'Informe detallado de confluencia psicológica en castellano basado única y exclusivamente en el Fear & Greed Index real.'
                }
              },
              required: [
                'fuentesAnalizadas',
                'scoreSocial',
                'sesgosDetectados',
                'scoreConsolidado',
                'confianza',
                'justificacionConsolidada'
              ]
            }
          }
        });

        if (!response.text) {
          throw new Error('La respuesta de Gemini para el análisis de sentimiento está vacía.');
        }

        const data = JSON.parse(response.text);

        output = {
          simbolo: symbol,
          temporalidad: timeframe,
          timestamp: Date.now(),
          scoreSocial: data.scoreSocial,
          sesgosDetectados: data.sesgosDetectados,
          fuentesAnalizadas: data.fuentesAnalizadas.map((x: any) => ({
            fuente: x.fuente,
            score: x.score,
            frecuenciaMenciones: x.frecuenciaMenciones,
            fomoDetectado: x.fomoDetectado,
            panicoDetectado: x.panicoDetectado,
            manipulacionDetectado: x.manipulacionDetectado,
            justificacion: x.justificacion
          })),
          scoreConsolidado: Math.max(-100, Math.min(100, data.scoreConsolidado)),
          confianza: data.confianza,
          justificacionConsolidada: data.justificacionConsolidada
        };

        console.log('[SentimentAgent] Análisis cognitivo de psicología de masas con Gemini completado.');
      } catch (geminiError) {
        console.warn('[SentimentAgent] Error al invocar Gemini para análisis de sentimiento, recurriendo a fallback:', geminiError);
        output = this.ejecutarAnalisisFallback(fuentesSociales, symbol, timeframe, fngData.value, fngData.classification);
      }
    } else {
      console.log('[SentimentAgent] GEMINI_API_KEY no configurado. Iniciando fallback directo...');
      output = this.ejecutarAnalisisFallback(fuentesSociales, symbol, timeframe, fngData.value, fngData.classification);
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
    console.log(`[SentimentAgent] Blackboard actualizado con éxito para ${symbol}:${timeframe} con score: ${output.scoreConsolidado}`);
  }
}
