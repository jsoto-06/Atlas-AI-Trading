/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrderRequest, ExecutionResult } from '../execution/types.ts';
import { IExchangeBroker } from '../execution/brokers/types.ts';
import { BrokerFactory } from '../execution/brokers/broker-factory.ts';

export interface IExecutionProvider {
  executeOrder(request: OrderRequest): Promise<ExecutionResult>;
  getBalance(asset: string): Promise<number>;
  getPosition(symbol: string): Promise<{ size: number; entryPrice: number; unrealizedPnl: number } | null>;
  closePosition(symbol: string): Promise<ExecutionResult>;
}

export class LiveExecutionProvider implements IExecutionProvider {
  private broker: IExchangeBroker;

  constructor(broker?: IExchangeBroker) {
    this.broker = broker || BrokerFactory.getDefaultBroker();
  }

  public async executeOrder(request: OrderRequest): Promise<ExecutionResult> {
    return this.broker.executeOrder(request);
  }

  public async getBalance(asset: string): Promise<number> {
    return this.broker.getBalance(asset);
  }

  public async getPosition(symbol: string): Promise<{ size: number; entryPrice: number; unrealizedPnl: number } | null> {
    return this.broker.getPosition(symbol);
  }

  public async closePosition(symbol: string): Promise<ExecutionResult> {
    return this.broker.closePosition(symbol);
  }
}

// Retrocompatibilidad
export const BitgetExecutionProvider = LiveExecutionProvider;

export class SimulatedExecutionProvider implements IExecutionProvider {
  private balance: number;
  private feeRate: number;
  private slippageRate: number;

  constructor(initialBalance: number = 10000, feeRate: number = 0.0006, slippageRate: number = 0.0005) {
    this.balance = initialBalance;
    this.feeRate = feeRate;
    this.slippageRate = slippageRate;
  }

  public async executeOrder(request: OrderRequest): Promise<ExecutionResult> {
    const slippageMult = request.lado === 'BUY' ? (1 + this.slippageRate) : (1 - this.slippageRate);
    const executedPrice = (request.precioLimite || 0) * slippageMult;
    const sizeExecuted = request.tamano;
    const comisionUSD = sizeExecuted * executedPrice * this.feeRate;
    const orderId = `sim_ord_${Date.now()}`;

    return {
      exitoso: true,
      orderId,
      clientOrderId: request.clientOid,
      precioEjecutado: executedPrice,
      tamanoEjecutado: sizeExecuted,
      comisionUSD,
      mensajeRespuesta: `[SimulatedExecution] Orden ejecutada en simulación.`,
      timestamp: Date.now(),
      reintentosRealizados: 0
    };
  }

  public async getBalance(asset: string): Promise<number> {
    return this.balance;
  }

  public async getPosition(symbol: string): Promise<{ size: number; entryPrice: number; unrealizedPnl: number } | null> {
    return null;
  }

  public async closePosition(symbol: string): Promise<ExecutionResult> {
    return {
      exitoso: true,
      orderId: `sim_close_${Date.now()}`,
      mensajeRespuesta: '[SimulatedExecution] Posición cerrada.',
      timestamp: Date.now(),
      reintentosRealizados: 0
    };
  }
}

export class MockExecutionProvider implements IExecutionProvider {
  public async executeOrder(request: OrderRequest): Promise<ExecutionResult> {
    return {
      exitoso: true,
      orderId: `mock_ord_${Date.now()}`,
      clientOrderId: request.clientOid,
      precioEjecutado: request.precioLimite || 50000,
      tamanoEjecutado: request.tamano,
      comisionUSD: 0,
      mensajeRespuesta: '[MockExecution] Orden mock ejecutada.',
      timestamp: Date.now(),
      reintentosRealizados: 0
    };
  }

  public async getBalance(asset: string): Promise<number> {
    return 100000;
  }

  public async getPosition(symbol: string): Promise<{ size: number; entryPrice: number; unrealizedPnl: number } | null> {
    return null;
  }

  public async closePosition(symbol: string): Promise<ExecutionResult> {
    return {
      exitoso: true,
      orderId: `mock_close_${Date.now()}`,
      mensajeRespuesta: '[MockExecution] Posición mock cerrada.',
      timestamp: Date.now(),
      reintentosRealizados: 0
    };
  }
}
