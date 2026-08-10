/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrderRequest, ExecutionResult } from './types.ts';
import { BitgetBroker } from './brokers/bitget-broker.ts';

export interface ManagedOrder {
  clientOid: string;
  signalId: string;
  cycleId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  leverage: number;
  timestamp: number;
  status: 'PENDING' | 'DISPATCHED' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  executionResult?: ExecutionResult;
}

export class OrderManager {
  private broker: BitgetBroker;
  private orderStore: Map<string, ManagedOrder> = new Map(); // Key: clientOid
  private signalToOrderMap: Map<string, string> = new Map(); // Key: signalId -> clientOid

  constructor(broker?: BitgetBroker) {
    this.broker = broker || new BitgetBroker();
  }

  /**
   * Genera un identificador único de orden cliente (clientOid) para rastreo e idempotencia.
   */
  public generateClientOid(symbol: string, cycleId: string): string {
    const cleanSym = symbol.replace('/', '').toLowerCase();
    const ts = Date.now();
    return `atlas_${cleanSym}_${cycleId}_${ts}`;
  }

  /**
   * Procesa la orden con garantía estricta de idempotencia.
   */
  public async submitOrder(
    request: OrderRequest,
    signalId: string,
    cycleId: string,
    leverage: number = 10
  ): Promise<ExecutionResult> {
    // 1. Verificación de idempotencia por signalId
    if (this.signalToOrderMap.has(signalId)) {
      const existingClientOid = this.signalToOrderMap.get(signalId)!;
      const existingOrder = this.orderStore.get(existingClientOid);
      console.warn(`[OrderManager] [IDEMPOTENCIA] Señal ya despachada anteriormente (signalId: ${signalId}, clientOid: ${existingClientOid}). Omitiendo duplica.`);
      
      return existingOrder?.executionResult || {
        exitoso: false,
        mensajeRespuesta: `Orden omitida por idempotencia (Señal duplicada: ${signalId})`,
        timestamp: Date.now(),
        error: 'DUPLICATE_SIGNAL_IGNORED',
        reintentosRealizados: 0
      };
    }

    const clientOid = this.generateClientOid(request.simbolo, cycleId);

    const managedOrder: ManagedOrder = {
      clientOid,
      signalId,
      cycleId,
      symbol: request.simbolo,
      side: request.lado,
      quantity: request.tamano,
      price: request.precioLimite,
      leverage,
      timestamp: Date.now(),
      status: 'PENDING'
    };

    this.orderStore.set(clientOid, managedOrder);
    this.signalToOrderMap.set(signalId, clientOid);

    try {
      console.log(`[OrderManager] Despachando orden idempotente [clientOid: ${clientOid}]...`);
      managedOrder.status = 'DISPATCHED';

      const result = await this.broker.executeOrder(request);

      managedOrder.executionResult = result;
      managedOrder.status = result.exitoso ? 'FILLED' : 'REJECTED';

      return result;
    } catch (err: any) {
      managedOrder.status = 'REJECTED';
      const result: ExecutionResult = {
        exitoso: false,
        mensajeRespuesta: `Error en OrderManager al ejecutar orden: ${err.message}`,
        timestamp: Date.now(),
        error: 'ORDER_MANAGER_DISPATCH_EXCEPTION',
        reintentosRealizados: 0
      };
      managedOrder.executionResult = result;
      return result;
    }
  }

  public getOrder(clientOid: string): ManagedOrder | undefined {
    return this.orderStore.get(clientOid);
  }
}
