/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentName } from '../../types.ts';

export interface AgentPerformanceMetrics {
  agentName: AgentName;
  evaluacionesTotales: number;
  aciertos: number;
  tasaAciertoPct: number;
  multiplicadorBayesiano: number; // Factor de ajuste (ej: 0.8 a 1.4)
  justificacion: string;
}

export interface LearningAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  metricasAgentes: Record<string, AgentPerformanceMetrics>;
  multiplicadoresPesos: Record<string, number>;
  epocasOptimizadas: number;
  factorTuningBayesiano: number;
  scoreConsolidado: number;
  confianza: number;
  justificacionConsolidada: string;
}
