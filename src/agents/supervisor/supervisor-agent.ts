/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { SupervisorAnalystOutput, SupervisorFinalDecision } from './types.ts';
import { GoogleGenAI, Type } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

/**
 * Inicializador perezoso para el cliente de Gemini API con cabecera de telemetría.
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
 * Agente Supervisor (Supervisor Agent) - Slow-Loop.
 * 
 * Actúa como el Director General y Comité de Riesgos de la plataforma de trading cuantitativo.
 * Implementa un flujo dual:
 * 
 * 1. Algoritmo de Ponderación Dinámica (Fast-Loop Matemático):
 *    - Lee el estado de todos los agentes analistas del Blackboard.
 *    - Ajusta de forma adaptativa los pesos de ponderación en base a la volatilidad del mercado (ATR / Rango 24h)
 *      y la confianza reportada en tiempo real por cada analista.
 *    - Descarta agentes caídos o con confianza cero, redistribuyendo de manera robusta los pesos.
 * 
 * 2. Integración Cognitiva Slow-Loop (Gemini API):
 *    - Genera una captura estructurada de texto de toda la pizarra (Blackboard State).
 *    - Consulta con Gemini actuando como el "Comité de Riesgos y Estrategia" institucional.
 *    - Evalúa la coherencia macro-estructural, detecta sesgos y anomalías de concordancia.
 *    - Puede RECHAZAR la decisión del algoritmo matemático si detecta riesgos sistémicos ocultos,
 *      forzando a 'HOLD' para garantizar la preservación absoluta de capital.
 */
export class SupervisorAgent extends BaseAgent {
  public readonly name: AgentName = 'Supervisor';
  public readonly isFastLoop: boolean = false; // Agente Slow-Loop cognitivo y de toma de decisiones final

  // Pesos base del ecosistema analítico (deben sumar 1.0)
  private readonly BASE_WEIGHTS: Record<AgentName, number> = {
    TechnicalAnalyst: 0.15,
    OrderFlow: 0.20,
    Liquidation: 0.15,
    OnChain: 0.15,
    Correlation: 0.10,
    Divergence: 0.10,
    Sentiment: 0.08,
    News: 0.07,
    Supervisor: 0, // El supervisor no se pondera a sí mismo
    Backtesting: 0,
    RiskManager: 0,
    Execution: 0,
    Learning: 0,
    Audit: 0,
    Notification: 0
  };

