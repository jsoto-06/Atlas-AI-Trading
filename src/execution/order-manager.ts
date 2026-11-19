/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrderRequest, ExecutionResult } from './types.ts';
import { IExchangeBroker } from './brokers/types.ts';
import { BrokerFactory } from './brokers/broker-factory.ts';
import { db } from '../db/index.ts';
import { orders } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export type OrderStatus =
  | 'CREATED'
  | 'SUBMITTING'
  | 'UNKNOWN'
  | 'OPEN'
  | 'FILLED'
  | 'PARTIALLY_FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'FAILED';

export interface ManagedOrder {
  id?: number;
  clientOid: string;
  signalId: string;
  cycleId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  size: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage: number;
  status: OrderStatus;
  retryCount: number;
  exchangeOrderId?: string;
  errorDetails?: string;
  executionResult?: ExecutionResult;
  createdAt: number;
  updatedAt: number;
}

export class OrderManager {
  private broker: IExchangeBroker;
  private memoryStore: Map<string, ManagedOrder> = new Map(); // clientOid -> ManagedOrder
  private signalMap: Map<string, string> = new Map(); // signalId -> clientOid

  constructor(broker?: IExchangeBroker) {
    this.broker = broker || BrokerFactory.getDefaultBroker();
  }

  /**
   * Genera un clientOid determinista e inmutable para una intención de orden.
   */
  public generateClientOid(symbol: string, cycleId: string, timestamp: number = Date.now()): string {
    const cleanSym = symbol.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const cleanCycle = cycleId.replace(/[^a-zA-Z0-9]/g, '_');
    return `atlas_${cleanSym}_${cleanCycle}_${timestamp}`;
  }

