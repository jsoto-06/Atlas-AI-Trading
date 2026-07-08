/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type WhaleActivityType = 'ACCUMULATING' | 'DISTRIBUTING' | 'HOLDING';
export type DormantCoinsType = 'HIGH' | 'MEDIUM' | 'LOW';
export type MVRVStatusType = 'UNDERVALUED' | 'OVERVALUED' | 'FAIR';
export type NVTStatusType = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface OnChainAnalystOutput {
  simbolo: string;
  temporalidad: string;
  timestamp: number;
  exchangeInflows: number; // Cantidad del activo entrando a exchanges (presión venta)
  exchangeOutflows: number; // Cantidad del activo saliendo de exchanges (retiro a custodia)
  whaleActivity: WhaleActivityType; // Comportamiento de grandes carteras
  dormantCoinsMovement: DormantCoinsType; // Reactivación de monedas antiguas (riesgo de dump)
  mvrvStatus: MVRVStatusType; // Relación valor de mercado / valor realizado (MVRV)
  nvtStatus: NVTStatusType; // Relación valor de red / transacciones (NVT)
  institutionalAccumulation: {
    detectada: boolean;
    confianza: number;
    descripcion: string;
  };
  scoreConsolidado: number; // -100 a +100
  confianza: number; // 0.0 a 1.0
  justificacionConsolidada: string;
}
