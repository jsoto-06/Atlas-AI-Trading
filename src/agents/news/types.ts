/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NewsSentimentType = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type NewsImpactType = 'HIGH' | 'MEDIUM' | 'LOW';

export interface NewsArticle {
  id: string;
  titulo: string;
  fuente: 'Bloomberg' | 'Reuters' | 'CoinDesk' | 'MacroFeed' | string;
  contenido: string;
  timestamp: number;
  analisis?: {
    sentimiento: NewsSentimentType;
    impacto: NewsImpactType;
    eventoMacro: string; // e.g. "FED", "SEC", "ETF", "CPI", "NINGUNO"
    score: number; // -100 a 100
    confianza: number; // 0.0 a 1.0
    justificacion: string;
  };
}

export interface NewsAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  articulosProcesados: NewsArticle[];
  sentimientoConsolidado: NewsSentimentType;
  impactoMacroEsperado: NewsImpactType;
  eventosMacroDetectados: string[];
  scoreConsolidado: number; // -100 a +100
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
  dataSource?: 'GEMINI_ANALYSIS' | 'LOCAL_FALLBACK_ON_REAL_HEADLINES' | 'UNAVAILABLE';
}
