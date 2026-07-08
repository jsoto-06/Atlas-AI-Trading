/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTelemetry } from '../hooks/useTelemetry.ts';
import { MarketRegime } from '../types/dashboard.ts';
import {
  Activity,
  Cpu,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Percent,
  Compass,
  Sliders,
  Database,
  Calendar
} from 'lucide-react';
import { motion } from 'motion/react';

/**
 * Mapea las clases de color y estilos Tailwind de forma reactiva para cada régimen de mercado.
 */
function getRegimeStyle(regime: MarketRegime) {
  switch (regime) {
    case 'BULL_TREND':
      return {
        bg: 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400',
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        accent: 'text-emerald-400',
        animation: 'animate-none'
      };
    case 'BEAR_TREND':
      return {
        bg: 'bg-indigo-950/40 border-indigo-500/50 text-indigo-400',
        badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        accent: 'text-indigo-400',
        animation: 'animate-none'
      };
    case 'HIGH_VOLATILITY_CRASH':
      return {
        bg: 'bg-rose-950/50 border-rose-600/70 text-rose-400',
        badge: 'bg-rose-600/20 text-rose-300 border-rose-600/50 animate-pulse',
        accent: 'text-rose-500',
        animation: 'animate-pulse'
      };
    case 'MEAN_REVERTING':
    default:
      return {
        bg: 'bg-amber-950/30 border-amber-500/40 text-amber-400',
        badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        accent: 'text-amber-400',
        animation: 'animate-none'
      };
  }
}

/**
 * Formatea segundos a formato de tiempo legible humano (Uptime).
 */
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Componente principal de Exposición del Dashboard de Telemetría.
 */
