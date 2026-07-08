/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { AnalisisCognitivoVisual } from '../agents/technical/types.ts';

let aiInstance: GoogleGenAI | null = null;

/**
 * Inicializador perezoso (Lazy Initialization) para el cliente oficial de Gemini API.
 * Esto previene bloqueos o errores críticos en el arranque si la API Key no está configurada inicialmente.
 */
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('La variable de entorno GEMINI_API_KEY no está definida. Configure sus secretos de API en el panel de configuración.');
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

/**
 * Analiza de forma visual un gráfico técnico utilizando las capacidades multimodales de Gemini 2.5.
 * Obliga a Gemini a devolver la inferencia estructurada de acuerdo con el esquema JSON provisto.
 * 
 * @param imageBuffer Buffer con la imagen del gráfico (en formato PNG/JPEG).
 * @param simbolo Nombre del par de trading analizado (e.g., BTC/USDT).
 * @param temporalidad Temporalidad del gráfico (e.g., 1h, 4h).
 */
export async function analizarGraficoConGemini(
  imageBuffer: Buffer,
  simbolo: string,
  temporalidad: string
): Promise<AnalisisCognitivoVisual> {
  const client = getGeminiClient();

  const systemPrompt = `Eres un analista de mercados financieros de nivel institucional y un experto absoluto en Smart Money Concepts (SMC), Inner Circle Trader (ICT) y metodologías cuantitativas.
Se te proporciona una captura de pantalla del gráfico técnico del par ${simbolo} en la temporalidad de ${temporalidad}.

Tu tarea consiste en realizar un análisis visual exhaustivo del gráfico para detectar:
1. Estructura de mercado general: ALCISTA, BAJISTA o CONSOLIDACION_LATERAL.
2. Fase de Wyckoff en desarrollo: ACUMULACION, PARTICIPACION_ALCISTA, DISTRIBUCION, PARTICIPACION_BAJISTA, o NINGUNO.
3. Patrón u onda de Elliott observable (e.g. "Onda 3 de Impulso", "Corrección ABC", "Ninguno").
4. Fair Value Gaps (FVG) visibles en el gráfico que no hayan sido totalmente mitigados aún.
5. Liquidity Sweeps (Barridos de liquidez) completados recientemente en máximos o mínimos importantes.
6. Bloques de órdenes institucionales (Order Blocks - OB), indicando rango de precios aproximado y si están mitigados o no.
7. Cambios estructurales clave en vivo, como BOS (Break of Structure) o CHoCH (Change of Character).
8. Un resumen cualitativo explicativo detallado en CASTELLANO, argumentando la confluencia de estos factores de forma sumamente profesional.

Reglas críticas de negocio:
- Devuelve datos realistas simulados basados en las marcas visuales del gráfico, o si la imagen tiene baja resolución, infiere rangos coherentes acordes a un par financiero típico.
- Todos los comentarios y el resumen explicativo deben ser estrictamente en CASTELLANO.
- El formato de respuesta debe alinearse exactamente con el esquema JSON especificado.`;

  try {
    // Convertir el buffer a Base64 para la transmisión inline de datos multimodales
    const base64Image = imageBuffer.toString('base64');

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Image,
            mimeType: 'image/png'
          }
        },
        'Por favor, analiza este gráfico de precios y genera los hallazgos técnicos estructurados.'
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            estructuraMercado: {
              type: 'string',
              description: 'Estructura general del mercado detectada',
              enum: ['ALCISTA', 'BAJISTA', 'CONSOLIDACION_LATERAL']
            },
            faseWyckoff: {
              type: 'string',
              description: 'Fase del ciclo de Wyckoff observable',
              enum: ['ACUMULACION', 'PARTICIPACION_ALCISTA', 'DISTRIBUCION', 'PARTICIPACION_BAJISTA', 'NINGUNO']
            },
            patronElliott: {
              type: 'string',
              description: 'Clasificación de Ondas de Elliott detectada'
            },
            fairValueGaps: {
              type: 'array',
              description: 'Lista de Fair Value Gaps detectados',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['ALCISTA', 'BAJISTA'] },
                  precioInicio: { type: 'number' },
                  precioFin: { type: 'number' },
                  mitigado: { type: 'boolean' }
                },
                required: ['tipo', 'precioInicio', 'precioFin', 'mitigado']
              }
            },
            liquiditySweeps: {
              type: 'array',
              description: 'Barridos de liquidez detectados recientemente',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['COMPRA', 'VENTA'] },
                  nivelPrecio: { type: 'number' },
                  completado: { type: 'boolean' }
                },
                required: ['tipo', 'nivelPrecio', 'completado']
              }
            },
            orderBlocks: {
              type: 'array',
              description: 'Bloques de órdenes institucionales ubicados',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['ALCISTA', 'BAJISTA'] },
                  rangoPrecio: {
                    type: 'object',
                    properties: {
                      alto: { type: 'number' },
                      bajo: { type: 'number' }
                    },
                    required: ['alto', 'bajo']
                  },
                  volumenAsociado: { type: 'string', enum: ['ALTO', 'MEDIO', 'BAJO'] },
                  mitigado: { type: 'boolean' }
                },
                required: ['tipo', 'rangoPrecio', 'volumenAsociado', 'mitigado']
              }
            },
            cambiosEstructura: {
              type: 'array',
              description: 'Quiebres estructurales clave como BOS o CHoCH',
              items: {
                type: 'object',
                properties: {
                  tipo: { type: 'string', enum: ['BOS', 'CHOCH', 'NINGUNO'] },
                  nivelPrecio: { type: 'number' },
                  direccion: { type: 'string', enum: ['ALCISTA', 'BAJISTA'] },
                  confirmado: { type: 'boolean' }
                },
                required: ['tipo', 'nivelPrecio', 'direccion', 'confirmado']
              }
            },
            resumenVisual: {
              type: 'string',
              description: 'Justificación narrativa consolidada de todos los factores visuales de confluencia detectados.'
            }
          },
          required: [
            'estructuraMercado',
            'faseWyckoff',
            'patronElliott',
            'fairValueGaps',
            'liquiditySweeps',
            'orderBlocks',
            'cambiosEstructura',
            'resumenVisual'
          ]
        }
      }
    });

    if (!response.text) {
      throw new Error('La API de Gemini retornó una respuesta de texto vacía.');
    }

    const rawData = JSON.parse(response.text);
    return rawData as AnalisisCognitivoVisual;
  } catch (error) {
    console.error('Error al invocar el análisis cognitivo visual de Gemini:', error);
    throw new Error(`Fallo en la integración visual multimodal de Gemini: ${error instanceof Error ? error.message : String(error)}`);
  }
}
