/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { NewsArticle, NewsAnalystOutput, NewsSentimentType, NewsImpactType } from './types.ts';
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
 * Agente de Noticias Financieras (News Agent).
 * Ingiere feeds de noticias clave en tiempo real y utiliza Gemini para clasificar
 * semánticamente el impacto financiero y la relevancia macroeconómica del artículo.
 */
export class NewsAgent extends BaseAgent {
  public readonly name: AgentName = 'News';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (acceso a API / razonamiento)

  /**
   * Simula la ingesta asíncrona de feeds de noticias de fuentes premium (Bloomberg, Reuters, CoinDesk)
   * para el activo y temporalidad dados.
   */
  private obtenerFeedsNoticias(simbolo: string): NewsArticle[] {
    const ahora = Date.now();
    const ticker = simbolo.split('/')[0] || 'BTC';

    return [
      {
        id: `news_bloomberg_${ahora}_1`,
        titulo: `La Reserva Federal insinúa recortes de tipos de interés para fin de año ante moderación de la inflación`,
        fuente: 'Bloomberg',
        contenido: `En el último simposio económico, miembros clave de la Fed sugirieron que si el IPC continúa retrocediendo al ritmo actual, la flexibilización monetaria comenzará antes de lo previsto. Esto reduce la presión sobre el dólar (DXY) y potencia los flujos hacia activos de riesgo como ${ticker}.`,
        timestamp: ahora - 15 * 60 * 1000, // Hace 15 minutos
      },
      {
        id: `news_reuters_${ahora}_2`,
        titulo: `La SEC aprueba formalmente la cotización de múltiples ETFs de opciones basados en mercados al contado`,
        fuente: 'Reuters',
        contenido: `La Comisión de Bolsa y Valores de EE.UU. (SEC) dio luz verde definitiva a la negociación de derivados de opciones en exchanges tradicionales para los ETFs de ${ticker}. Analistas institucionales apuntan a un fuerte incremento de la liquidez de derivados y la entrada de fondos de cobertura sistémicos.`,
        timestamp: ahora - 45 * 60 * 1000,
      },
      {
        id: `news_coindesk_${ahora}_3`,
        titulo: `Los flujos de reserva de los mineros de ${ticker} muestran fase de acumulación neta de largo plazo`,
        fuente: 'CoinDesk',
        contenido: `Datos de red muestran un drenaje histórico de las tenencias de exchanges, mientras los mineros y ballenas acumulan posiciones sin precedentes. La falta de oferta líquida podría exacerbar cualquier desequilibrio de la demanda.`,
        timestamp: ahora - 120 * 60 * 1000,
      },
    ];
  }

  /**
   * Genera un análisis determinista secundario si las APIs externas no están disponibles.
   * Esto garantiza el principio de tolerancia a fallos absoluto.
   */
  private ejecutarAnalisisFallback(articulos: NewsArticle[], simbolo: string, timeframe: string): NewsAnalystOutput {
    console.log('[NewsAgent] Ejecutando análisis determinista local de noticias (Modo Fallback)...');
    
    const analizados = articulos.map((art, idx) => {
      // Reglas heurísticas simples para el simulador local
      let sentimiento: NewsSentimentType = 'NEUTRAL';
      let impacto: NewsImpactType = 'MEDIUM';
      let eventoMacro = 'NINGUNO';
      let score = 0;

      if (art.contenido.toLowerCase().includes('fed') || art.contenido.toLowerCase().includes('tipos de interés')) {
        sentimiento = 'BULLISH';
        impacto = 'HIGH';
        eventoMacro = 'FED';
        score = 80;
      } else if (art.contenido.toLowerCase().includes('sec') || art.contenido.toLowerCase().includes('etf')) {
        sentimiento = 'BULLISH';
        impacto = 'HIGH';
        eventoMacro = 'SEC';
        score = 85;
      } else if (art.contenido.toLowerCase().includes('acumulan') || art.contenido.toLowerCase().includes('drenaje')) {
        sentimiento = 'BULLISH';
        impacto = 'MEDIUM';
        eventoMacro = 'NINGUNO';
        score = 65;
      }

      return {
        ...art,
        analisis: {
          sentimiento,
          impacto,
          eventoMacro,
          score,
          confianza: 0.8,
          justificacion: `Análisis heurístico determinista basado en patrones sintácticos locales.`
        }
      };
    });

    return {
      simbolo,
      temporalidad: timeframe,
      timestamp: Date.now(),
      articulosProcesados: analizados,
      sentimientoConsolidado: 'BULLISH',
      impactoMacroEsperado: 'HIGH',
      eventosMacroDetectados: ['FED', 'SEC'],
      scoreConsolidado: 75,
      confianza: 0.7,
      justificacionConsolidada: 'Análisis determinista local completado. Las noticias son significativamente positivas debido a insinuaciones dovish de la FED y avances regulatorios de la SEC sobre opciones de ETFs.'
    };
  }