  /**
   * Registra y persiste en DB la intención de orden ANTES de realizar cualquier llamada a red.
   * Regla absoluta: 1 Intención Lógica = 1 clientOid durante toda su vida útil.
   */
  public async createOrderIntent(
    request: OrderRequest,
    signalId: string,
    cycleId: string,
    leverage: number = 10
  ): Promise<ManagedOrder> {
    // 1. Verificación en memoria
    if (this.signalMap.has(signalId)) {
      const existingClientOid = this.signalMap.get(signalId)!;
      const cached = this.memoryStore.get(existingClientOid);
      if (cached) {
        console.log(`[OrderManager] Intención recuperada de memoria para signalId ${signalId} [clientOid: ${existingClientOid}]`);
        return cached;
      }
    }

    const timestamp = request.timestamp || Date.now();
    const clientOid = request.clientOid || this.generateClientOid(request.simbolo, cycleId, timestamp);

    // 2. Verificación en DB por clientOid (para recuperar estado tras reinicio de proceso)
    let dbAvailable = true;
    try {
      const existingDbRows = await db.select().from(orders).where(eq(orders.clientOid, clientOid)).limit(1);
      if (existingDbRows && existingDbRows.length > 0) {
        const row = existingDbRows[0];
        const existingManagedOrder: ManagedOrder = {
          id: row.id,
          clientOid: row.clientOid,
          signalId,
          cycleId: row.cycleId || cycleId,
          symbol: row.symbol,
          side: row.side as 'BUY' | 'SELL',
          orderType: row.orderType as 'MARKET' | 'LIMIT',
          size: parseFloat(row.size),
          stopLoss: row.stopLoss ? parseFloat(row.stopLoss) : undefined,
          takeProfit: row.takeProfit ? parseFloat(row.takeProfit) : undefined,
          leverage: row.leverage,
          status: row.status as OrderStatus,
          retryCount: row.retryCount,
          exchangeOrderId: row.exchangeOrderId || undefined,
          createdAt: row.createdAt.getTime(),
          updatedAt: row.updatedAt.getTime()
        };
        this.memoryStore.set(clientOid, existingManagedOrder);
        this.signalMap.set(signalId, clientOid);
        console.log(`[OrderManager] Intención recuperada de DB tras reinicio [clientOid: ${clientOid}, estado: ${row.status}]`);
        return existingManagedOrder;
      }
    } catch (err: any) {
      dbAvailable = false;
      const isReal = process.env.BITGET_MODO_REAL === 'true';
      const isStrictDb = process.env.STRICT_DB_PERSISTENCE === 'true' || process.env.NODE_ENV === 'test';

      if (isReal || isStrictDb) {
        console.error(`[OrderManager] [CRITICAL DB ERROR] Fallo al consultar DB por clientOid ${clientOid} (${err.message || err}). Bloqueando ejecución.`);
        throw new Error(`[OrderManager] DB Persistence Failed: Unable to query PostgreSQL for clientOid ${clientOid}. Execution aborted for safety. (${err.message || err})`);
      } else {
        console.warn(`[OrderManager] [MODO PRUEBAS DEV] Base de datos PostgreSQL no disponible localmente. Continuando en memoria para pruebas.`);
      }
    }


    const managedOrder: ManagedOrder = {
      clientOid,
      signalId,
      cycleId,
      symbol: request.simbolo,
      side: request.lado,
      orderType: request.tipo || 'MARKET',
      size: request.tamano,
      stopLoss: request.stopLoss,
      takeProfit: request.takeProfit,
      leverage: request.leverage || leverage,
      status: 'CREATED',
      retryCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // 3. Persistir en PostgreSQL ANTES de cualquier llamada de red o entrega de intención
    if (dbAvailable) {
      try {
        await db.insert(orders).values({
          clientOid,
          symbol: managedOrder.symbol,
          side: managedOrder.side,
          orderType: managedOrder.orderType,
          size: managedOrder.size.toString(),
          stopLoss: managedOrder.stopLoss ? managedOrder.stopLoss.toString() : null,
          takeProfit: managedOrder.takeProfit ? managedOrder.takeProfit.toString() : null,
          leverage: managedOrder.leverage,
          status: 'CREATED',
          cycleId: managedOrder.cycleId,
          retryCount: 0
        }).onConflictDoNothing();
        console.log(`[OrderManager] [DB PERSISTENCE] Intención de orden registrada exitosamente en DB [clientOid: ${clientOid}]`);
      } catch (err: any) {
        const isReal = process.env.BITGET_MODO_REAL === 'true';
        const isStrictDb = process.env.STRICT_DB_PERSISTENCE === 'true' || process.env.NODE_ENV === 'test';

        if (isReal || isStrictDb) {
          console.error(`[OrderManager] [CRITICAL DB ERROR] Fallo al persistir intención de orden en DB (${err.message || err}). Bloqueando ejecución en broker.`);
          throw new Error(`[OrderManager] DB Persistence Failed: Order intention [clientOid: ${clientOid}] could not be persisted in PostgreSQL. Execution aborted for safety. (${err.message || err})`);
        } else {
          console.warn(`[OrderManager] [MODO PRUEBAS DEV] Fallo al persistir en DB. Continuando en memoria local para pruebas.`);
        }
      }
    }

    // 4. Indexar en cache de memoria
    this.memoryStore.set(clientOid, managedOrder);
    this.signalMap.set(signalId, clientOid);

    return managedOrder;
  }

  /**
   * Actualiza el estado de una orden tanto en memoria como en DB.
   * Si falla la persistencia en DB en Modo Real, propaga la excepción para garantizar integridad de estado.
   */
  public async updateOrderStatus(
    clientOid: string,
    status: OrderStatus,
    exchangeOrderId?: string,
    errorDetails?: string
  ): Promise<void> {
    const updatePayload: any = {
      status,
      updatedAt: new Date()
    };
    if (exchangeOrderId) updatePayload.exchangeOrderId = exchangeOrderId;
    if (errorDetails) updatePayload.errorDetails = errorDetails;

    try {
      await db.update(orders)
        .set(updatePayload)
        .where(eq(orders.clientOid, clientOid));
    } catch (err: any) {
      const isReal = process.env.BITGET_MODO_REAL === 'true';
      const isStrictDb = process.env.STRICT_DB_PERSISTENCE === 'true';
      if (isReal || isStrictDb) {
        console.error(`[OrderManager] Error crítico al actualizar estado de orden en DB (${err.message || err})`);
        throw new Error(`[OrderManager] DB Update Failed: Could not update order ${clientOid} status to ${status} in PostgreSQL. (${err.message || err})`);
      } else {
        console.warn(`[OrderManager] [MODO PRUEBAS DEV] Aviso al actualizar estado de orden en DB (${err.message || err}). Actualizando en memoria.`);
      }
    }

    const order = this.memoryStore.get(clientOid);
    if (order) {
      order.status = status;
      order.updatedAt = Date.now();
      if (exchangeOrderId) order.exchangeOrderId = exchangeOrderId;
      if (errorDetails) order.errorDetails = errorDetails;
    }
  }



  /**
   * Procesa el envío de una orden con idempotencia estricta, reintentos con el mismo clientOid
   * y resolución de estados UNKNOWN mediante consulta al exchange antes de re-enviar.
   */
  public async submitOrder(
    request: OrderRequest,
    signalId: string,
    cycleId: string,
    leverage: number = 10
  ): Promise<ExecutionResult> {
    // 1. Crear o recuperar la intención de orden persistida
    const order = await this.createOrderIntent(request, signalId, cycleId, leverage);

    // 2. Si la orden ya fue ejecutada (FILLED u OPEN), retornar resultado de idempotencia
    if (order.status === 'FILLED' || order.status === 'OPEN') {
      console.warn(`[OrderManager] [IDEMPOTENCIA] Orden con clientOid ${order.clientOid} ya fue completada (${order.status}). Rechazando duplicado.`);
      return order.executionResult || {
        exitoso: true,
        orderId: order.exchangeOrderId,
        clientOrderId: order.clientOid,
        mensajeRespuesta: `Despacho omitido por idempotencia: orden ya ejecutada en exchange (${order.status}).`,
        timestamp: Date.now(),
        reintentosRealizados: order.retryCount
      };
    }

    // 3. Si la orden está en estado UNKNOWN (timeout previo), consultar primero al exchange por el clientOid
    if (order.status === 'UNKNOWN' || order.status === 'SUBMITTING') {
      console.log(`[OrderManager] Orden en estado '${order.status}' detectada. Verificando estado en ${this.broker.nombreBroker} por clientOid (${order.clientOid})...`);
      const exchangeOrder = await this.broker.getOrderByClientOid(order.symbol, order.clientOid);

      if (exchangeOrder && exchangeOrder.orderId) {
        console.log(`[OrderManager] ¡Orden recuperada con éxito del exchange! ID Exchange: ${exchangeOrder.orderId}, Estado: ${exchangeOrder.state || exchangeOrder.status}`);
        const finalStatus: OrderStatus = (exchangeOrder.state === 'filled' || exchangeOrder.status === 'filled') ? 'FILLED' : 'OPEN';
        await this.updateOrderStatus(order.clientOid, finalStatus, exchangeOrder.orderId);
        
        const res: ExecutionResult = {
          exitoso: true,
          orderId: exchangeOrder.orderId,
          clientOrderId: order.clientOid,
          precioEjecutado: parseFloat(exchangeOrder.priceAvg || exchangeOrder.price || '0'),
          tamanoEjecutado: parseFloat(exchangeOrder.size || order.size.toString()),
          mensajeRespuesta: `Orden recuperada de ${this.broker.nombreBroker} sin duplicación [clientOid: ${order.clientOid}]`,
          timestamp: Date.now(),
          reintentosRealizados: order.retryCount
        };
        order.executionResult = res;
        return res;
      } else {
        console.log(`[OrderManager] La orden con clientOid ${order.clientOid} no existe en el exchange. Procediendo al envío...`);
      }
    }

    // 4. Preparar request inmutable conservando exactamente el clientOid y leverage asignados
    const requestWithClientOid: OrderRequest = {
      ...request,
      clientOid: order.clientOid,
      leverage: order.leverage
    };

    await this.updateOrderStatus(order.clientOid, 'SUBMITTING');

    try {
      console.log(`[OrderManager] Despachando a Broker con clientOid inmutable: ${order.clientOid}`);
      const result = await this.broker.executeOrder(requestWithClientOid);

      if (result.exitoso) {
        await this.updateOrderStatus(order.clientOid, 'FILLED', result.orderId);
        order.executionResult = result;
        return result;
      } else {
        await this.updateOrderStatus(order.clientOid, 'REJECTED', undefined, result.error);
        order.executionResult = result;
        return result;
      }
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      console.warn(`[OrderManager] Timeout o excepción de red al enviar orden [clientOid: ${order.clientOid}]: ${errorMsg}`);
      
      // Marcar como UNKNOWN tras falla de respuesta HTTP para forzar verificación en exchange antes de cualquier reintento
      await this.updateOrderStatus(order.clientOid, 'UNKNOWN', undefined, errorMsg);
      
      // Consultar inmediatamente al exchange por si la orden llegó a procesarse
      try {
        const checkResult = await this.broker.getOrderByClientOid(request.simbolo, order.clientOid);
        if (checkResult && checkResult.orderId) {
          console.log(`[OrderManager] Reconciliación post-timeout EXITOSA. Orden fue aceptada por el exchange [orderId: ${checkResult.orderId}]`);
          await this.updateOrderStatus(order.clientOid, 'FILLED', checkResult.orderId);
          const recoveredRes: ExecutionResult = {
            exitoso: true,
            orderId: checkResult.orderId,
            clientOrderId: order.clientOid,
            mensajeRespuesta: `Orden procesada y recuperada del exchange tras timeout de red.`,
            timestamp: Date.now(),
            reintentosRealizados: 1
          };
          order.executionResult = recoveredRes;
          return recoveredRes;
        }
      } catch (checkErr) {
        console.warn(`[OrderManager] No se pudo verificar la orden post-timeout: ${checkErr}`);
      }

      const unknownRes: ExecutionResult = {
        exitoso: false,
        clientOrderId: order.clientOid,
        mensajeRespuesta: `Orden en estado UNKNOWN tras error de red. clientOid registrado: ${order.clientOid}`,
        timestamp: Date.now(),
        error: 'ORDER_STATUS_UNKNOWN',
        reintentosRealizados: 1
      };
      order.executionResult = unknownRes;
      return unknownRes;
    }
  }

  /**
   * Reconstruye y reconcilia en el arranque las órdenes que hayan quedado en estado UNKNOWN, SUBMITTING o CREATED.
   */
  public async loadAndResolveUnresolvedOrders(): Promise<number> {
    console.log('[OrderManager] Buscando órdenes no resueltas en DB para reconciliación...');
    let resolvedCount = 0;
    try {
      const dbOrders = await db.select().from(orders);
      for (const ord of dbOrders) {
        // Cargar en memoria cache
        const managed: ManagedOrder = {
          id: ord.id,
          clientOid: ord.clientOid,
          signalId: `restored_${ord.clientOid}`,
          cycleId: ord.cycleId || 'restored',
          symbol: ord.symbol,
          side: ord.side as 'BUY' | 'SELL',
          orderType: ord.orderType as 'MARKET' | 'LIMIT',
          size: parseFloat(ord.size),
          stopLoss: ord.stopLoss ? parseFloat(ord.stopLoss) : undefined,
          takeProfit: ord.takeProfit ? parseFloat(ord.takeProfit) : undefined,
          leverage: ord.leverage,
          status: ord.status as OrderStatus,
          retryCount: ord.retryCount,
          exchangeOrderId: ord.exchangeOrderId || undefined,
          createdAt: ord.createdAt.getTime(),
          updatedAt: ord.updatedAt.getTime()
        };
        this.memoryStore.set(ord.clientOid, managed);

        if (['UNKNOWN', 'SUBMITTING', 'CREATED'].includes(ord.status)) {
          console.log(`[OrderManager] Reconciliando orden no resuelta [clientOid: ${ord.clientOid}, estado previo: ${ord.status}]...`);
          const exchangeOrder = await this.broker.getOrderByClientOid(ord.symbol, ord.clientOid);
          if (exchangeOrder && exchangeOrder.orderId) {
            const newStatus: OrderStatus = (exchangeOrder.state === 'filled' || exchangeOrder.status === 'filled') ? 'FILLED' : 'OPEN';
            await this.updateOrderStatus(ord.clientOid, newStatus, exchangeOrder.orderId);
            resolvedCount++;
            console.log(`[OrderManager] Orden ${ord.clientOid} reconciliada a ${newStatus} (Exchange ID: ${exchangeOrder.orderId})`);
          } else {
            await this.updateOrderStatus(ord.clientOid, 'FAILED', undefined, 'No encontrada en el exchange al reiniciar');
            resolvedCount++;
          }
        }
      }
    } catch (err: any) {
      console.warn(`[OrderManager] Aviso al cargar órdenes no resueltas desde DB (${err.message || err})`);
    }
    return resolvedCount;
  }

  public getOrder(clientOid: string): ManagedOrder | undefined {
    return this.memoryStore.get(clientOid);
  }
}
