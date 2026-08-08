/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Evento de auditoría inmutable para supervisión de cumplimiento institucional (Compliance).
 */
export interface AuditEvent {
  readonly timestamp: number;
  readonly level: 'INFO' | 'WARNING' | 'CRITICAL_RISK';
  readonly component: string; // e.g. "RiskManager", "InstanceManager", "FastifyAPI"
  readonly message: string;
  readonly payload?: Record<string, any>;
}

/**
 * Reporte de salud global de solo lectura que consolida el estado actual de todas las fases.
 */
export interface SystemHealthReport {
  readonly timestamp: number;
  
  // Estado de salud del Servidor Web (Fase 15 / 16)
  readonly api: {
    readonly status: 'HEALTHY' | 'DEGRADED';
    readonly uptime: number;
    readonly databaseStatus: string;
    readonly averageLatencyMs: number;
  };

  // Escalamiento Horizontal (Fase 17)
  readonly multiInstance: {
    readonly activeInstancesCount: number;
    readonly instancesList: readonly string[];
  };

  // Motor Cognitivo Adaptativo (Fase 14)
  readonly cognitiveEngine: {
    readonly currentRegime: string;
    readonly suspensionFlag: boolean;
    readonly minConfidenceThreshold: number;
  };

  // Balances de Capital e Inversión (Fase 13)
  readonly capitalMetrics: {
    readonly totalAllocatedCapital: number;
    readonly netProfitUSD: number;
    readonly globalSharpeRatio: number;
  };
}
