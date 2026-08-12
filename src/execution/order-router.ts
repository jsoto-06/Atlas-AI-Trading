/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RiskManagerAnalystOutput } from '../agents/risk/types.ts';
import { BitgetBroker } from './brokers/bitget-broker.ts';
import { OrderManager } from './order-manager.ts';
import { OrderRequest, ExecutionResult, OrderSide } from './types.ts';
import { Blackboard } from '../core/blackboard.ts';

/**
 * Enrutador de Órdenes Centralizado (OrderRouter).
 * 
 * Actúa como el cerebro del Fast-Loop de ejecución del sistema reactivo.
 * Su responsabilidad consiste en recibir los informes validados por el firewall de riesgos
 * (RiskManagerAnalystOutput), verificar el balance disponible en el broker (BitgetBroker),
 * realizar el mapeo inmutable a un contrato de orden (OrderRequest) y despacharla a través
 * del OrderManager con garantía estricta de idempotencia, clientOid persistido en DB
 * y sincronización de apalancamiento en el exchange.
 */
export class OrderRouter {
  private broker: BitgetBroker;
  private orderManager: OrderManager;
  private blackboard: Blackboard;
  private processedSignals: Set<string> = new Set(); // Cache de idempotencia rápida en memoria
  private symbolLocks: Map<string, Promise<void>> = new Map(); // Locks por símbolo para prevenir concurrencia

  constructor(broker?: BitgetBroker, orderManager?: OrderManager) {
    this.broker = broker || new BitgetBroker();
    this.orderManager = orderManager || new OrderManager(this.broker);
    this.blackboard = Blackboard.getInstance();
  }

  /**
   * Obtiene la instancia del OrderManager asociado.
   */
  public getOrderManager(): OrderManager {
    return this.orderManager;
  }

