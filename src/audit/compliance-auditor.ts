/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { InstanceManager } from '../core/instance-manager.ts';
import { Blackboard } from '../core/blackboard.ts';
import { AggregatedMetricsCalculator } from '../analytics/aggregated-metrics-calculator.ts';
import { AuditEvent, SystemHealthReport } from './types.ts';

/**
 * Auditor de Cumplimiento y Cumplimiento de Riesgos (ComplianceAuditor).
 * 
 * Diseñado bajo el patrón Singleton, este componente centraliza la supervisión y
 * observabilidad estricta de todo el ecosistema cuantitativo de trading.
 */
export class ComplianceAuditor {
  private static instance: ComplianceAuditor | null = null;
  private serverStartTime: number;

  private constructor() {
    this.serverStartTime = Date.now();
  }

  /**
   * Retorna la instancia única del Auditor de Cumplimiento.
   */
  public static getInstance(): ComplianceAuditor {
    if (!ComplianceAuditor.instance) {
      ComplianceAuditor.instance = new ComplianceAuditor();
    }
    return ComplianceAuditor.instance;
  }

  /**
   * Loguea un evento de cumplimiento de forma síncrona en la consola y asíncrona en la base de datos.
   */
  public logEvent(event: AuditEvent): void {
    const timestampDate = new Date(event.timestamp);

    // 1. Logueo Síncrono Estructurado (Estilo Pino JSON a stdout)
    const logLine = {
      time: event.timestamp,
      level: event.level,
      component: event.component,
      msg: event.message,
      ...(event.payload ? { payload: event.payload } : {})
    };
    console.log(JSON.stringify(logLine));

    // 2. Persistencia asíncrona en la tabla audit_logs
    db.insert(auditLogs).values({
      timestamp: timestampDate,
      level: event.level,
      agentName: event.component,
      message: event.message,
      payload: event.payload || null
    }).catch(err => {
      // Manejo defensivo: no tumbar el servidor de trading por un fallo de red o persistencia de logs
      console.error('[ComplianceAuditor] Error crítico al persistir log de auditoría en la BD:', err);
    });
  }

  /**
   * Rutina reactiva de monitoreo de compliance.
   * Dispara alertas de alto nivel (CRITICAL_RISK) con un banner de seguridad formateado
   * si se detectan anomalías operativas o deslizamiento superior al umbral de seguridad.
   */
  public evaluateSystemMetrics(suspensionFlag: boolean, slippagePct: number, slippageThreshold = 0.005): void {
    if (suspensionFlag) {
      this.triggerCriticalAlert(
        'AdaptiveEngine',
        'SUSPENSIÓN DE ESTRATEGIA DETECTADA: El motor adaptativo ha ordenado suspender la ejecución de operaciones de forma indefinida.',
        { suspensionFlag }
      );
    }

    if (slippagePct > slippageThreshold) {
      this.triggerCriticalAlert(
        'RiskManager',
        `DESLIZAMIENTO DE PRECIOS EXCESIVO (HIGH SLIPPAGE): Slippage de ${(slippagePct * 100).toFixed(3)}% supera el umbral máximo de ${(slippageThreshold * 100).toFixed(3)}%.`,
        { slippagePct, slippageThreshold }
      );
    }
  }

  /**
   * Dispara una alerta de riesgo crítico imprimiendo un banner llamativo de aviso en consola y registrando el evento.
   */
  public triggerCriticalAlert(component: string, message: string, payload?: Record<string, any>): void {
    const timestamp = Date.now();

    // Banner formateado de alta visibilidad para terminales/consolas institucionales
    console.warn('\n' + '█'.repeat(80));
    console.warn(`  [ALERTA DE SEGURIDAD QUANT] - COMPLIANCE CRITICAL RISK`);
    console.warn(`  TIMESTAMP  : ${new Date(timestamp).toISOString()}`);
    console.warn(`  COMPONENTE : ${component}`);
    console.warn(`  MENSAJE    : ${message}`);
    console.warn('█'.repeat(80) + '\n');

    this.logEvent({
      timestamp,
      level: 'CRITICAL_RISK',
      component,
      message,
      payload
    });
  }

  /**
   * Genera el reporte de consolidación final (SystemHealthReport) analizando el estado de todas las fases.
   */
  public async generateFinalSystemReport(): Promise<SystemHealthReport> {
    const now = Date.now();
    
    // 1. Verificar salud de la base de datos de forma dinámica
    let databaseStatus = 'DEGRADED';
    let apiStatus: 'HEALTHY' | 'DEGRADED' = 'DEGRADED';
    const latencyStart = performance.now();
    try {
      // Consulta simple de verificación
      await db.execute('SELECT 1');
      databaseStatus = 'HEALTHY';
      apiStatus = 'HEALTHY';
    } catch (err) {
      console.error('[ComplianceAuditor] Error verificando salud de conexión de base de datos:', err);
    }
    const latencyMs = Math.round(performance.now() - latencyStart);

    // 2. Extraer instancias operativas del InstanceManager (Fase 17)
    const instanceMgr = InstanceManager.getInstance();
    const activeConfigs = instanceMgr.getActiveInstances();
    const activeInstancesCount = activeConfigs.length;
    const instancesList = activeConfigs.map(c => c.instance_id);

    // 3. Buscar datos cognitivos y régimen en el Blackboard (Fase 14)
    const blackboard = Blackboard.getInstance();
    const allStates = blackboard.getAllStates();
    
    let currentRegime = 'MEAN_REVERTING';
    let suspensionFlag = false;
    let minConfidenceThreshold = 0.65;

    for (const state of Object.values(allStates)) {
      // Intentamos ubicar evaluaciones del agente de aprendizaje/estrategia
      const learning = state.assessments['Learning']?.value;
      if (learning && learning.data) {
        if (learning.data.market_regime) {
          currentRegime = learning.data.market_regime;
        }
        if (learning.data.suspension_flag !== undefined) {
          suspensionFlag = learning.data.suspension_flag;
        }
        if (learning.data.min_confidence_threshold !== undefined) {
          minConfidenceThreshold = learning.data.min_confidence_threshold;
        }
      }
    }

    // 4. Calcular métricas agregadas financieras de capital (Fase 13)
    const metricsCalc = new AggregatedMetricsCalculator();
    const performanceReport = await metricsCalc.generateAggregatedReport(activeConfigs);

    return {
      timestamp: now,
      api: {
        status: apiStatus,
        uptime: Math.floor((now - this.serverStartTime) / 1000),
        databaseStatus,
        averageLatencyMs: latencyMs
      },
      multiInstance: {
        activeInstancesCount,
        instancesList
      },
      cognitiveEngine: {
        currentRegime,
        suspensionFlag,
        minConfidenceThreshold
      },
      capitalMetrics: {
        totalAllocatedCapital: performanceReport.total_allocated_capital,
        netProfitUSD: performanceReport.net_profit_usd,
        globalSharpeRatio: performanceReport.sharpe_ratio
      }
    };
  }
}
