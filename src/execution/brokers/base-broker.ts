/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrderRequest, ExecutionResult } from '../types.ts';
import { IExchangeBroker, ExchangeId, PositionInfo, TickerInfo, OrderQueryInfo } from './types.ts';

/**
 * Clase abstracta inmutable y fuertemente tipada BaseBroker.
 * 
 * Implementa el contrato IExchangeBroker y sirve como columna vertebral
 * para los adaptadores de corretaje (Bitget, Kraken, Simulador).
 * 
 * Incluye lógica institucional de reintentos con Full Jitter y Backoff Exponencial
 * para tolerar micro-desconexiones, ráfagas de red y límites de tasa (rate limits).
 */
export abstract class BaseBroker implements IExchangeBroker {
  public abstract readonly exchangeId: ExchangeId;
  public abstract readonly nombreBroker: string;

  public abstract isConfigured(): boolean;
  public abstract executeOrder(request: OrderRequest): Promise<ExecutionResult>;
  public abstract getBalance(asset: string): Promise<number>;
  public abstract getPosition(symbol: string): Promise<PositionInfo | null>;
  public abstract closePosition(symbol: string): Promise<ExecutionResult>;
  public abstract getOrderByClientOid(symbol: string, clientOid: string): Promise<OrderQueryInfo | null>;
  public abstract setLeverage(symbol: string, leverage: number, holdSide?: 'long' | 'short'): Promise<boolean>;
  public abstract getMarketPrice(symbol: string): Promise<number>;
  public abstract getTicker(symbol: string): Promise<TickerInfo | null>;

  /**
   * Envuelve cualquier llamada asíncrona propensa a fallos de red en un bucle de reintento con
   * Backoff Exponencial y Jitter para evitar saturación de servidores en entornos de alta frecuencia.
   * 
   * @param operacion Función asíncrona a ejecutar.
   * @param reintentosMaximos Cantidad de intentos permitidos antes de desistir (por defecto: 4).
   * @param retrasoBaseMs Tiempo de espera inicial en milisegundos (por defecto: 500ms).
   */
  protected async runWithExponentialBackoff<T>(
    operacion: () => Promise<T>,
    reintentosMaximos: number = 4,
    retrasoBaseMs: number = 500
  ): Promise<{ exito: boolean; resultado?: T; intentos: number; error?: Error }> {
    let intentoActual = 0;

    while (intentoActual < reintentosMaximos) {
      try {
        intentoActual++;
        const resultado = await operacion();
        return {
          exito: true,
          resultado,
          intentos: intentoActual
        };
      } catch (error: any) {
        console.warn(
          `[${this.nombreBroker}] Intento ${intentoActual}/${reintentosMaximos} fallido. Razón: ${error?.message || error}`
        );

        if (intentoActual >= reintentosMaximos) {
          return {
            exito: false,
            intentos: intentoActual,
            error: error instanceof Error ? error : new Error(String(error))
          };
        }

        // Cálculo de Backoff Exponencial: retraso = base * 2^(intento - 1)
        const retrasoExponencial = retrasoBaseMs * Math.pow(2, intentoActual - 1);
        
        // Aplicación de Jitter aleatorio (Full Jitter) para dispersar ráfagas
        const jitter = Math.random() * retrasoExponencial;
        const retrasoFinal = Math.min(10000, retrasoExponencial + jitter); // Tope máximo de 10 segundos

        console.log(`[${this.nombreBroker}] Aplicando retraso con Backoff y Jitter de ${Math.round(retrasoFinal)}ms antes de reintentar...`);
        await this.esperar(retrasoFinal);
      }
    }

    return {
      exito: false,
      intentos: intentoActual,
      error: new Error('Bucle de reintentos finalizado sin éxito por una causa desconocida.')
    };
  }

  /**
   * Utilidad de retraso asíncrono basada en promesas.
   */
  protected esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
