/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IExchangeBroker, ExchangeId } from './types.ts';
import { BitgetBroker } from './bitget-broker.ts';
import { KrakenFuturesBroker } from './kraken-broker.ts';
import { HyperliquidBroker } from './hyperliquid-broker.ts';

/**
 * Factory centralizada para instanciación y gestión de adaptadores de exchange.
 * Permite alternar dinámicamente entre Bitget, Kraken y Hyperliquid (o mocks de test)
 * mediante inyección de dependencias o la variable de entorno ACTIVE_EXCHANGE.
 */
export class BrokerFactory {
  private static defaultBrokerInstance: IExchangeBroker | null = null;
  private static instances: Map<ExchangeId, IExchangeBroker> = new Map();

  /**
   * Retorna una instancia singleton del broker solicitado.
   */
  public static getBroker(exchange?: ExchangeId | string): IExchangeBroker {
    const targetExchange = (exchange || process.env.ACTIVE_EXCHANGE || 'bitget').toLowerCase() as ExchangeId;

    if (this.instances.has(targetExchange)) {
      return this.instances.get(targetExchange)!;
    }

    let broker: IExchangeBroker;

    switch (targetExchange) {
      case 'bitget':
        broker = new BitgetBroker();
        break;
      case 'kraken':
        broker = new KrakenFuturesBroker();
        break;
      case 'hyperliquid':
        broker = new HyperliquidBroker();
        break;
      default:
        console.warn(`[BrokerFactory] Exchange desconocido '${targetExchange}'. Usando Bitget como fallback.`);
        broker = new BitgetBroker();
        break;
    }

    this.instances.set(targetExchange, broker);
    return broker;
  }

  /**
   * Retorna el broker por defecto configurado para el sistema.
   */
  public static getDefaultBroker(): IExchangeBroker {
    if (!this.defaultBrokerInstance) {
      this.defaultBrokerInstance = this.getBroker();
    }
    return this.defaultBrokerInstance;
  }

  /**
   * Permite registrar o inyectar un broker específico (útil para pruebas unitarias con mocks).
   */
  public static registerBroker(exchange: ExchangeId, broker: IExchangeBroker): void {
    this.instances.set(exchange, broker);
    if (!this.defaultBrokerInstance || process.env.ACTIVE_EXCHANGE === exchange) {
      this.defaultBrokerInstance = broker;
    }
  }

  /**
   * Limpia las instancias cacheadas.
   */
  public static reset(): void {
    this.instances.clear();
    this.defaultBrokerInstance = null;
  }
}