  /**
   * Ejecuta el análisis consolidado y toma la decisión ejecutiva final.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    try {
      console.log(`[SupervisorAgent] Iniciando supervisión y ponderación dinámica para ${symbol}:${timeframe}...`);

      const snapshot = this.blackboard.getSnapshot(symbol, timeframe);
      const precioActual = snapshot.marketData?.value?.price || 0;
      const marketData = snapshot.marketData?.value;

      // 1. Extraer métricas de volatilidad para calibrar los pesos dinámicos
      let atrRelativo = 0;
      let volatilidad24h = 0;

      // Tratar de obtener el ATR del Agente Técnico
      const techSlot = snapshot.assessments['TechnicalAnalyst'];
      if (techSlot?.value?.data?.indicadores?.atr) {
        const atr = techSlot.value.data.indicadores.atr;
        if (precioActual > 0) {
          atrRelativo = atr / precioActual;
        }
      }

      // Volatilidad general del rango de 24h
      if (marketData && marketData.price > 0 && marketData.high24h > 0 && marketData.low24h > 0) {
        volatilidad24h = (marketData.high24h - marketData.low24h) / marketData.price;
      }

      // Usar la métrica más alta disponible para evaluar si la volatilidad es extrema
      const metricaVolatilidad = Math.max(atrRelativo, volatilidad24h);
      const esVolatilidadExtrema = metricaVolatilidad > 0.045; // Más del 4.5% de oscilación

      console.log(`[SupervisorAgent] Volatilidad detectada: ${(metricaVolatilidad * 100).toFixed(2)}% (Extrema: ${esVolatilidadExtrema})`);

      // 2. Modificar pesos base por condiciones del mercado (Algoritmo Adaptativo)
      const pesosAdaptados = { ...this.BASE_WEIGHTS };

      if (esVolatilidadExtrema) {
        console.log('[SupervisorAgent] Entorno de ALTA VOLATILIDAD detectado. Incrementando peso de Flujo de Ordenes y Liquidaciones...');
        // Aumentar la importancia del flujo del libro y barridos de liquidez
        pesosAdaptados['OrderFlow'] = pesosAdaptados['OrderFlow'] * 1.5; // De 0.20 a 0.30
        pesosAdaptados['Liquidation'] = pesosAdaptados['Liquidation'] * 1.5; // De 0.15 a 0.225
        // Reducir peso de indicadores de media técnica que sufren de rezago extremo
        pesosAdaptados['TechnicalAnalyst'] = pesosAdaptados['TechnicalAnalyst'] * 0.5; // De 0.15 a 0.075
      }

      // 3. Evaluar analistas activos en el Blackboard y filtrar por confianza (Robustez anti-nulos)
      const agentesEvaluados: Array<{ name: AgentName; score: number; confidence: number; justification: string }> = [];
      let sumaPesosRaw = 0;
      const pesosPreliminares: Record<string, number> = {};

      for (const nameKey of Object.keys(pesosAdaptados)) {
        const name = nameKey as AgentName;
        const pesoBaseAgente = pesosAdaptados[name];
        if (pesoBaseAgente === 0) continue;

        const assessmentSlot = snapshot.assessments[name];

        if (assessmentSlot && assessmentSlot.value) {
          const ass = assessmentSlot.value;
          // Si el agente está caído, su confianza es 0, o ha expirado, no suma peso
          if (ass.confidence > 0) {
            agentesEvaluados.push({
              name,
              score: ass.score,
              confidence: ass.confidence,
              justification: ass.justification || ''
            });

            // El peso real final de un agente se modula linealmente por su nivel de confianza reportado
            const pesoModuladoPorConfianza = pesoBaseAgente * ass.confidence;
            pesosPreliminares[name] = pesoModuladoPorConfianza;
            sumaPesosRaw += pesoModuladoPorConfianza;
          } else {
            console.warn(`[SupervisorAgent] Ignorando agente ${name} debido a confianza de cero o degradación.`);
            pesosPreliminares[name] = 0;
          }
        } else {
          // El agente no ha escrito o su slot expiró
          console.log(`[SupervisorAgent] Agente analista offline o inactivo: ${name}. Re-distribuyendo peso.`);
          pesosPreliminares[name] = 0;
        }
      }

      // 4. Re-normalizar pesos para que sumen exactamente 1.0 (Distribución Dinámica)
      const weight_distribution: Record<string, number> = {};
      let composite_score = 0;
      let confidence_level = 0;

      if (sumaPesosRaw > 0) {
        for (const agente of agentesEvaluados) {
          const pesoNormalizado = pesosPreliminares[agente.name] / sumaPesosRaw;
          weight_distribution[agente.name] = Number(pesoNormalizado.toFixed(4));
          
          // Suma ponderada de scores
          composite_score += agente.score * pesoNormalizado;
          
          // Confianza consolidada ponderada
          confidence_level += agente.confidence * pesoNormalizado;
        }
        composite_score = Math.round(composite_score);
        confidence_level = Number(confidence_level.toFixed(4));
      } else {
        // Ningún agente está disponible o todos tienen confianza cero
        console.error('[SupervisorAgent] Alerta Crítica: Ningún agente analista disponible en el Blackboard. Forzando HOLD preventivo.');
        weight_distribution['DEFAULT_HOLD'] = 1.0;
        composite_score = 0;
        confidence_level = 0;
      }

      // Decisión determinista del algoritmo matemático cuantitativo
      let decisionMatematica: SupervisorFinalDecision = 'HOLD';
      if (composite_score >= 25) {
        decisionMatematica = 'BUY';
      } else if (composite_score <= -25) {
        decisionMatematica = 'SELL';
      }

      console.log(`[SupervisorAgent] Algoritmo matemático completado. Score: ${composite_score}, Decisión: ${decisionMatematica}, Confianza: ${confidence_level}`);

      // 5. Preparar la captura textual estructurada del Blackboard para el Slow-Loop cognitivo
      let snapshotTexto = `=== CAPTURA DE PIZARRA (BLACKBOARD STATE) ===\n`;
      snapshotTexto += `Símbolo: ${symbol} | Temporalidad: ${timeframe}\n`;
      snapshotTexto += `Precio de Referencia: ${precioActual} USD\n`;
      snapshotTexto += `Métricas Volatilidad: ATR/Rango ${(metricaVolatilidad * 100).toFixed(2)}%\n\n`;
      snapshotTexto += `INFORMES DE LOS AGENTES ANALISTAS:\n`;

      if (agentesEvaluados.length === 0) {
        snapshotTexto += `(Ningún agente analista activo en este ciclo)\n`;
      } else {
        for (const ag of agentesEvaluados) {
          snapshotTexto += `- Agente [${ag.name}]:\n`;
          snapshotTexto += `  * Score: ${ag.score} / 100\n`;
          snapshotTexto += `  * Confianza: ${(ag.confidence * 100).toFixed(1)}%\n`;
          snapshotTexto += `  * Peso Asignado: ${(weight_distribution[ag.name] * 100).toFixed(2)}%\n`;
          snapshotTexto += `  * Justificación: ${ag.justification}\n\n`;
        }
      }

      snapshotTexto += `CÁLCULO DEL MOTOR MATEMÁTICO:\n`;
      snapshotTexto += `- Score Ponderado Consolidado: ${composite_score}\n`;
      snapshotTexto += `- Decisión Técnica Propuesta: ${decisionMatematica}\n`;
      snapshotTexto += `- Confianza Global Ponderada: ${(confidence_level * 100).toFixed(1)}%\n`;

      // 6. Integración Cognitiva Slow-Loop con Gemini (Comité de Riesgos y Estrategia)
      let final_decision: SupervisorFinalDecision = decisionMatematica;
      let justificacion_cognitiva = '';

      const client = getGeminiClient();

      if (client && agentesEvaluados.length > 0) {
        try {
          console.log('[SupervisorAgent] Convocando al Comité de Riesgo de Gemini (Slow-Loop)...');

          const systemPrompt = `Actúas como el Director de Riesgos (CRO) y Estrategia del comité de inversión cuantitativa.
Tu rol es actuar como el filtro definitivo de la inteligencia artificial sobre el score numérico propuesto matemáticamente.
Debes revisar la captura de la pizarra financiera suministrada, validar la coherencia sistémica, detectar posibles trampas de liquidez o sesgos (ej: si los indicadores técnicos de volumen contradicen las medias de precio o si hay una anomalía extrema de descorrelación).

Reglas Ejecutivas de Decisión:
1. Analiza con rigor institucional cada uno de los informes de los agentes.
2. Compara si existen divergencias extremas o contradicciones insalvables (ej. sentimiento minorista extremadamente alcista con desequilibrio masivo de órdenes de venta institucional, o descorrelación anómala crítica).
3. Si consideras que el algoritmo matemático ha caído en un sesgo, está malinterpretando un barrido como tendencia, o existe riesgo de pérdidas innecesarias, debes ejercer tu derecho a VETO marcando "comiteRechazo": true y sugiriendo una decisión final de 'HOLD' para preservar el capital.
4. Si consideras que la lógica matemática es impecable, apruébala y redacta el informe analítico de autorización en castellano formal.
5. Devuelve la salida en un JSON estricto con el esquema solicitado. Toda la justificación y análisis de riesgos deben escribirse en CASTELLANO.`;

          const response = await client.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: [
              {
                text: `Captura del Blackboard actual del sistema reactivo:\n${snapshotTexto}`
              }
            ],
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  comiteDecision: {
                    type: Type.STRING,
                    enum: ['BUY', 'SELL', 'HOLD']
                  },
                  comiteRechazo: {
                    type: Type.BOOLEAN,
                    description: 'True si se veta la decisión matemática debido a sesgo, divergencias críticas o riesgo excesivo.'
                  },
                  justificacionCognitiva: {
                    type: Type.STRING,
                    description: 'Explicación institucional profunda, redactada en español formal, que exponga los motivos detrás de la decisión del comité.'
                  },
                  riesgosPrincipales: {
                    type: Type.STRING,
                    description: 'Identificación de los principales factores de riesgo del escenario actual.'
                  }
                },
                required: ['comiteDecision', 'comiteRechazo', 'justificacionCognitiva', 'riesgosPrincipales']
              }
            }
          });

          if (!response.text) {
            throw new Error('Respuesta vacía del Comité de Riesgos Gemini.');
          }

          const parsedResult = JSON.parse(response.text);
          console.log(`[SupervisorAgent] Comité finalizado. Rechazo/Veto: ${parsedResult.comiteRechazo}, Decisión: ${parsedResult.comiteDecision}`);

          // Si el comité cognitivo rechaza o decide HOLD para preservar capital, forzamos HOLD
          if (parsedResult.comiteRechazo === true || parsedResult.comiteDecision === 'HOLD') {
            final_decision = 'HOLD';
            justificacion_cognitiva = `[VETO / PRESERVACIÓN DE CAPITAL] El Comité de Riesgos ha vetado la propuesta cuantitativa de ${decisionMatematica}. Motivo: ${parsedResult.justificacionCognitiva} Riesgos identificados: ${parsedResult.riesgosPrincipales}`;
            console.log('[SupervisorAgent] Decisión ejecutiva final reescrita a HOLD por motivos de riesgo cognitivo.');
          } else {
            final_decision = parsedResult.comiteDecision as SupervisorFinalDecision;
            justificacion_cognitiva = `${parsedResult.justificacionCognitiva}\nRiesgos Monitoreados: ${parsedResult.riesgosPrincipales}`;
          }

        } catch (apiError) {
          console.error('[SupervisorAgent] Error al consultar al Comité de Riesgos cognitivo de Gemini, aplicando fallback determinista:', apiError);
          justificacion_cognitiva = `[FALLBACK LOCAL] Comité Cognitivo no disponible temporalmente. Se valida automáticamente la propuesta matemática. Justificación: El score dinámico ponderado de ${composite_score} aprueba una dirección de ${final_decision} con una confianza de ${(confidence_level * 100).toFixed(1)}%.`;
        }
      } else {
        // Fallback local absoluto si Gemini no está o no hay agentes
        console.warn('[SupervisorAgent] Entorno sin API Key de Gemini o sin analistas. Aplicando decisión estrictamente matemática...');
        justificacion_cognitiva = `[EVALUACIÓN MATEMÁTICA PURA] Decisión final tomada bajo ponderación dinámica de confianza. Ponderación exitosa sobre ${agentesEvaluados.length} analistas activos. El score acumulado ponderado se posiciona en ${composite_score}, apoyando la decisión de ${final_decision}.`;
      }

      // 7. Consolidar el resultado estructurado
      const output: SupervisorAnalystOutput = {
        simbolo: symbol,
        temporalidad: timeframe,
        timestamp: Date.now(),
        composite_score,
        final_decision,
        weight_distribution,
        confidence_level,
        justificacion_cognitiva
      };

      // 8. Escribir al Blackboard de forma reactiva
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: composite_score,
        confidence: confidence_level,
        data: output,
        justification: justificacion_cognitiva
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      console.log(`[SupervisorAgent] Escritura final en Blackboard completada para ${symbol}:${timeframe}. Decisión: ${final_decision}, Score: ${composite_score}`);
    } catch (error) {
      console.error('[SupervisorAgent] Error crítico irrecuperable en el Supervisor:', error);
    }
  }
}
