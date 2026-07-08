/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { OrderRequest, ExecutionResult } from '../types.ts';

/**
 * Clase abstracta inmutable y fuertemente tipada BaseBroker.
 * 
 * Sirve como el contrato base y la columna vertebral para todos los adaptadores
 * de corretaje (brokers/exchanges como Bitget, Binance, o simuladores institucionales).
 * 
 * Implementa una lógica genérica y robusta de reintentos con Backoff Exponencial
 * y Jitter (dispersión aleatoria) para mitigar fallas temporales de red, límites de tasa (rate limiting)
 * y latencia transaccional extrema.
 */
export abstract class BaseBroker {
  public abstract readonly nombreBroker: string;

  /**
   * Ejecuta una orden de compra o venta de forma asíncrona en el exchange.
   * Debe ser implementado por cada broker específico (e.g., BitgetBroker, MockBroker).
   */
  public abstract executeOrder(request: OrderRequest): Promise<ExecutionResult>;

  /**
   * Consulta el balance disponible en la cuenta del broker para un activo o colateral específico.
   */
  public abstract getBalance(asset: string): Promise<number>;

  /**
   * Consulta el estado actual de una posición abierta en el exchange para un símbolo determinado.
   */
  public abstract getPosition(symbol: string): Promise<{ size: number; entryPrice: number; unrealizedPnl: number } | null>;

  /**
   * Cierra de forma inmediata cualquier posición abierta para un símbolo específico.
   */
  public abstract closePosition(symbol: string): Promise<ExecutionResult>;

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
        
        // Aplicación de Jitter aleatorio (fórmula institucional de Full Jitter) para dispersar ráfagas
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
  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