  /**
   * Procesa la señal de riesgo y, si las condiciones de firewall, kill-switch y balance son óptimas,
   * despacha la orden de forma totalmente idempotente hacia el exchange.
   */
  public async dispatchOrder(
    riskOutput: RiskManagerAnalystOutput,
    leverage: number = 10,
    cycleId: string = `cycle_${Date.now()}`
  ): Promise<ExecutionResult> {
    const { simbolo, temporalidad, safe_to_operate, max_position_size, calculated_stop_loss, calculated_take_profit, rejection_reason } = riskOutput;

    // 0. VERIFICACIÓN DE KILL SWITCH DE EMERGENCIA
    if (process.env.KILL_SWITCH === 'true') {
      console.warn(`[OrderRouter] [KILL SWITCH ACTIVO] Bloqueando despacho de orden para ${simbolo}.`);
      return {
        exitoso: false,
        mensajeRespuesta: 'Operación abortada: KILL SWITCH global activo.',
        timestamp: Date.now(),
        error: 'KILL_SWITCH_ACTIVE',
        reintentosRealizados: 0
      };
    }

    // 1. Mutex / Lock por Símbolo para prevenir despachos concurrentes simultáneos
    while (this.symbolLocks.has(simbolo)) {
      console.log(`[OrderRouter] Esperando liberación de lock de despacho para ${simbolo}...`);
      await this.symbolLocks.get(simbolo);
    }

    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.symbolLocks.set(simbolo, lockPromise);

    try {
      // 2. Idempotencia Estricta: Registro de señal ANTES de iniciar despacho
      const signalId = `${simbolo}:${temporalidad}:${riskOutput.timestamp}`;
      if (this.processedSignals.has(signalId)) {
        console.warn(`[OrderRouter] [IDEMPOTENCIA] Señal duplicada ignorada antes del despacho: ${signalId}`);
        return {
          exitoso: false,
          mensajeRespuesta: `Despacho omitido por idempotencia (Señal ya procesada: ${signalId})`,
          timestamp: Date.now(),
          error: 'DUPLICATE_SIGNAL_IGNORED',
          reintentosRealizados: 0
        };
      }

      // Registrar la señal como en proceso para bloquear peticiones paralelas inmediatas
      this.processedSignals.add(signalId);

      // 3. Validar el veredicto del Firewall de Riesgos (Risk Manager)
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

      // 4. Recuperar la decisión de dirección desde el Blackboard (BUY o SELL)
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

      // 5. Consultar y verificar el balance de colateral disponible en Bitget
      console.log(`[OrderRouter] Verificando balance de margen disponible para USDT en Bitget...`);
      const balanceDisponibleUSDT = await this.broker.getBalance('USDT');

      const apalancamientoActivo = Math.max(1, leverage);
      let posicionEfectivaUSD = max_position_size;
      let margenRequerido = posicionEfectivaUSD / apalancamientoActivo;

      // Auto-escalado de seguridad: si el margen requerido supera el 90% del saldo disponible, ajustar el tamaño
      const maxMargenPermitido = balanceDisponibleUSDT * 0.90;
      if (margenRequerido > maxMargenPermitido && balanceDisponibleUSDT > 5) {
        console.warn(`[OrderRouter] [MARGEN AJUSTADO] Margen inicial requerido ($${margenRequerido.toFixed(2)} USDT) supera el 90% del disponible ($${balanceDisponibleUSDT.toFixed(2)} USDT). Ajustando posición a capacidad del saldo.`);
        posicionEfectivaUSD = Number((maxMargenPermitido * apalancamientoActivo).toFixed(2));
        margenRequerido = Number((posicionEfectivaUSD / apalancamientoActivo).toFixed(2));
      }

      console.log(`[OrderRouter] Control de Margen: Balance USDT Disponible: $${balanceDisponibleUSDT.toLocaleString()} USD | Margen Requerido (con apalancamiento ${apalancamientoActivo}x): $${margenRequerido.toLocaleString()} USD`);

      if (balanceDisponibleUSDT < margenRequerido) {
        const hasCreds = !!process.env.BITGET_API_KEY && !!process.env.BITGET_API_SECRET && !!process.env.BITGET_PASSPHRASE;
        const msgError = hasCreds 
          ? `Margen insuficiente en Bitget para abrir la posición. Requerido: $${margenRequerido.toFixed(2)} USDT, Disponible: $${balanceDisponibleUSDT.toFixed(2)} USDT (Tamaño posición: $${posicionEfectivaUSD.toFixed(2)} USD).`
          : `Credenciales de Bitget (API Key / Secret / Passphrase) no configuradas en el entorno. Introduce tus claves de Bitget Demo para operar.`;
        console.error(`[OrderRouter] ${msgError}`);
        return {
          exitoso: false,
          mensajeRespuesta: `Despacho abortado: ${msgError}`,
          timestamp: Date.now(),
          error: hasCreds ? 'INSUFFICIENT_MARGIN' : 'MISSING_BITGET_CREDENTIALS',
          reintentosRealizados: 0
        };
      }

      // 6. Mapeo Inmutable de Contrato de Orden (OrderRequest)
      const orderRequest: OrderRequest = {
        simbolo,
        temporalidad,
        lado: ladoOrden,
        tipo: 'MARKET',
        tamano: posicionEfectivaUSD,
        stopLoss: calculated_stop_loss,
        takeProfit: calculated_take_profit,
        leverage: apalancamientoActivo,
        timestamp: Date.now()
      };

      console.log(`[OrderRouter] Despachando a OrderManager [signalId: ${signalId}, cycleId: ${cycleId}]...`);

      // 7. Enrutar obligatoriamente a través de OrderManager con clientOid persistido en DB
      const executionResult = await this.orderManager.submitOrder(orderRequest, signalId, cycleId, apalancamientoActivo);

      if (executionResult.exitoso) {
        console.log(`[OrderRouter] ¡Ejecución EXITOSA! OrderID: ${executionResult.orderId} | ClientOid: ${executionResult.clientOrderId}`);
      } else {
        console.error(`[OrderRouter] Resultado de despacho fallido: ${executionResult.error}`);
      }

      return executionResult;

    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`[OrderRouter] Error inesperado en el proceso de enrutamiento:`, errorMsg);
      return {
        exitoso: false,
        mensajeRespuesta: `Error crítico en OrderRouter: ${errorMsg}`,
        timestamp: Date.now(),
        error: 'CRITICAL_ROUTER_EXCEPTION',
        reintentosRealizados: 0
      };
    } finally {
      this.symbolLocks.delete(simbolo);
      releaseLock();
    }
  }
}
