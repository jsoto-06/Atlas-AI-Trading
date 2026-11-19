/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { BaseBroker } from './base-broker.ts';
import { OrderRequest, ExecutionResult } from '../types.ts';
import { ExchangeId, PositionInfo, TickerInfo, OrderQueryInfo } from './types.ts';
import { mapKrakenSymbol, getKrakenBaseUrl, getKrakenPublicMarketUrl, formatKrakenContracts } from './kraken-utils.ts';

interface SimulatedPosition {
  symbol: string;
  size: number;
  entryPrice: number;
  side: 'long' | 'short';
  timestamp: number;
}

/**
 * Adaptador de Corretaje Oficial para Kraken Futures (KrakenFuturesBroker).
 * 
 * Implementa la interfaz BaseBroker interactuando con la API REST v3 de Kraken Futures.
 * Soporta dos modos:
 * 1. MODO REAL / LIVE: Conexión firmada con HMAC-SHA512 a `https://futures.kraken.com/derivatives/api/v3`.
 * 2. MODO DEMO / SANDBOX: Conexión a `https://demo-futures.kraken.com/derivatives/api/v3`.
 *    - Si se configuran claves de demo, opera contra el sandbox real de Kraken.
 *    - Si no hay claves configuradas, activa simulación en memoria con precios de mercado en vivo
 *      (Fail-Safe / Zero-Friction Paper Trading).
 */
export class KrakenFuturesBroker extends BaseBroker {
  public readonly exchangeId: ExchangeId = 'kraken';
  public readonly nombreBroker: string = 'Kraken Futures';

  // Memoria de simulación local cuando se opera en Demo sin claves
  private simBalance: number = 0;
  private simPositions: Map<string, SimulatedPosition> = new Map();
  private simOrders: Map<string, any> = new Map();

  /**
   * Valida si las credenciales de API de Kraken están presentes en el entorno.
   */
  public isConfigured(): boolean {
    return !!(process.env.KRAKEN_API_KEY && process.env.KRAKEN_API_SECRET);
  }

  /**
   * Determina si se está operando en entorno Real o Demo/Sandbox.
   */
  private isReal(): boolean {
    return process.env.KRAKEN_MODO_REAL === 'true';
  }

  /**
   * Retorna la URL base correspondiente (Real vs Demo).
   */
  private getBaseUrl(): string {
    return getKrakenBaseUrl(this.isReal());
  }

  /**
   * Genera las cabeceras de autenticación oficiales de Kraken Futures API v3:
   * 1. Message = postData + nonce + endpointPath
   * 2. SHA256 digest del mensaje
   * 3. HMAC-SHA512 firmado con el API Secret decodificado de Base64
   */
  private getAuthHeaders(endpointPath: string, postDataStr: string = ''): Record<string, string> {
    const apiKey = process.env.KRAKEN_API_KEY;
    const apiSecret = process.env.KRAKEN_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error(`[KrakenFuturesBroker] Faltan credenciales KRAKEN_API_KEY o KRAKEN_API_SECRET en el entorno.`);
    }

    const nonce = Date.now().toString();

    // Normalizar la ruta del endpoint para la firma de Kraken Futures:
    // Kraken exige que la ruta firmada sea /api/v3/... (retirando el prefijo /derivatives si existiera)
    let signPath = endpointPath;
    if (signPath.startsWith('/derivatives')) {
      signPath = signPath.substring('/derivatives'.length);
    }
    if (!signPath.startsWith('/api/v3')) {
      signPath = `/api/v3${signPath.startsWith('/') ? '' : '/'}${signPath}`;
    }

    const message = postDataStr + nonce + signPath;

    // 1. Hash binario SHA-256
    const sha256Hash = crypto.createHash('sha256').update(message).digest();

    // 2. Decodificar la clave secreta de Base64 a binario
    const secretBuffer = Buffer.from(apiSecret, 'base64');

    // 3. Firma HMAC-SHA512 y codificación final en Base64
    const signature = crypto.createHmac('sha512', secretBuffer).update(sha256Hash).digest('base64');

