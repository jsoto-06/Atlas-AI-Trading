/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SqueezeRiskType = 'HIGH_LONG_SQUEEZE' | 'HIGH_SHORT_SQUEEZE' | 'NEUTRAL';

export interface LiquidationPool {
  rangoPrecio: { alto: number; bajo: number };
  volumenEstimadoUSD: number; // Cantidad estimada de liquidaciones acumuladas
  densidad: 'EXTREMA' | 'ALTA' | 'MEDIA' | 'BAJA';
  distanciaPrecioPct: number; // Distancia en porcentaje respecto al precio actual
}

export interface LiquidationAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  dataSource: string; // Indica el origen real o estimado del set de datos
  volumenLiquidaciones24h: {
    longsUSD: number;
    shortsUSD: number;
    totalUSD: number;
  };
  squeezeRisk: SqueezeRiskType; // Riesgo de barrido en cascada
  piscinasLiquidezMagnetica: LiquidationPool[]; // Pools de liquidaciones de apalancados
  stopHuntingPatronDetectado: boolean; // Patrones de Wyckoff como Spring o Upthrust (con Gemini)
  scoreConsolidado: number; // -100 a +100 para la pizarra
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
}
