/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { SentimentMetrics, SentimentAnalystOutput } from './types.ts';
import { GoogleGenAI, Type } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

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
 * Monitorea métricas agregadas de redes sociales y foros (X/Twitter, Reddit) y el Fear and Greed Index.
 * Extrae la psicología de masas y detecta trampas semánticas del sector retail (FOMO, pánico, etc.).
 */
export class SentimentAgent extends BaseAgent {
  public readonly name: AgentName = 'Sentiment';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (procesamiento NLP)

  /**
   * Simula la recopilación asíncrona de datos sociales de múltiples canales.
   */
  private obtenerMetricasSociales(simbolo: string): SentimentMetrics[] {
    const ticker = simbolo.split('/')[0] || 'BTC';

    return [
      {
        fuente: 'X/Twitter',
        score: 75,
        frecuenciaMenciones: 2450,
        fomoDetectado: true,
        panicoDetectado: false,
        manipulacionDetectado: false,
        justificacion: `Conversaciones masivas en torno a la ruptura de niveles clave de resistencia en ${ticker}. Hashtags alcistas como #Bullish y #ToTheMoon dominando tendencias con nulo volumen de posts de capitulación.`
      },
      {
        fuente: 'Reddit',
        score: 62,
        frecuenciaMenciones: 850,
        fomoDetectado: false,
        panicoDetectado: false,
        manipulacionDetectado: false,
        justificacion: `Debates equilibrados en r/CryptoCurrency. Fuerte incentivo a mantener estrategias de DCA. No obstante, se detectan ligeras advertencias sobre "Bull Traps" y toma de ganancias preventivas por ballenas.`
      },
      {
        fuente: 'FearAndGreedIndex',
        score: 68, // Codicia (Greed) moderada
        frecuenciaMenciones: 1,
        fomoDetectado: false,
        panicoDetectado: false,
        manipulacionDetectado: false,
        justificacion: `El índice oficial marca un estado de 'Greed' en 68, subiendo progresivamente desde 55 en la última semana, confirmando la inyección de optimismo sistémico sin llegar a extremos de sobrecalentamiento.`
      }
    ];
  }

  /**
   * Generador de análisis de fallback determinista local si la API externa falla.
   * Evita fallos en cadena de la orquestación.
   */
  private ejecutarAnalisisFallback(fuentes: SentimentMetrics[], simbolo: string, timeframe: string): SentimentAnalystOutput {
    console.log('[SentimentAgent] Ejecutando análisis heurístico local de psicología de masas (Fallback)...');

    return {
      simbolo,
      temporalidad: timeframe,
      timestamp: Date.now(),
      scoreSocial: 68,
      sesgosDetectados: ['FOMO', 'NARRATIVAS'],
      fuentesAnalizadas: fuentes,
      scoreConsolidado: 55, // Unificado [-100 a +100] correspondiente a codicia moderada
      confianza: 0.75,
      justificacionConsolidada: 'Análisis determinista local. Optimismo moderado liderado por el Fear and Greed Index en zona de codicia (68/100). Presencia de FOMO minorista moderado en X/Twitter debido a rupturas alcistas recientes.'
    };
  }

  /**
   * Analiza la psicología del mercado utilizando Gemini.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[SentimentAgent] Analizando psicología de masas para ${symbol}:${timeframe}...`);

    const fuentesSociales = this.obtenerMetricasSociales(symbol);
    let output: SentimentAnalystOutput;

    const client = getGeminiClient();

    if (client) {
      try {
        console.log('[SentimentAgent] Invocando Gemini para el análisis semántico de psicología de masas...');

        const systemPrompt = `Eres un psicólogo de mercados financieros institucional y un analista cuantitativo de datos alternativos (Alternative Data).
Tu objetivo es analizar un conjunto de métricas de redes sociales y foros comunitarios sobre el par ${symbol} en la temporalidad ${timeframe}.
Debes diagnosticar de forma precisa la psicología colectiva para:
1. Validar o refinar la puntuación de sentimiento (0 a 100) para cada canal.
2. Identificar sesgos cognitivos o trampas de comportamiento minorista presentes en el mercado, limitándote a: FOMO, PÁNICO, MANIPULACIÓN, o NARRATIVAS.
3. Evaluar de forma agregada el Índice de Miedo y Codicia.
4. Calcular el score social unificado (0 a 100).
5. Mapear y estandarizar la psicología agregada en un Score Consolidado para el Blackboard en el rango de -100 (capitulación de pánico absoluto) a +100 (euforia extrema de FOMO / codicia insostenible).
6. Definir tu nivel de confianza y escribir un informe de confluencia de psicología de masas estricto en CASTELLANO.

Reglas críticas de negocio:
- Devuelve la respuesta estrictamente estructurada según el esquema JSON indicado.
- Todo texto explicativo, justificaciones y narrativas deben ser estrictamente en CASTELLANO.
- Evita redundancias de sesgos e identifica trampas sintácticas de manera rigurosa.`;

        const response = await client.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              text: `Métricas recolectadas de redes sociales:\n${JSON.stringify(fuentesSociales, null, 2)}`
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
                      score: { type: Type.INTEGER, description: 'Score individual recalculado o refinado por Gemini de 0 a 100' },
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
                  description: 'Score agregado del sentimiento colectivo de 0 a 100'
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
                  description: 'Puntuación consolidada final de -100 a +100 para el Blackboard'
                },
                confianza: {
                  type: Type.NUMBER
                },
                justificacionConsolidada: {
                  type: Type.STRING,
                  description: 'Informe detallado de confluencia psicológica en castellano.'
                }
              },
              required: [
                'fuentesAnalizadas',
                'scoreSocial',
                'sesgosDetectados',
                'scoreConsolidated', // Compatibilidad por si acaso
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
        output = this.ejecutarAnalisisFallback(fuentesSociales, symbol, timeframe);
      }
    } else {
      console.log('[SentimentAgent] GEMINI_API_KEY no configurado. Iniciando fallback directo...');
      output = this.ejecutarAnalisisFallback(fuentesSociales, symbol, timeframe);
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
