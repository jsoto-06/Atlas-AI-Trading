/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PerformanceReport } from '../../analytics/types.ts';

/**
 * Configuración inmutable de una sub-instancia de trading activa en el ecosistema multi-instancia.
 */
export interface InstanceConfig {
  readonly instance_id: string;        // Identificador único (ej: "bitget_btc_usdt_1m")
  readonly exchange: string;           // Exchange de ejecución (ej: "bitget", "binance")
  readonly symbol: string;             // Par de negociación (ej: "BTC/USDT")
  readonly leverage: number;           // Apalancamiento asignado
  readonly allocated_capital: number;  // Capital asignado en USD
  readonly timeframe: string;          // Intervalo temporal del Fast-Loop (ej: "1m", "5m")
}

/**
 * Reporte consolidado y agregado de rendimiento multi-instancia.
 * Unifica las métricas clave ponderando cada una según el capital asignado a cada sub-instancia.
 */
export interface AggregatedPerformanceReport extends PerformanceReport {
  readonly total_allocated_capital: number;     // Capital total asignado al ecosistema en USD
  readonly active_instances_count: number;     // Número de sub-instancias activas coordinadas
  readonly instances_performance: Record<string, PerformanceReport>; // Desglose individual indexado por instance_id
}
