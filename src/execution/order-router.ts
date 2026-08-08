/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RiskManagerAnalystOutput } from '../agents/risk/types.ts';
import { BitgetBroker } from './brokers/bitget-broker.ts';
import { OrderRequest, ExecutionResult, OrderSide, OrderType } from './types.ts';
import { Blackboard } from '../core/blackboard.ts';
import { AgentAssessment } from '../types.ts';

/**
 * Enrutador de Órdenes Centralizado (OrderRouter).
 * 
 * Actúa como el cerebro del Fast-Loop de ejecución del sistema reactivo.
 * Su responsabilidad consiste en recibir los informes validados por el firewall de riesgos
 * (RiskManagerAnalystOutput), verificar el balance disponible en el broker (BitgetBroker),
 * realizar el mapeo inmutable a un contrato de orden (OrderRequest) y despacharla de forma
 * segura, previniendo deslizamientos extremos o sobre-apalancamientos destructivos.
 */
export class OrderRouter {
  private broker: BitgetBroker;
  private blackboard: Blackboard;

  // Parámetro de apalancamiento implícito por defecto para el cálculo de margen (e.g. 5x)
  private readonly APALANCAMIENTO_DEFECTO = 5;

  constructor(broker?: BitgetBroker) {
    this.broker = broker || new BitgetBroker();
    this.blackboard = Blackboard.getInstance();
  }

  /**
   * Procesa la señal de riesgo y, si las condiciones de firewall y balance son óptimas,
   * despacha la orden directamente a la API de Bitget a través de su broker.
   * 
   * @param riskOutput El informe de auditoría generado por el Agente Gestor de Riesgos.
   * @returns El resultado definitivo de la ejecución (ExecutionResult).
   */
  public async dispatchOrder(riskOutput: RiskManagerAnalystOutput): Promise<ExecutionResult> {
    const { simbolo, temporalidad, safe_to_operate, max_position_size, calculated_stop_loss, calculated_take_profit, rejection_reason } = riskOutput;

    console.log(`[OrderRouter] Evaluando despacho de orden para ${simbolo} en ${temporalidad}...`);

    // 1. Validar el veredicto del Firewall de Riesgos (Risk Manager)
    if (!safe_to_operate) {
      const razon = rejection_reason || 'Rechazado por filtros preventivos del Gestor de Riesgos.';
      console.warn(`[OrderRouter] Operación bloqueada por el Firewall de Riesgos. Razón: ${razon}`);
      return {
        exitoso: false,
        mensajeRespuesta: `Despacho abortado: ${razon}`,
        timestamp: Date.now(),
        error: 'BLOCKED_BY_RISK_MANAGER',
        reintentosRealizados: 0
      };
    }

    try {
      // 2. Recuperar la decisión de dirección desde el Blackboard (BUY o SELL)
      const snapshot = this.blackboard.getSnapshot(simbolo, temporalidad);
      const supervisorAssessment = snapshot.assessments['Supervisor'];
      
      const decisionSupervisor = supervisorAssessment?.value?.data?.final_decision;
      if (!decisionSupervisor || (decisionSupervisor !== 'BUY' && decisionSupervisor !== 'SELL')) {
        console.warn(`[OrderRouter] Despacho abortado: La decisión actual del Supervisor en la pizarra no es transaccionable: ${decisionSupervisor}`);
        return {
          exitoso: false,
          mensajeRespuesta: `Despacho abortado: El Supervisor se encuentra en estado '${decisionSupervisor}' o inactivo.`,
          timestamp: Date.now(),
          error: 'SUPERVISOR_NOT_READY',
          reintentosRealizados: 0
        };
      }

      const ladoOrden: OrderSide = decisionSupervisor as OrderSide;

      // 3. Consultar y verificar el balance de colateral disponible en Bitget
      console.log(`[OrderRouter] Verificando balance de margen disponible para USDT en Bitget...`);
      const balanceDisponibleUSDT = await this.broker.getBalance('USDT');

      // Calcular el margen mínimo requerido asumiendo apalancamiento regulado
      // Margen requerido = Tamaño de la posición / Apalancamiento
      const margenRequerido = max_position_size / this.APALANCAMIENTO_DEFECTO;

      console.log(`[OrderRouter] Control de Margen: Balance USDT Disponible: $${balanceDisponibleUSDT.toLocaleString()} USD | Margen Requerido (con apalancamiento ${this.APALANCAMIENTO_DEFECTO}x): $${margenRequerido.toLocaleString()} USD`);

      if (balanceDisponibleUSDT < margenRequerido) {
        const msgError = `Margen insuficiente en Bitget para abrir la posición. Requerido: $${margenRequerido.toFixed(2)} USDT, Disponible: $${balanceDisponibleUSDT.toFixed(2)} USDT (Tamaño posición: $${max_position_size.toFixed(2)} USD).`;
        console.error(`[OrderRouter] ${msgError}`);
        return {
          exitoso: false,
          mensajeRespuesta: `Despacho abortado: ${msgError}`,
          timestamp: Date.now(),
          error: 'INSUFFICIENT_MARGIN',
          reintentosRealizados: 0
        };
      }

      // 4. Mapeo Inmutable de Contrato de Orden (OrderRequest)
      const orderRequest: OrderRequest = {
        simbolo,
        temporalidad,
        lado: ladoOrden,
        tipo: 'MARKET', // Entrada ágil a mercado para asegurar llenado instantáneo
        tamano: max_position_size,
        stopLoss: calculated_stop_loss,
        takeProfit: calculated_take_profit,
        timestamp: Date.now()
      };

      console.log(`[OrderRouter] Despachando OrderRequest mapeado de forma asíncrona hacia BitgetBroker:`, JSON.stringify(orderRequest, null, 2));

      // 5. Despachar a través del Broker oficial con su envoltura de reintentos con backoff
      const executionResult = await this.broker.executeOrder(orderRequest);

      // Registrar resultado en la consola institucional de auditoría
      if (executionResult.exitoso) {
        console.log(`[OrderRouter] ¡Ejecución EXITOSA en Bitget! ID Orden: ${executionResult.orderId} | Precio Ejecutado: ${executionResult.precioEjecutado} USD | Comisión cobrada: $${executionResult.comisionUSD} USD.`);
      } else {
        console.error(`[OrderRouter] Falla definitiva reportada por el broker al ejecutar la orden: ${executionResult.error}`);
      }

      return executionResult;

    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`[OrderRouter] Error inesperado en el proceso de enrutamiento y despacho de orden:`, errorMsg);
      return {
        exitoso: false,
        mensajeRespuesta: `Error crítico e inesperado en OrderRouter: ${errorMsg}`,
        timestamp: Date.now(),
        error: 'CRITICAL_ROUTER_EXCEPTION',
        reintentosRealizados: 0
      };
    }
  }
}
