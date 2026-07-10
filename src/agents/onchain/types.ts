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
  exchangeInflows: number | null; // Cantidad del activo entrando a exchanges (presión venta) o null si no se mide
  exchangeOutflows: number | null; // Cantidad del activo saliendo de exchanges (retiro a custodia) o null si no se mide
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
  dataSource: 'GEMINI_ANALYSIS' | 'LOCAL_FALLBACK_ON_REAL_DATA' | 'UNAVAILABLE';
}
