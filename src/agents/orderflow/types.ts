/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CVDSlopeType = 'ACCUMULATING' | 'DISTRIBUTING' | 'NEUTRAL';
export type OpenInterestTrendType = 'UPWARD' | 'DOWNWARD' | 'FLAT';

export interface OrderBookLevel {
  precio: number;
  tamano: number;
  totalAcumulado: number;
}

export interface OrderFlowAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  imbalanceRatio: number; // Desequilibrio bid/ask (e.g. > 1.5 es desequilibrio comprador)
  cvdSlope: CVDSlopeType; // Pendiente del Cumulative Volume Delta
  deltaVolume: number; // Diferencia volumen de compra vs venta neto
  openInterestTrend: OpenInterestTrendType; // Tendencia de Interés Abierto
  fundingRate: number; // Tasa de financiación actual (en porcentaje, e.g. 0.01)
  pocVolume: {
    precioPOC: number; // Point of Control
    volumenPOC: number;
  };
  domLiquidityRatio: number; // Liquidez en el Depth of Market (bid vs ask depth ratio)
  stopHuntingDetected: boolean; // Alerta de barrido artificial o fakeouts
  skewRatio: number; // Sesgo de agresión de mercado (takers vs makers)
  scoreConsolidado: number; // -100 a +100 para la pizarra
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
}
