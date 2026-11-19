/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrderRequest, ExecutionResult } from '../types.ts';

export type ExchangeId = 'bitget' | 'kraken' | 'hyperliquid' | 'mock';

export interface PositionInfo {
  size: number;
  entryPrice: number;
  unrealizedPnl: number;
  holdSide?: string;
  rawSymbol?: string;
  marginCoin?: string;
}

export interface TickerInfo {
  symbol: string;
  price: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface OrderQueryInfo {
  orderId?: string;
  clientOid?: string;
  symbol?: string;
  state?: string;
  status?: string;
  price?: string;
  priceAvg?: string;
  size?: string;
  [key: string]: any;
}

export interface InstrumentSpec {
  symbol: string;
  minOrderSize: number;
  stepSize: number;
  minNotional: number;
  tickSize: number;
  maxLeverage: number;
}

/**
 * Contrato unificado e independiente para adaptadores de corretaje de futuros.
 * Desacopla la capa de ejecución (OrderRouter, OrderManager, RiskManager)
 * de las peculiaridades de cada exchange (Bitget, Kraken, etc.).
 */
export interface IExchangeBroker {
  readonly exchangeId: ExchangeId;
  readonly nombreBroker: string;

  /**
   * Verifica si las credenciales de API requeridas están presentes en el entorno.
   */
  isConfigured(): boolean;

  /**
   * Ejecuta una orden de futuros en el exchange (Market o Limit).
   */
  executeOrder(request: OrderRequest): Promise<ExecutionResult>;

  /**
   * Consulta el balance disponible para un activo de margen (ej. USDT, USD).
   */
  getBalance(asset: string): Promise<number>;

  /**
   * Consulta la posición activa actual para un símbolo.
   */
  getPosition(symbol: string): Promise<PositionInfo | null>;

  /**
   * Cierra de forma inmediata cualquier posición abierta para un símbolo.
   */
  closePosition(symbol: string): Promise<ExecutionResult>;

  /**
   * Consulta el estado de una orden en el exchange mediante clientOid idempotente.
   */
  getOrderByClientOid(symbol: string, clientOid: string): Promise<OrderQueryInfo | null>;

  /**
   * Ajusta el apalancamiento objetivo para el símbolo en el exchange.
   */
  setLeverage(symbol: string, leverage: number, holdSide?: 'long' | 'short'): Promise<boolean>;

  /**
   * Consulta el precio de mercado actual.
   */
  getMarketPrice(symbol: string): Promise<number>;

  /**
   * Consulta las estadísticas de ticker en tiempo real.
   */
  getTicker(symbol: string): Promise<TickerInfo | null>;
}
