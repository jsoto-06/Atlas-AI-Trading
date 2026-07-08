/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export interface OrderRequest {
  simbolo: string;
  temporalidad: string;
  lado: OrderSide;
  tipo: OrderType;
  precioLimite?: number; // Requerido si es tipo LIMIT
  tamano: number; // Cantidad de unidades o volumen en USD
  stopLoss?: number; // Nivel de salida por pérdidas
  takeProfit?: number; // Nivel de salida por beneficios
  timestamp: number;
}

export interface ExecutionResult {
  exitoso: boolean;
  orderId?: string;
  clientOrderId?: string;
  precioEjecutado?: number;
  tamanoEjecutado?: number;
  comisionUSD?: number;
  mensajeRespuesta: string;
  timestamp: number;
  error?: string;
  reintentosRealizados: number;
}