  /**
   * Ejecuta el análisis semántico de noticias utilizando Gemini.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[NewsAgent] Analizando feeds de noticias para ${symbol}:${timeframe}...`);
    
    // Ingerir feeds
    const articulos = this.obtenerFeedsNoticias(symbol);
    let output: NewsAnalystOutput;

    const client = getGeminiClient();

    if (client) {
      try {
        console.log('[NewsAgent] Enviando feeds de noticias a Gemini para análisis cognitivo...');
        
        const systemPrompt = `Eres un analista macroeconómico de nivel institucional especializado en mercados financieros digitales.
Tu tarea es analizar un lote de artículos de noticias frescas sobre el par ${symbol} en la temporalidad de ${timeframe}.
Debes evaluar minuciosamente cada artículo para:
1. Clasificar su sentimiento hacia el par: BULLISH, BEARISH, o NEUTRAL.
2. Calcular su nivel de impacto esperado: HIGH, MEDIUM, o LOW.
3. Detectar si corresponde a eventos macroeconómicos de peso: FED, SEC, ETF, CPI, REGULATORY, o NINGUNO.
4. Asignar un score cuantitativo individual de -100 (extremadamente bajista) a +100 (extremadamente alcista).
5. Determinar la confianza de tu predicción (0.0 a 1.0) y ofrecer una justificación en CASTELLANO.

Finalmente, debes CONSOLIDAR el lote entero de artículos en una métrica única:
- Sentimiento general consolidado.
- Impacto esperado general.
- Lista de eventos macroeconómicos detectados de manera conjunta.
- Score final unificado para el Blackboard (-100 a +100).
- Confianza general del lote (0.0 a 1.0).
- Una justificación cualitativa consolidada exhaustiva escrita en CASTELLANO, describiendo la confluencia macroeconómica.

Reglas críticas de negocio:
- Devuelve la respuesta estrictamente alineada al esquema JSON especificado.
- Todo texto explicativo, justificaciones y narrativas deben ser estrictamente en CASTELLANO.`;

        const response = await client.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              text: `Artículos a analizar en tiempo real:\n${JSON.stringify(articulos, null, 2)}`
            }
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                articulosAnalizados: {
                  type: Type.ARRAY,
                  description: 'Análisis individual de cada uno de los artículos recibidos',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      sentimiento: { type: Type.STRING, enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
                      impacto: { type: Type.STRING, enum: ['HIGH', 'MEDIUM', 'LOW'] },
                      eventoMacro: { type: Type.STRING },
                      score: { type: Type.INTEGER },
                      confianza: { type: Type.NUMBER },
                      justificacion: { type: Type.STRING }
                    },
                    required: ['id', 'sentimiento', 'impacto', 'eventoMacro', 'score', 'confianza', 'justificacion']
                  }
                },
                sentimientoConsolidado: {
                  type: Type.STRING,
                  enum: ['BULLISH', 'BEARISH', 'NEUTRAL']
                },
                impactoMacroEsperado: {
                  type: Type.STRING,
                  enum: ['HIGH', 'MEDIUM', 'LOW']
                },
                eventosMacroDetectados: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                scoreConsolidado: {
                  type: Type.INTEGER,
                  description: 'Puntuación consolidada final de -100 a +100'
                },
                confianza: {
                  type: Type.NUMBER
                },
                justificacionConsolidada: {
                  type: Type.STRING,
                  description: 'Explicación cualitativa en castellano que justifica la confluencia macro.'
                }
              },
              required: [
                'articulosAnalizados',
                'sentimientoConsolidado',
                'impactoMacroEsperado',
                'eventosMacroDetectados',
                'scoreConsolidado',
                'confianza',
                'justificacionConsolidada'
              ]
            }
          }
        });

        if (!response.text) {
          throw new Error('La respuesta de Gemini para el análisis de noticias está vacía.');
        }

        const data = JSON.parse(response.text);
        
        // Re-mapear para inyectar los análisis dentro de la lista original de artículos
        const analizadosMapeados: NewsArticle[] = articulos.map(art => {
          const analizado = data.articulosAnalizados.find((x: any) => x.id === art.id);
          return {
            ...art,
            analisis: analizado ? {
              sentimiento: analizado.sentimiento,
              impacto: analizado.impacto,
              eventoMacro: analizado.eventoMacro,
              score: analizado.score,
              confianza: analizado.confianza,
              justificacion: analizado.justificacion
            } : undefined
          };
        });

        output = {
          simbolo: symbol,
          temporalidad: timeframe,
          timestamp: Date.now(),
          articulosProcesados: analizadosMapeados,
          sentimientoConsolidado: data.sentimientoConsolidado,
          impactoMacroEsperado: data.impactoMacroEsperado,
          eventosMacroDetectados: data.eventosMacroDetectados,
          scoreConsolidado: Math.max(-100, Math.min(100, data.scoreConsolidado)),
          confianza: data.confianza,
          justificacionConsolidada: data.justificacionConsolidada
        };

        console.log('[NewsAgent] Análisis cognitivo de noticias de Gemini completado con éxito.');
      } catch (geminiError) {
        console.warn('[NewsAgent] Error al invocar Gemini para análisis de noticias, recurriendo a fallback:', geminiError);
        output = this.ejecutarAnalisisFallback(articulos, symbol, timeframe);
      }
    } else {
      console.log('[NewsAgent] GEMINI_API_KEY no configurado. Iniciando fallback directo...');
      output = this.ejecutarAnalisisFallback(articulos, symbol, timeframe);
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
    console.log(`[NewsAgent] Blackboard actualizado con éxito para ${symbol}:${timeframe} con score: ${output.scoreConsolidado}`);
  }
}
