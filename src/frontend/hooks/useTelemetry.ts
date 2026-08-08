/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  TelemetryStatusResponse,
  BlackboardStateResponse,
  MarketRegimeResponse,
  LearningHistoryResponse,
  PerformanceReportResponse
} from '../types/dashboard.ts';

export interface TelemetryData {
  health: { status: string; database: string; uptime: number; timestamp: number } | null;
  state: BlackboardStateResponse | null;
  performance: PerformanceReportResponse | null;
  regime: MarketRegimeResponse | null;
  history: LearningHistoryResponse | null;
  latencyMs: number;
}

export interface UseTelemetryResult {
  data: TelemetryData;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Custom Hook useTelemetry.
 * 
 * Orquesta la sincronización reactiva en tiempo real de toda la infraestructura de telemetría.
 * Implementa concurrencia optimizada mediante Promise.all para reducir latencias en el cliente,
 * y un ciclo de consulta defensivo (polling) de baja frecuencia de 5000ms.
 */
export function useTelemetry(pollingIntervalMs = 5000): UseTelemetryResult {
  const [data, setData] = useState<TelemetryData>({
    health: null,
    state: null,
    performance: null,
    regime: null,
    history: null,
    latencyMs: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Evitar re-declaraciones del intervalo de polling usando referencias de estado
  const isFetchingRef = useRef<boolean>(false);

  const fetchTelemetry = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    const startTime = performance.now();
    try {
      // Intentar obtener todos los datos en paralelo para reducir latencia agregada
      const [healthRes, stateRes, performanceRes, regimeRes, historyRes] = await Promise.all([
        fetch('/health').then(r => (r.ok ? r.json() : null)),
        fetch('/api/v1/telemetry/state').then(r => (r.ok ? r.json() : null)),
        fetch('/api/v1/telemetry/performance').then(r => (r.ok ? r.json() : null)),
        fetch('/api/v1/telemetry/regime').then(r => (r.ok ? r.json() : null)),
        fetch('/api/v1/telemetry/history?limit=10').then(r => (r.ok ? r.json() : null))
      ]);

      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      setData({
        health: healthRes,
        state: stateRes,
        performance: performanceRes,
        regime: regimeRes,
        history: historyRes,
        latencyMs
      });
      setError(null);
    } catch (err: any) {
      console.error('[useTelemetry] Error en la sincronización de telemetría:', err);
      setError(err instanceof Error ? err : new Error('Error al sincronizar con el servidor de telemetría.'));
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Carga inicial
    fetchTelemetry();

    // Configurar polling de baja frecuencia
    const timer = setInterval(() => {
      fetchTelemetry();
    }, pollingIntervalMs);

    // Limpieza de intervalos al desmontar el componente para prevenir memory leaks
    return () => {
      clearInterval(timer);
    };
  }, [fetchTelemetry, pollingIntervalMs]);

  return {
    data,
    loading,
    error,
    refetch: fetchTelemetry
  };
}
