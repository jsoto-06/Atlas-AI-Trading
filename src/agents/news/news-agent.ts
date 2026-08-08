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

// Estructura para el cacheo en memoria de noticias RSS para evitar saturación de peticiones externas
interface NewsCache {
  timestamp: number;
  articulos: NewsArticle[];
}

const newsCacheMap: { [symbol: string]: NewsCache } = {};
const CACHE_TTL_MS = 15 * 60 * 1000; // TTL de 15 minutos para la caché

/**
 * Agente de Noticias Financieras (News Agent).
 * Ingiere feeds de noticias clave en tiempo real y utiliza Gemini para clasificar
 * semánticamente el impacto financiero y la relevancia macroeconómica del artículo.
 */
export class NewsAgent extends BaseAgent {
  public readonly name: AgentName = 'News';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo (acceso a API / razonamiento)

  /**
   * Obtiene y parsea el feed RSS de Cointelegraph en tiempo real.
   * Utiliza un sistema de caché en memoria y AbortController para control estricto de timeouts.
   * Retorna un array vacío [] si ocurre un error, timeout o si no se pueden parsear noticias reales.
   */
  private async obtenerFeedsNoticias(simbolo: string): Promise<NewsArticle[]> {
    const ahora = Date.now();

    // 1. Intentar servir desde caché si está dentro del TTL
    const cache = newsCacheMap[simbolo];
    if (cache && (ahora - cache.timestamp) < CACHE_TTL_MS) {
      console.log(`[NewsAgent] Utilizando artículos de noticias en caché para ${simbolo} (${Math.round((ahora - cache.timestamp) / 1000)}s de antigüedad).`);
      return cache.articulos;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // Timeout de 6 segundos

    try {
      console.log('[NewsAgent] Intentando obtener noticias reales desde el RSS de Cointelegraph...');
      const response = await fetch('https://cointelegraph.com/rss', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }

      const xml = await response.text();
      const articulos: NewsArticle[] = [];
      const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g);

      if (itemMatches && itemMatches.length > 0) {
        // Tomar hasta 5 artículos para no saturar la ventana de contexto de Gemini
        const maxArticulos = Math.min(5, itemMatches.length);
        for (let i = 0; i < maxArticulos; i++) {
          const itemXml = itemMatches[i];
          const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
          const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
          const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
          const pubDateMatch = itemXml.match(/<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/);

          let title = titleMatch ? titleMatch[1].trim() : '';
          let link = linkMatch ? linkMatch[1].trim() : '';
          let description = descMatch ? descMatch[1].trim() : '';
          const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : '';
          const timestamp = pubDateStr ? new Date(pubDateStr).getTime() : ahora;

          // Limpiar etiquetas HTML de la descripción
          description = description.replace(/<\/?[^>]+(>|$)/g, "").trim();
          // Decodificar entidades HTML comunes de manera simple
          title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
          description = description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

          if (!title) continue;

          // Crear un ID determinista
          const hashInput = link || title;
          const id = `news_cointelegraph_${Buffer.from(hashInput).toString('base64').substring(0, 16)}`;

          articulos.push({
            id,
            titulo: title,
            fuente: 'Cointelegraph',
            contenido: description || title,
            timestamp: isNaN(timestamp) ? ahora : timestamp
          });
        }
      }

      if (articulos.length > 0) {
        console.log(`[NewsAgent] Ingesta exitosa: ${articulos.length} artículos obtenidos de Cointelegraph.`);
        // Guardar en caché para futuros ciclos
        newsCacheMap[simbolo] = {
          timestamp: ahora,
          articulos: articulos
        };
        return articulos;
      } else {
        throw new Error('No se pudieron extraer artículos válidos del XML del RSS.');
      }
    } catch (error) {
      console.warn('[NewsAgent] Error al obtener RSS real de noticias:', error);
      // Retornar array vacío en caso de error o de no encontrar artículos reales (sin simulación ficticia)
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Genera un análisis determinista dinámico analizando el contenido real de los artículos.
   * Esto garantiza el principio de resiliencia total frente a la indisponibilidad de la API de IA.
   */
  private ejecutarAnalisisFallback(articulos: NewsArticle[], simbolo: string, timeframe: string): NewsAnalystOutput {
    console.log('[NewsAgent] Ejecutando análisis determinista local de noticias reales (Modo Fallback)...');
    
    // Listas robustas de palabras clave para análisis dinámico de sentimiento y categorías
    const keywordsBullish = [
      'aprueba', 'etf', 'sube', 'alcista', 'bullish', 'crece', 'acumul', 'adopcion', 
      'institucional', 'compra', 'rally', 'positivo', 'record', 'ganancia', 'verde', 
      'lanzamiento', 'exito', 'inversion', 'breakout', 'soporte', 'recorte', 'reserva', 
      'fed', 'sec', 'approve', 'bull', 'accumulation', 'growth', 'rising', 'positive', 
      'success', 'support', 'pantera', 'hyperliquid', 'onchain', 'defi', 'rebound', 'rebote'
    ];

    const keywordsBearish = [
      'rechaza', 'cae', 'bajista', 'bearish', 'caida', 'caída', 'perdida', 'pérdida', 'hack', 'estafa', 
      'prohibe', 'demanda', 'investigacion', 'investigación', 'inflacion', 'inflación', 'quiebra', 'miedo', 'fud', 
      'liquida', 'ventas', 'correccion', 'corrección', 'dump', 'scam', 'crash', 'ban', 'lawsuit', 
      'sec investigation', 'negative', 'fear', 'liquidation', 'resistance', 'regul', 'hackeado', 'vulnerabilidad'
    ];

    const analizados = articulos.map((art) => {
      const text = `${art.titulo} ${art.contenido}`.toLowerCase();
      let matchBullish = 0;
      let matchBearish = 0;

      for (const kw of keywordsBullish) {
        if (text.includes(kw)) matchBullish++;
      }
      for (const kw of keywordsBearish) {
        if (text.includes(kw)) matchBearish++;
      }

      let sentimiento: NewsSentimentType = 'NEUTRAL';
      let score = 0;
      let confianza = 0.6;

      if (matchBullish > matchBearish) {
        sentimiento = 'BULLISH';
        score = Math.min(90, 20 + 15 * (matchBullish - matchBearish));
        confianza = Math.min(0.85, 0.6 + 0.05 * (matchBullish - matchBearish));
      } else if (matchBearish > matchBullish) {
        sentimiento = 'BEARISH';
        score = Math.max(-90, -20 - 15 * (matchBearish - matchBullish));
        confianza = Math.min(0.85, 0.6 + 0.05 * (matchBearish - matchBullish));
      } else {
        sentimiento = 'NEUTRAL';
        score = 0;
        confianza = 0.5;
      }

      // Eventos Macro / Categorías
      let eventoMacro = 'NINGUNO';
      let impacto: NewsImpactType = 'LOW';

      if (text.includes('fed') || text.includes('interest') || text.includes('interés') || text.includes('fomc') || text.includes('inflation') || text.includes('inflación') || text.includes('rate')) {
        eventoMacro = 'FED';
        impacto = 'HIGH';
      } else if (text.includes('sec') || text.includes('etf') || text.includes('etfs') || text.includes('regulation') || text.includes('regulación') || text.includes('gensler')) {
        eventoMacro = 'SEC';
        impacto = 'HIGH';
      } else if (text.includes('hack') || text.includes('scam') || text.includes('exploit') || text.includes('seguridad') || text.includes('rob') || text.includes('vulnerabilidad')) {
        eventoMacro = 'SECURITY';
        impacto = 'MEDIUM';
      } else if (matchBullish + matchBearish >= 3) {
        impacto = 'MEDIUM';
      }

      return {
        ...art,
        analisis: {
          sentimiento,
          impacto,
          eventoMacro,
          score,
          confianza,
          justificacion: `Análisis heurístico determinista basado en patrones sintácticos locales. Coincidencias alcistas: ${matchBullish}, bajistas: ${matchBearish}.`
        }
      };
    });

    // Consolidar métricas dinámicas de todos los artículos
    const scoresValidos = analizados.map(a => a.analisis?.score ?? 0);
    const scoreConsolidado = scoresValidos.length > 0 
      ? Math.round(scoresValidos.reduce((a, b) => a + b, 0) / scoresValidos.length)
      : 0;

    let sentimientoConsolidado: NewsSentimentType = 'NEUTRAL';
    if (scoreConsolidado > 15) {
      sentimientoConsolidado = 'BULLISH';
    } else if (scoreConsolidado < -15) {
      sentimientoConsolidado = 'BEARISH';
    }

    const impactos = analizados.map(a => a.analisis?.impacto ?? 'LOW');
    let impactoMacroEsperado: NewsImpactType = 'LOW';
    if (impactos.includes('HIGH')) {
      impactoMacroEsperado = 'HIGH';
    } else if (impactos.includes('MEDIUM')) {
      impactoMacroEsperado = 'MEDIUM';
    }

    const eventos = Array.from(new Set(
      analizados
        .map(a => a.analisis?.eventoMacro ?? 'NINGUNO')
        .filter(ev => ev !== 'NINGUNO')
    ));

    const confianzas = analizados.map(a => a.analisis?.confianza ?? 0.5);
    const confianzaConsolidada = confianzas.length > 0
      ? Number((confianzas.reduce((a, b) => a + b, 0) / confianzas.length).toFixed(2))
      : 0.6;

    // Crear justificación detallada conteniendo fragmentos de titulares e información real procesada
    let justificacionConsolidada = `Análisis local determinista finalizado sobre ${articulos.length} artículos de noticias frescas. `;
    justificacionConsolidada += `Sentimiento consolidado estimado: ${sentimientoConsolidado} (Score: ${scoreConsolidado}). `;
    if (eventos.length > 0) {
      justificacionConsolidada += `Se detectaron eventos clave de tipo: ${eventos.join(', ')}. `;
    }
    justificacionConsolidada += `Los artículos describen dinámicas de mercado reales. Los titulares destacados incluyen: `;
    justificacionConsolidada += articulos.map((a, i) => `[${i+1}] "${a.titulo}"`).join('; ');
    justificacionConsolidada += `.`;

    return {
      simbolo,
      temporalidad: timeframe,
      timestamp: Date.now(),
      articulosProcesados: analizados,
      sentimientoConsolidado,
      impactoMacroEsperado,
      eventosMacroDetectados: eventos,
      scoreConsolidado,
      confianza: confianzaConsolidada,
      justificacionConsolidada,
      dataSource: 'LOCAL_FALLBACK_ON_REAL_HEADLINES'
    };
  }

  /**
   * Ejecuta el análisis semántico de noticias utilizando Gemini.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    console.log(`[NewsAgent] Analizando feeds de noticias para ${symbol}:${timeframe}...`);
    
    // Ingerir feeds reales
    const articulos = await this.obtenerFeedsNoticias(symbol);

    if (articulos.length === 0) {
      console.warn(`[NewsAgent] No hay feeds de noticias reales disponibles para ${symbol}:${timeframe}. Grabando assessment UNAVAILABLE en Blackboard.`);
      
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: 0,
        confidence: 0.1,
        data: {
          simbolo: symbol,
          temporalidad: timeframe,
          timestamp: Date.now(),
          articulosProcesados: [],
          sentimientoConsolidado: 'NEUTRAL',
          impactoMacroEsperado: 'LOW',
          eventosMacroDetectados: [],
          scoreConsolidado: 0,
          confianza: 0.1,
          justificacionConsolidada: 'Las fuentes de noticias de Cointelegraph no respondieron o no se pudieron procesar en este ciclo. No se puede generar un análisis sin fuentes de datos primarios.',
          dataSource: 'UNAVAILABLE'
        },
        justification: 'Las fuentes de noticias de Cointelegraph no respondieron o no se pudieron procesar en este ciclo. No se puede generar un análisis sin fuentes de datos primarios.'
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      console.log(`[NewsAgent] Blackboard actualizado con éxito para ${symbol}:${timeframe} en modo UNAVAILABLE con score: 0`);
      return;
    }

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
          justificacionConsolidada: data.justificacionConsolidada,
          dataSource: 'GEMINI_ANALYSIS'
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
