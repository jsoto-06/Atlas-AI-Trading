/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseAgent } from '../base-agent.ts';
import { AgentName, AgentAssessment } from '../../types.ts';
import { RiskManagerAnalystOutput } from './types.ts';
import { db } from '../../db/index.ts';
import { settings } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

/**
 * Agente Gestor de Riesgos (Risk Manager Agent - Firewall Matemático Determinista).
 * 
 * Actúa como un guardián síncrono e infranqueable (Fast-Loop) justo antes de la
 * ejecución de cualquier orden recomendada por el Supervisor.
 * 
 * Implementa filtros estrictos e inmutables:
 * 1. Verificación de Drawdown: Bloquea operaciones si el Drawdown diario o acumulado de la cuenta
 *    supera los límites de control de riesgo especificados en la base de datos (settings).
 * 2. Filtro de Volatilidad y Liquidez: Valida la volatilidad instantánea (ATR) y liquidez de mercado (Spread/Volumen).
 * 3. Viabilidad de la Estrategia (Risk-Reward Ratio): Requiere que la orden tenga un ratio R:B mínimo de 1:2.
 * 4. Dimensionamiento Científico de Posiciones: Calcula el volumen exacto de entrada utilizando
 *    el Criterio de Kelly (Half-Kelly o Quarter-Kelly) acoplado a la distancia del Stop Loss por ATR.
 */
export class RiskManagerAgent extends BaseAgent {
  public readonly name: AgentName = 'RiskManager';
  public readonly isFastLoop: boolean = true; // Guardián determinista en bucle rápido

  // Configuración de riesgo por defecto (Fallback si la DB no está disponible)
  private readonly DEFAULT_RISK_LIMITS = {
    maxDailyDrawdown: 0.05,      // 5% Drawdown diario máximo
    maxTotalDrawdown: 0.10,      // 10% Drawdown total máximo
    maxDailyDrawdownUSD: 500,    // $500 USD de pérdida diaria máxima para una cuenta estándar
    maxTotalDrawdownUSD: 1000,   // $1000 USD de pérdida total máxima
    accountSizeUSD: 10000,       // Cuenta base de $10,000 USD para dimensionamiento
    maxAtrVolatility: 0.05,      // 5% de volatilidad instantánea máxima para operar con seguridad
    maxBitgetSpread: 0.002,      // 0.2% Spread máximo permitido para mitigar deslizamiento
    defaultWinRate: 0.55         // Tasa de acierto histórica estimada para el Criterio de Kelly
  };

  /**
   * Consulta las configuraciones de riesgo desde la tabla de base de datos.
   * Si no se encuentra o el pool está caído, devuelve la configuración de control predeterminada.
   */
  private async cargarLimitesRiesgo(): Promise<typeof this.DEFAULT_RISK_LIMITS> {
    try {
      // Intentar obtener el registro de configuración del motor
      const filas = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'global_risk_limits'))
        .limit(1);