    return {
      'APIKey': apiKey,
      'Authent': signature,
      'Nonce': nonce,
      'User-Agent': 'Atlas-AI-Trading/2.1',
      'Content-Type': 'application/x-www-form-urlencoded'
    };
  }

  /**
   * Realiza una solicitud HTTP autenticada a Kraken Futures API v3.
   */
  private async sendSignedRequest(
    method: 'GET' | 'POST',
    endpointPath: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    const isGet = method === 'GET';
    const formParams = new URLSearchParams();

    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        formParams.append(k, String(v));
      }
    }

    const postDataStr = formParams.toString();
    const headers = this.getAuthHeaders(endpointPath, postDataStr);

    let url = `${this.getBaseUrl()}${endpointPath}`;
    const fetchOptions: RequestInit = {
      method,
      headers
    };

    if (isGet) {
      if (postDataStr) {
        url += `?${postDataStr}`;
      }
    } else {
      fetchOptions.body = postDataStr;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Kraken Futures HTTP Error [${response.status}]: ${errText}`);
    }

    const json = await response.json();
    if (json.result && json.result !== 'success') {
      throw new Error(`Kraken Futures API Error: ${json.error || JSON.stringify(json)}`);
    }

    return json;
  }

  /**
   * Obtiene el precio más reciente de mercado de forma pública (Fail-Closed).
   */
  public async getMarketPrice(symbol: string): Promise<number> {
    const krakenSym = mapKrakenSymbol(symbol);
    const url = `${getKrakenPublicMarketUrl()}/tickers`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.tickers && Array.isArray(json.tickers)) {
        const found = json.tickers.find((t: any) => t.symbol?.toUpperCase() === krakenSym.toUpperCase());
        if (found) {
          const price = parseFloat(found.last || found.markPrice);
          if (!isNaN(price) && price > 0) {
            return price;
          }
        }
      }
      throw new Error(`Símbolo ${krakenSym} no encontrado en la respuesta de tickers.`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw new Error(`[FAIL CLOSED] No fue posible obtener el precio de mercado real para ${symbol} (${krakenSym}) en Kraken Futures: ${err.message}`);
    }
  }

  /**
   * Obtiene estadísticas de Ticker en tiempo real para un símbolo.
   */
  public async getTicker(symbol: string): Promise<TickerInfo | null> {
    try {
      const krakenSym = mapKrakenSymbol(symbol);
      const url = `${getKrakenPublicMarketUrl()}/tickers`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const json = await res.json();
      if (json.tickers && Array.isArray(json.tickers)) {
        const t = json.tickers.find((item: any) => item.symbol?.toUpperCase() === krakenSym.toUpperCase());
        if (t) {
          return {
            symbol,
            price: parseFloat(t.last || t.markPrice || '0'),
            volume24h: parseFloat(t.vol24h || t.volume || '0'),
            high24h: parseFloat(t.high24h || t.last || '0'),
            low24h: parseFloat(t.low24h || t.last || '0'),
            timestamp: Date.now()
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Ejecuta una orden en Kraken Futures (Mercado o Límite).
   */
  public async executeOrder(request: OrderRequest): Promise<ExecutionResult> {
    const isReal = this.isReal();
    const configured = this.isConfigured();
    const mappedSymbol = mapKrakenSymbol(request.simbolo);
    const leverageToUse = request.leverage || 10;

    console.log(
      `[KrakenFuturesBroker] Preparando orden en Kraken Futures (${isReal ? 'REAL' : (configured ? 'SANDBOX' : 'SIMULACIÓN LOCAL')}) para ${mappedSymbol} (${request.lado}) [${leverageToUse}x]...`
    );

    const clientOrderId = request.clientOid || `kraken_${mappedSymbol.toLowerCase()}_${Date.now()}`;

    const transaccion = async (): Promise<ExecutionResult> => {
      // 1. Obtener precio de mercado para cotización y conversión de contratos
      const currentPrice = await this.getMarketPrice(request.simbolo);
      const contractCount = formatKrakenContracts(request.simbolo, request.tamano, currentPrice);

      // A) SI HAY CLAVES CONFIGURADAS: Enviar a la API v3 de Kraken Futures
      if (configured) {
        const endpoint = '/sendorder';
        const payload: Record<string, any> = {
          orderType: request.tipo.toLowerCase() === 'market' ? 'mkt' : 'lmt',
          symbol: mappedSymbol,
          side: request.lado.toLowerCase(),
          size: contractCount,
          cliOrdId: clientOrderId.substring(0, 100) // límite de longitud seguro
        };

        if (request.tipo.toLowerCase() === 'limit' && request.precioLimite) {
          payload.limitPrice = request.precioLimite;
        }

        if (request.stopLoss) {
          payload.stopPrice = request.stopLoss;
        }

        console.log(`[KrakenFuturesBroker] [POST ${endpoint}] Despachando a API Kraken:`, JSON.stringify(payload));
        const res = await this.sendSignedRequest('POST', endpoint, payload);

        const sendStatus = res.sendStatus || {};
        const orderId = sendStatus.order_id || `kraken_ord_${clientOrderId}`;
        const priceExecuted = parseFloat(sendStatus.price || currentPrice.toString());
        const sizeExecuted = parseFloat(sendStatus.size || contractCount.toString());
        const comisionUSD = Number((sizeExecuted * priceExecuted * 0.0005).toFixed(4)); // Kraken Futures taker fee ~0.05%

        return {
          exitoso: true,
          orderId,
          clientOrderId,
          precioEjecutado: priceExecuted,
          tamanoEjecutado: sizeExecuted,
          comisionUSD,
          mensajeRespuesta: `Orden en Kraken Futures (${isReal ? 'REAL' : 'SANDBOX'}) colocada exitosamente. ID: ${orderId}, Símbolo: ${mappedSymbol}, Tamaño: ${sizeExecuted} contratos.`,
          timestamp: Date.now(),
          reintentosRealizados: 0
        };
      }

      // B) MODO DEMO / SIMULACIÓN LOCAL CON PRECIOS EN VIVO (Sin claves)
      console.log(`[KrakenFuturesBroker] [DEMO SIMULATION] Ejecutando orden simulada con precio en vivo de Kraken: $${currentPrice.toLocaleString()} USD`);
      
      const orderId = `sim_kraken_${Date.now()}`;
      const comisionUSD = Number((contractCount * 0.0005).toFixed(4));

      // Actualizar posición en memoria para consistencia de estado
      const posSide = request.lado === 'BUY' ? 'long' : 'short';
      this.simPositions.set(mappedSymbol, {
        symbol: mappedSymbol,
        size: contractCount,
        entryPrice: currentPrice,
        side: posSide,
        timestamp: Date.now()
      });

      this.simOrders.set(clientOrderId, {
        orderId,
        cliOrdId: clientOrderId,
        symbol: mappedSymbol,
        status: 'filled',
        priceAvg: currentPrice.toString(),
        size: contractCount.toString()
      });

      return {
        exitoso: true,
        orderId,
        clientOrderId,
        precioEjecutado: currentPrice,
        tamanoEjecutado: contractCount,
        comisionUSD,
        mensajeRespuesta: `[DEMO MOCK] Orden simulada de Kraken Futures ejecutada a $${currentPrice.toLocaleString()} USD. Contratos: ${contractCount}.`,
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    };

    const resultado = await this.runWithExponentialBackoff(transaccion);

    if (resultado.exito && resultado.resultado) {
      return {
        ...resultado.resultado,
        reintentosRealizados: resultado.intentos - 1
      };
    } else {
      const errorMsg = resultado.error?.message || 'Error de API o red de Kraken Futures';
      console.error(`[KrakenFuturesBroker] Falla crítica tras reintentos: ${errorMsg}`);
      return {
        exitoso: false,
        mensajeRespuesta: `No se pudo ejecutar la orden en Kraken Futures: ${errorMsg}`,
        timestamp: Date.now(),
        error: errorMsg,
        reintentosRealizados: resultado.intentos - 1
      };
    }
  }

  /**
   * Consulta el balance disponible en el monedero de futuros de Kraken.
   */
  public async getBalance(asset: string = 'USDT'): Promise<number> {
    if (!this.isConfigured()) {
      // Modo Zero-Friction Paper Trading sin claves: Retorna $10,000 USD virtuales de margen
      return 10000;
    }

    try {
      console.log(`[KrakenFuturesBroker] [GET /accounts] Solicitando balance de margen en Kraken Futures...`);
      const res = await this.sendSignedRequest('GET', '/accounts');

      if (res.accounts) {
        // Kraken Futures Flex Multi-Collateral o Cash Account
        const flex = res.accounts.flex;
        if (flex && flex.availableMargin !== undefined) {
          const avail = parseFloat(flex.availableMargin);
          if (!isNaN(avail)) {
            console.log(`[KrakenFuturesBroker] Balance disponible Flex Margin: $${avail.toFixed(2)} USD`);
            return avail;
          }
        }

        const cash = res.accounts.cash;
        if (cash && cash.balances) {
          const targetKey = asset.toLowerCase();
          const targetBal = parseFloat(cash.balances[targetKey] || cash.balances['usd'] || '0');
          if (!isNaN(targetBal)) {
            return targetBal;
          }
        }
      }
      return 0;
    } catch (err: any) {
      console.warn(`[KrakenFuturesBroker] Aviso al consultar balance: ${err.message}. Retornando 0 como salvaguarda.`);
      return 0;
    }
  }

  /**
   * Consulta posiciones activas en Kraken Futures.
   */
  public async getPosition(symbol: string): Promise<PositionInfo | null> {
    const mappedSymbol = mapKrakenSymbol(symbol);

    if (!this.isConfigured()) {
      const simPos = this.simPositions.get(mappedSymbol);
      if (simPos && simPos.size > 0) {
        return {
          size: simPos.size,
          entryPrice: simPos.entryPrice,
          unrealizedPnl: 0,
          holdSide: simPos.side,
          rawSymbol: mappedSymbol
        };
      }
      return null;
    }

    try {
      console.log(`[KrakenFuturesBroker] [GET /openpositions] Consultando posiciones abiertas para ${mappedSymbol}...`);
      const res = await this.sendSignedRequest('GET', '/openpositions');

      if (res.openPositions && Array.isArray(res.openPositions)) {
        const pos = res.openPositions.find((p: any) => p.symbol?.toUpperCase() === mappedSymbol.toUpperCase());
        if (pos) {
          const size = parseFloat(pos.size || '0');
          const entryPrice = parseFloat(pos.price || '0');
          const unrealizedPnl = parseFloat(pos.unrealizedPnl || '0');
          const holdSide = (pos.side || '').toLowerCase() === 'short' ? 'short' : 'long';

          return {
            size,
            entryPrice,
            unrealizedPnl,
            holdSide,
            rawSymbol: pos.symbol
          };
        }
      }
      return null;
    } catch (err: any) {
      console.warn(`[KrakenFuturesBroker] Error al consultar posición activa para ${symbol}: ${err.message}`);
      return null;
    }
  }

  /**
   * Cierra de forma inmediata cualquier posición abierta para un símbolo en Kraken Futures.
   */
  public async closePosition(symbol: string): Promise<ExecutionResult> {
    const mappedSymbol = mapKrakenSymbol(symbol);

    if (!this.isConfigured()) {
      this.simPositions.delete(mappedSymbol);
      return {
        exitoso: true,
        orderId: `sim_close_${Date.now()}`,
        mensajeRespuesta: `[DEMO MOCK] Posición cerrada en simulación local para ${mappedSymbol}.`,
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    }

    try {
      const pos = await this.getPosition(symbol);
      if (!pos || pos.size === 0) {
        return {
          exitoso: true,
          mensajeRespuesta: `Sin posición abierta que cerrar en ${mappedSymbol}.`,
          timestamp: Date.now(),
          reintentosRealizados: 0
        };
      }

      // Enviar orden contraria de mercado con flag reduceOnly para cerrar
      const oppositeSide = pos.holdSide === 'long' ? 'sell' : 'buy';
      const endpoint = '/sendorder';
      const payload = {
        orderType: 'mkt',
        symbol: mappedSymbol,
        side: oppositeSide,
        size: Math.abs(pos.size),
        reduceOnly: true
      };

      console.log(`[KrakenFuturesBroker] Cerrando posición con orden de reducción:`, payload);
      const res = await this.sendSignedRequest('POST', endpoint, payload);

      return {
        exitoso: true,
        orderId: res.sendStatus?.order_id || `close_${Date.now()}`,
        mensajeRespuesta: `Posición en ${mappedSymbol} cerrada exitosamente en Kraken Futures.`,
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    } catch (err: any) {
      return {
        exitoso: false,
        mensajeRespuesta: `Error al cerrar posición en Kraken Futures: ${err.message}`,
        timestamp: Date.now(),
        error: err.message,
        reintentosRealizados: 0
      };
    }
  }

  /**
   * Consulta una orden por su clientOid idempotente.
   */
  public async getOrderByClientOid(symbol: string, clientOid: string): Promise<OrderQueryInfo | null> {
    if (!this.isConfigured()) {
      return this.simOrders.get(clientOid) || null;
    }

    try {
      console.log(`[KrakenFuturesBroker] Consultando estado de orden por cliOrdId (${clientOid})...`);
      const res = await this.sendSignedRequest('GET', '/orders/status', { cliOrdId: clientOid });

      if (res.order) {
        return {
          orderId: res.order.orderId,
          clientOid: res.order.cliOrdId,
          symbol: res.order.symbol,
          state: res.order.status,
          status: res.order.status,
          price: res.order.price?.toString(),
          priceAvg: res.order.avgPrice?.toString() || res.order.price?.toString(),
          size: res.order.size?.toString()
        };
      }
      return null;
    } catch (err: any) {
      console.warn(`[KrakenFuturesBroker] Orden con cliOrdId (${clientOid}) no encontrada: ${err.message}`);
      return null;
    }
  }

  /**
   * Ajusta las preferencias de apalancamiento objetivo para un símbolo en Kraken Futures.
   */
  public async setLeverage(symbol: string, leverage: number, _holdSide?: 'long' | 'short'): Promise<boolean> {
    if (!this.isConfigured()) {
      return true; // En simulación local se asume exitoso
    }

    try {
      const mappedSymbol = mapKrakenSymbol(symbol);
      console.log(`[KrakenFuturesBroker] Configurando apalancamiento a ${leverage}x para ${mappedSymbol}...`);
      await this.sendSignedRequest('POST', '/leveragepreferences', {
        symbol: mappedSymbol,
        maxLeverage: leverage
      });
      return true;
    } catch (err: any) {
      console.warn(`[KrakenFuturesBroker] Aviso al ajustar apalancamiento a ${leverage}x: ${err.message}`);
      return false;
    }
  }
}
