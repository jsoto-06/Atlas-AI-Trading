/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CorrelationItem {
  activo: string; // e.g. "BTC", "ETH", "NASDAQ", "SP500", "DXY", "VIX", "ORO"
  coeficientePearson: number; // Coeficiente de Pearson entre -1.0 y 1.0
  estado: 'FUERTE_DIRECTA' | 'MODERADA_DIRECTA' | 'DEBIL_DIRECTA' | 'NEUTRAL' | 'DEBIL_INVERSA' | 'MODERADA_INVERSA' | 'FUERTE_INVERSA';
  anomaliaDetectada: boolean; // True si diverge significativamente de su comportamiento histórico
  comentario: string;
}

export interface CorrelationAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  correlaciones: CorrelationItem[];
  descorrelacionAnomalaActiva: boolean; // Si hay alguna desviación extrema o anomalía macro
  betaMercado: number; // Beta del activo respecto a Bitcoin (si no es Bitcoin) o respecto al NASDAQ
  scoreConsolidado: number; // -100 a +100
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
}
