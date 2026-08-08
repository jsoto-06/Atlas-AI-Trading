/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DivergenceType = 'BULLISH_REGULAR' | 'BULLISH_HIDDEN' | 'BEARISH_REGULAR' | 'BEARISH_HIDDEN' | 'NONE';
export type IndicatorType = 'RSI' | 'MACD' | 'CVD' | 'VOLUME';

export interface DivergenceItem {
  indicador: IndicatorType;
  tipo: DivergenceType;
  confirmado: boolean;
  precioPuntoA: { precio: number; indice: number; valorIndicador: number };
  precioPuntoB: { precio: number; indice: number; valorIndicador: number };
  comentario: string;
}

export interface DivergenceAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  divergenciasDetectadas: DivergenceItem[];
  confluenciaDivergencias: boolean; // Si hay múltiples indicadores apuntando en la misma dirección
  estadoDivergenciaGeneral: 'ALCISTA' | 'BAJISTA' | 'NEUTRAL';
  scoreConsolidado: number; // -100 a +100 para la pizarra
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
}
