/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SupervisorFinalDecision = 'BUY' | 'SELL' | 'HOLD';

export interface SupervisorAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  
  // Métricas críticas requeridas en el BlackboardState
  composite_score: number; // Rango de -100 a +100
  final_decision: SupervisorFinalDecision; // BUY, SELL, HOLD
  weight_distribution: Record<string, number>; // Distribución de pesos dinámicos aplicados a cada agente analizado
  confidence_level: number; // Nivel de confianza ponderada de 0.0 a 1.0
  justificacion_cognitiva: string; // Explicación institucional redactada en castellano
}