export const DashboardContainer: React.FC = () => {
  const { data, loading, error, refetch } = useTelemetry(5000);

  // Estados de carga iniciales agradables a la vista
  if (loading && !data.health) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-slate-300">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
          className="mb-4"
        >
          <RefreshCw className="w-8 h-8 text-indigo-500" />
        </motion.div>
        <p className="font-sans text-sm font-medium tracking-wide">
          Sincronizando estado de telemetría institucional...
        </p>
      </div>
    );
  }

  // Estado de error seguro con posibilidad de reintentar
  if (error) {
    return (
      <div className="p-6 bg-rose-950/20 border border-rose-900/50 rounded-2xl max-w-2xl mx-auto my-8">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <h3 className="text-base font-bold text-slate-100">Fallo de Comunicación de Telemetría</h3>
            <p className="text-sm text-slate-400 mt-1">
              No se ha podido conectar con el backend de Fastify en el puerto 3000. Por favor, asegúrese de que el servidor esté encendido.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-rose-950 hover:bg-rose-900 text-rose-300 text-xs font-semibold rounded-lg border border-rose-800/40 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar Sincronización
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desestructuración defensiva con fallbacks
  const health = data.health || { status: 'DEGRADED', database: 'UNKNOWN', uptime: 0, timestamp: Date.now() };
  const regimeData = data.regime || {
    market_regime: 'MEAN_REVERTING' as MarketRegime,
    classification_rationale: 'Estableciendo canal de telemetría...',
    current_weights: {},
    current_kelly_fraction: 8,
    current_atr_multipliers: { stop_loss: 1.5, take_profit: 3.0 },
    min_confidence_threshold: 0.65,
    suspension_flag: false
  };
  const perf = data.performance || {
    sharpe_ratio: 0,
    sortino_ratio: 0,
    profit_factor: 0,
    win_rate: 0,
    max_drawdown_percentage: 0,
    total_trades: 0,
    net_profit_usd: 0,
    total_profit_usd: 0,
    total_loss_usd: 0,
    average_win_usd: 0,
    average_loss_usd: 0
  };

  const regimeStyle = getRegimeStyle(regimeData.market_regime);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 text-slate-100">
      
      {/* 1. SECCIÓN DE CABECERA Y CONTROL DE SALUD (API HEALTH) */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/60 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold font-sans tracking-tight">Consola de Telemetría</h2>
            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-900 border border-slate-800 text-slate-400">
              FAST-LOOP API
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Visualización e inyección inmutable del estado global de la pizarra (Blackboard) y del motor cognitivo.
          </p>
        </div>

        {/* Indicadores en Tiempo Real */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Latencia de conexión */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl text-xs font-mono">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Latencia:</span>
            <span className="text-indigo-300 font-bold">{data.latencyMs}ms</span>
          </div>

          {/* Uptime */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl text-xs font-mono">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Uptime:</span>
            <span className="text-cyan-300 font-bold">{formatUptime(health.uptime)}</span>
          </div>

          {/* Estado del Pool de Conexión */}
          <div className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-xl text-xs font-mono ${
            health.status === 'HEALTHY' 
              ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-400' 
              : 'bg-rose-950/20 border-rose-800/30 text-rose-400'
          }`}>
            <Database className="w-3.5 h-3.5" />
            <span>Pool DB:</span>
            <span className="font-bold">{health.database}</span>
          </div>

          {/* Botón de recarga manual */}
          <button
            onClick={() => refetch()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-slate-100 rounded-xl transition-all"
            title="Refrescar datos de la API"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. REGIME BADGE & ANÁLISIS EVOLUTIVO */}
      <div className={`border rounded-2xl p-6 transition-all duration-500 relative overflow-hidden ${regimeStyle.bg}`}>
        <div className="absolute right-0 top-0 -mr-6 -mt-6 opacity-5 pointer-events-none">
          <Compass className="w-48 h-48" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-bold font-mono tracking-wider uppercase px-2.5 py-1 rounded border ${regimeStyle.badge}`}>
                {regimeData.market_regime.replace('_', ' ')}
              </span>
              {regimeData.suspension_flag && (
                <span className="text-[10px] bg-rose-600/20 text-rose-400 border border-rose-600/50 px-2 py-0.5 rounded font-bold animate-pulse">
                  SUSPENSIÓN DE SEGURIDAD ACTIVADA
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold tracking-tight text-slate-100 font-sans">
              Diagnóstico del Régimen de Mercado Activo
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed max-w-4xl font-sans">
              {regimeData.classification_rationale}
            </p>
          </div>

          {/* Parámetros Operativos Actuales */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/50 space-y-2 flex-shrink-0 min-w-[240px]">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono pb-2 border-b border-slate-800/40">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Calibración de Riesgo</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1.5 text-xs font-mono">
              <span className="text-slate-500">Kelly:</span>
              <span className="text-right font-bold text-indigo-300">1/{regimeData.current_kelly_fraction}-Kelly</span>

              <span className="text-slate-500">SL (ATR):</span>
              <span className="text-right font-bold text-rose-400">{regimeData.current_atr_multipliers.stop_loss}x</span>

              <span className="text-slate-500">TP (ATR):</span>
              <span className="text-right font-bold text-emerald-400">{regimeData.current_atr_multipliers.take_profit}x</span>

              <span className="text-slate-500">Confianza Mín:</span>
              <span className="text-right font-bold text-slate-300">{(regimeData.min_confidence_threshold * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. METRICS GRID - INFORMES DE ANALÍTICA AJUSTADOS AL RIESGO (FASE 13) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Sharpe Ratio */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700/50 transition-all">
          <p className="text-[10px] text-slate-500 font-mono tracking-wider">MÉTRICA SHARPE RATIO</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h4 className="text-3xl font-bold tracking-tight font-mono text-slate-100">
              {perf.sharpe_ratio.toFixed(2)}
            </h4>
            <span className="text-xs text-slate-500 font-mono">anualizado</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Evaluación:</span>
            <span className={`font-bold ${perf.sharpe_ratio >= 1.5 ? 'text-emerald-400' : perf.sharpe_ratio >= 1.0 ? 'text-cyan-400' : 'text-amber-400'}`}>
              {perf.sharpe_ratio >= 1.5 ? 'Excelente' : perf.sharpe_ratio >= 1.0 ? 'Aceptable' : 'Subóptimo'}
            </span>
          </div>
        </div>

        {/* Sortino Ratio */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700/50 transition-all">
          <p className="text-[10px] text-slate-500 font-mono tracking-wider">SORTINO RATIO (DOWNSIDE)</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h4 className="text-3xl font-bold tracking-tight font-mono text-slate-100">
              {perf.sortino_ratio.toFixed(2)}
            </h4>
            <span className="text-xs text-slate-500 font-mono">desviación inferior</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Riesgo de cola:</span>
            <span className={`font-bold ${perf.sortino_ratio >= 1.8 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {perf.sortino_ratio >= 1.8 ? 'Protegido' : 'Moderado'}
            </span>
          </div>
        </div>

        {/* Profit Factor */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 hover:border-slate-700/50 transition-all">
          <p className="text-[10px] text-slate-500 font-mono tracking-wider">PROFIT FACTOR (BRUTO)</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h4 className="text-3xl font-bold tracking-tight font-mono text-slate-100">
              {perf.profit_factor.toFixed(2)}
            </h4>
            <span className="text-xs text-slate-500 font-mono">Ganancia / Pérdida</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Tasa de acierto (Win Rate):</span>
            <span className="font-bold text-slate-300">{(perf.win_rate * 100).toFixed(1)}%</span>
          </div>
        </div>

      </div>

      {/* 4. SECCIÓN SECUNDARIA: DETALLES DE NEGOCIO Y PESOS AJUSTADOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Pesos Actuales de los Agentes en Toma de Decisión */}
        <div className="bg-slate-900/20 border border-slate-800/60 rounded-2xl p-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/50">
            <h4 className="text-sm font-bold font-sans tracking-tight text-slate-200">
              Ponderación Dinámica de Agentes
            </h4>
            <span className="text-[10px] font-mono text-slate-500">Auto-calibración activa</span>
          </div>

          <div className="space-y-3.5 pt-4">
            {Object.entries(regimeData.current_weights).map(([agent, weight]) => (
              <div key={agent} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">{agent}</span>
                  <span className="font-bold text-slate-200">{(weight * 100).toFixed(1)}%</span>
                </div>
                {/* Barra de Progreso Minimalista */}
                <div className="h-1 bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                    style={{ width: `${weight * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {Object.keys(regimeData.current_weights).length === 0 && (
              <p className="text-xs text-slate-500 italic py-4 text-center">
                Cargando ponderaciones de la Fase 14...
              </p>
            )}
          </div>
        </div>

        {/* Registro Histórico de Adaptaciones (learning_performance) */}
        <div className="bg-slate-900/20 border border-slate-800/60 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800/50 flex-shrink-0">
            <h4 className="text-sm font-bold font-sans tracking-tight text-slate-200">
              Bitácora de Optimización Evolutiva
            </h4>
            <span className="text-[10px] font-mono text-slate-500">learning_performance</span>
          </div>

          <div className="divide-y divide-slate-800/40 flex-grow overflow-y-auto max-h-[300px] pt-2">
            {data.history?.data && data.history.data.length > 0 ? (
              data.history.data.map((record) => (
                <div key={record.id} className="py-3 text-xs flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-300 font-mono">{record.parameterKey}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-slate-300 font-mono font-medium">{record.parameterValue}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Régimen: <span className="text-slate-400">{record.performanceMetric}</span> • Activo: {record.symbol}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 font-mono text-[10px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(record.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs">
                <Sliders className="w-8 h-8 text-slate-700 mb-2" />
                <p>Ningún registro de adaptación persistido en base de datos.</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