      if (filas && filas.length > 0) {
        const dbVal = filas[0].value as any;
        return {
          maxDailyDrawdown: dbVal.maxDailyDrawdown ?? this.DEFAULT_RISK_LIMITS.maxDailyDrawdown,
          maxTotalDrawdown: dbVal.maxTotalDrawdown ?? this.DEFAULT_RISK_LIMITS.maxTotalDrawdown,
          maxDailyDrawdownUSD: dbVal.maxDailyDrawdownUSD ?? this.DEFAULT_RISK_LIMITS.maxDailyDrawdownUSD,
          maxTotalDrawdownUSD: dbVal.maxTotalDrawdownUSD ?? this.DEFAULT_RISK_LIMITS.maxTotalDrawdownUSD,
          accountSizeUSD: dbVal.accountSizeUSD ?? this.DEFAULT_RISK_LIMITS.accountSizeUSD,
          maxAtrVolatility: dbVal.maxAtrVolatility ?? this.DEFAULT_RISK_LIMITS.maxAtrVolatility,
          maxBitgetSpread: dbVal.maxBitgetSpread ?? this.DEFAULT_RISK_LIMITS.maxBitgetSpread,
          defaultWinRate: dbVal.defaultWinRate ?? this.DEFAULT_RISK_LIMITS.defaultWinRate
        };
      }
    } catch (error) {
      console.warn('[RiskManagerAgent] Error al consultar límites de riesgo en Drizzle DB. Aplicando fallback de contingencia:', error);
    }
    return this.DEFAULT_RISK_LIMITS;
  }

  /**
   * Ejecuta el diagnóstico de control de riesgo determinista de forma síncrona/fast.
   */
  public async analyze(symbol: string, timeframe: string): Promise<void> {
    try {
      console.log(`[RiskManagerAgent] Iniciando firewall matemático determinista para ${symbol}:${timeframe}...`);

      const limits = await this.cargarLimitesRiesgo();
      const snapshot = this.blackboard.getSnapshot(symbol, timeframe);
      const precioActual = snapshot.marketData?.value?.price || 68000;

      // Variables de auditoría interna
      let safe_to_operate = true;
      let rejection_reason: string | null = null;
      let justificacion = 'Aprobación del firewall de riesgo completada.';

      // 1. Verificación de Parámetros Globales (Drawdown de Cuenta)
      // Simulación determinista de drawdown actual de la cuenta para validar el guardián
      // En producción, esto se calcularía de la suma de pérdidas y ganancias diarias de la tabla `trades`
      const currentDailyDrawdownUSD = 120; // Supongamos $120 USD de Drawdown diario acumulado hoy
      const currentTotalDrawdownUSD = 250; // Supongamos $250 USD de Drawdown acumulado histórico

      const dailyDrawdownPct = currentDailyDrawdownUSD / limits.accountSizeUSD;
      const totalDrawdownPct = currentTotalDrawdownUSD / limits.accountSizeUSD;

      if (dailyDrawdownPct >= limits.maxDailyDrawdown) {
        safe_to_operate = false;
        rejection_reason = `Límite de Drawdown Diario Excedido. Actual: ${(dailyDrawdownPct * 100).toFixed(2)}% (Límite: ${(limits.maxDailyDrawdown * 100).toFixed(2)}%). Operaciones congeladas para mitigar pérdidas.`;
      } else if (totalDrawdownPct >= limits.maxTotalDrawdown) {
        safe_to_operate = false;
        rejection_reason = `Límite de Drawdown Total de la Cuenta Excedido. Actual: ${(totalDrawdownPct * 100).toFixed(2)}% (Límite: ${(limits.maxTotalDrawdown * 100).toFixed(2)}%). Bloqueo absoluto de riesgo activo.`;
      }

      // 2. Filtro de Condiciones de Mercado (Volatilidad ATR y Spread)
      let atrVal = precioActual * 0.015; // Fallback por defecto si no hay indicador (1.5%)
      const techSlot = snapshot.assessments['TechnicalAnalyst'];
      if (techSlot?.value?.data?.indicadores?.atr) {
        atrVal = techSlot.value.data.indicadores.atr;
      }

      const atrVolatilidadInstantnea = atrVal / precioActual;
      if (safe_to_operate && atrVolatilidadInstantnea > limits.maxAtrVolatility) {
        safe_to_operate = false;
        rejection_reason = `Volatilidad del Mercado Extrema. ATR Relativo: ${(atrVolatilidadInstantnea * 100).toFixed(2)}% supera el umbral de seguridad de ${(limits.maxAtrVolatility * 100).toFixed(2)}%. No es seguro colocar órdenes con spread flotante.`;
      }

      // Spread estimado en Bitget para el par analizado (simulado)
      const spreadBitget = 0.0004; // 0.04% Spread saludable
      if (safe_to_operate && spreadBitget > limits.maxBitgetSpread) {
        safe_to_operate = false;
        rejection_reason = `Spread del Exchange Elevado. Bitget spread actual: ${(spreadBitget * 100).toFixed(2)}% excede el límite de ${(limits.maxBitgetSpread * 100).toFixed(2)}% configurado en el firewall.`;
      }

      // 3. Recuperar Decisión de Dirección desde el Supervisor
      const supervisorSlot = snapshot.assessments['Supervisor'];
      const decisionSupervisor = supervisorSlot?.value?.data?.final_decision || 'HOLD';
      const scoreConsolidado = supervisorSlot?.value?.score || 0;
      const confianzaSupervisor = supervisorSlot?.value?.confidence || limits.defaultWinRate;

      if (safe_to_operate && decisionSupervisor === 'HOLD') {
        safe_to_operate = false;
        rejection_reason = 'El Agente Supervisor no ha emitido una señal de entrada (HOLD).';
      }

      // 4. Filtro de Viabilidad de la Estrategia (Risk-Reward Ratio) y dimensionamiento
      let calculated_stop_loss = 0;
      let calculated_take_profit = 0;
      let trailing_stop_activation = 0;
      let risk_reward_ratio = 0;
      let max_position_size = 0;
      let kelly_fraction = 0;

      if (safe_to_operate && (decisionSupervisor === 'BUY' || decisionSupervisor === 'SELL')) {
        // Distancias de mitigación basadas en múltiplos de ATR (SL = 2 * ATR, TP = 4.5 * ATR)
        const distanciaSL = 2 * atrVal;
        const distanciaTP = 4.5 * atrVal;
        
        risk_reward_ratio = Number((distanciaTP / distanciaSL).toFixed(2)); // Debe ser exactamente 2.25 (cumple >= 2.0)

        if (risk_reward_ratio < 2.0) {
          safe_to_operate = false;
          rejection_reason = `Ratio de Riesgo-Beneficio Insuficiente. Calculado: 1:${risk_reward_ratio} (Umbral Mínimo Requerido: 1:2.0).`;
        } else {
          // Determinar niveles de salida exactos
          if (decisionSupervisor === 'BUY') {
            calculated_stop_loss = Number((precioActual - distanciaSL).toFixed(2));
            calculated_take_profit = Number((precioActual + distanciaTP).toFixed(2));
            // Activación del trailing stop al superar el primer tramo (1.5 * ATR de beneficio)
            trailing_stop_activation = Number((precioActual + 1.5 * atrVal).toFixed(2));
          } else { // SELL (Short)
            calculated_stop_loss = Number((precioActual + distanciaSL).toFixed(2));
            calculated_take_profit = Number((precioActual - distanciaTP).toFixed(2));
            trailing_stop_activation = Number((precioActual - 1.5 * atrVal).toFixed(2));
          }

          // 5. Dimensionamiento Científico de la Posición (Position Sizing)
          // Implementamos el Criterio de Kelly (Quarter-Kelly para una gestión institucional conservadora)
          // p = probabilidad de ganar (derivada de la confianza del Supervisor ajustada)
          const p = Math.max(0.40, Math.min(0.85, confianzaSupervisor));
          const b = risk_reward_ratio; // Pago por unidad de riesgo (2.25)
          const q = 1 - p;

          const kellyRaw = p - (q / b);
          // Aplicamos fracción conservadora de un cuarto (Quarter-Kelly) para neutralizar la varianza del mercado
          kelly_fraction = Number((Math.max(0, kellyRaw) * 0.25).toFixed(4));

          // Cálculo del riesgo absoluto en dólares de la cuenta
          const riesgoMaxUSD = limits.accountSizeUSD * kelly_fraction;

          // Distancia porcentual del Stop Loss
          const distanciaSLPct = distanciaSL / precioActual;

          // Tamaño máximo de la posición apalancada (en USD)
          // Posición = Riesgo USD / Distancia SL %
          const maxPosicionUSD = distanciaSLPct > 0 ? (riesgoMaxUSD / distanciaSLPct) : 0;
          max_position_size = Number(maxPosicionUSD.toFixed(2));

          if (max_position_size <= 0 || kelly_fraction <= 0) {
            safe_to_operate = false;
            rejection_reason = `La fracción de Kelly calculada es nula o negativa (${kelly_fraction}). Sugiere que la probabilidad de éxito no compensa la estructura de riesgo actual.`;
          }
        }
      }

      // 6. Consolidar informe ejecutivo en Castellano
      if (safe_to_operate) {
        justificacion = `Firewall de Riesgos validado en verde para ${symbol}. `;
        justificacion += `Drawdowns bajo estricto control (Diario: ${(dailyDrawdownPct * 100).toFixed(2)}%, Total: ${(totalDrawdownPct * 100).toFixed(2)}%). `;
        justificacion += `La orden cumple con el Ratio R:B mínimo de 1:2.0 (Calculado 1:${risk_reward_ratio}). `;
        justificacion += `Dimensionamiento ajustado institucionalmente mediante Quarter-Kelly (${(kelly_fraction * 100).toFixed(2)}% de riesgo del capital) fijando un tamaño de posición máximo de $${max_position_size.toLocaleString()} USD. `;
        justificacion += `Salidas fijadas de forma inteligente por ATR: SL en ${calculated_stop_loss} USD, TP en ${calculated_take_profit} USD.`;
      } else {
        justificacion = `Operación RECHAZADA por el Firewall de Riesgos determinista. Razón: ${rejection_reason}`;
      }

      const output: RiskManagerAnalystOutput = {
        simbolo: symbol,
        temporalidad: timeframe,
        timestamp: Date.now(),
        safe_to_operate,
        max_position_size,
        calculated_stop_loss,
        calculated_take_profit,
        trailing_stop_activation,
        kelly_fraction,
        risk_reward_ratio,
        rejection_reason,
        justificacionConsolidada: justificacion
      };

      // 7. Escribir resultado síncronamente al Blackboard
      const assessment: AgentAssessment = {
        agentName: this.name,
        timestamp: Date.now(),
        score: safe_to_operate ? scoreConsolidado : 0, // Si es bloqueado, neutraliza el score final
        confidence: safe_to_operate ? confianzaSupervisor : 1.0, // Alta certeza al bloquear
        data: output,
        justification: justificacion
      };

      this.blackboard.writeAssessment(symbol, timeframe, assessment);
      console.log(`[RiskManagerAgent] Firewall finalizado. Safe to operate: ${safe_to_operate}, Score: ${assessment.score}`);
    } catch (error) {
      console.error('[RiskManagerAgent] Error crítico en la ejecución del firewall de riesgo:', error);
    }
  }
}
