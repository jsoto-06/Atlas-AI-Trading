/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SentimentSourceType = 'X/Twitter' | 'Reddit' | 'FearAndGreedIndex' | string;

export interface SentimentMetrics {
  fuente: SentimentSourceType;
  score: number; // 0 a 100
  frecuenciaMenciones: number;
  fomoDetectado: boolean;
  panicoDetectado: boolean;
  manipulacionDetectado: boolean;
  justificacion: string;
}

export interface SentimentAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  scoreSocial: number; // 0 a 100 (Estilo Miedo y Codicia: <30 Miedo Extremo, >70 Codicia Extrema)
  sesgosDetectados: ('FOMO' | 'PÁNICO' | 'MANIPULACIÓN' | 'NARRATIVAS')[];
  fuentesAnalizadas: SentimentMetrics[];
  scoreConsolidado: number; // -100 a +100 (Unificado para el Blackboard)
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
}
