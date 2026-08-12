/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { BaseBroker } from './base-broker.ts';
import { OrderRequest, ExecutionResult } from '../types.ts';
import { mapSymbol, getProductType } from './bitget-utils.ts';

/**
 * Adaptador de Corretaje Oficial para Bitget (BitgetBroker).
 * 
 * Implementa la interfaz BaseBroker interactuando con los endpoints REST reales de Bitget.
 * Diseñado especialmente para la Demo/Paper Trading de Bitget (SUSDT-FUTURES) usando
 * firmas criptográficas seguras, reintentos con backoff exponencial y recuperación de precios reales.
 */
export class BitgetBroker extends BaseBroker {
  public readonly nombreBroker: string = 'Bitget';

  // Objeto de configuración de API enmascarado
  private configApi: { apiKey?: string; apiSecret?: string; passphrase?: string } | null = null;

  /**
   * Inicialización perezosa de credenciales de Bitget directamente desde el entorno
   * para permitir actualizaciones seguras en caliente sin necesidad de reiniciar.
   */
  private inicializarCredenciales(): { apiKey: string; apiSecret: string; passphrase: string } {
    const apiKey = process.env.BITGET_API_KEY;
    const apiSecret = process.env.BITGET_API_SECRET;
    const passphrase = process.env.BITGET_PASSPHRASE;

    if (!apiKey || !apiSecret || !passphrase) {
      throw new Error(
        `[BitgetBroker] Error de Configuración: Faltan credenciales de Bitget (BITGET_API_KEY, BITGET_API_SECRET, BITGET_PASSPHRASE) en el entorno.`
      );
    }

    return {
      apiKey,
      apiSecret,
      passphrase
    };
  }

  /**
   * Traduce un símbolo común como "BTC/USDT" al formato adecuado de Bitget (SBTCSUSDT para Demo o BTCUSDT para Real).
   */
  private mapSymbol(symbol: string): string {
    return mapSymbol(symbol);
  }

  /**
   * Retorna el tipo de producto adecuado según el entorno operativo (Real vs Demo).
   */
  private getProductType(): string {
    return getProductType();
  }

  /**
   * Realiza una solicitud REST HTTP firmada a la API de Bitget v2.
   */
  private async sendRequest(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string> = {},
    body?: any
  ): Promise<any> {
    const credenciales = this.inicializarCredenciales();
    const timestamp = Date.now().toString();

    let queryString = '';
    if (method === 'GET' && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        searchParams.append(k, v);
      }
      queryString = '?' + searchParams.toString();
    }

    const bodyStr = body ? JSON.stringify(body) : '';
    
    // String pre-firmado: timestamp + METHOD + path + queryString + body
    const prehashStr = timestamp + method + path + queryString + bodyStr;

    // Generar firma HMAC-SHA256 codificada en Base64
    const hmac = crypto.createHmac('sha256', credenciales.apiSecret);
    const signature = hmac.update(prehashStr).digest('base64');

    const headers: Record<string, string> = {
      'ACCESS-KEY': credenciales.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': credenciales.passphrase,
      'Content-Type': 'application/json',
      'locale': 'en-US'
    };

    const url = `https://api.bitget.com${path}${queryString}`;

    const fetchOptions: RequestInit = {
      method,
      headers
    };

    if (method === 'POST' && body) {
      fetchOptions.body = bodyStr;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Falla HTTP de Bitget [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    if (data.code !== '00000') {
      throw new Error(`Bitget API Error [Code ${data.code}]: ${data.msg}`);
    }

    return data.data;
  }

  /**
   * Obtiene de forma pública el precio de mercado más reciente de un contrato de futuros de Bitget.
   * FIX C04: Elimina fallbacks hardcodeados (BTC=68000). Si la API no responde, opera en FAIL CLOSED -> Lanza excepción.
   */
  public async getMarketPrice(symbol: string): Promise<number> {
    const mappedSymbol = this.mapSymbol(symbol);
    const productType = this.getProductType();
    const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${mappedSymbol}&productType=${productType}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        if (data.code === '00000' && data.data && data.data.length > 0) {
          const lastPrice = parseFloat(data.data[0].lastPr);
          if (!isNaN(lastPrice) && lastPrice > 0) {
            return lastPrice;
          }
        }
      }
      throw new Error(`Respuesta inválida del servidor Bitget (HTTP ${response.status})`);
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw new Error(`[FAIL CLOSED] No fue posible obtener el precio de mercado real para ${symbol} en Bitget: ${e.message}`);
    }
  }

  /**
   * Ejecuta una orden en la plataforma de derivados de Bitget (Demo o Real).
   */
  public async executeOrder(request: OrderRequest): Promise<ExecutionResult> {
    const isReal = process.env.BITGET_MODO_REAL === 'true';
    const mappedSymbol = this.mapSymbol(request.simbolo);
    const leverageToUse = request.leverage || 10;
    console.log(`[BitgetBroker] Preparando orden en Bitget ${isReal ? 'Real' : 'Demo'} para ${mappedSymbol} (${request.lado}) con apalancamiento ${leverageToUse}x...`);

    // Sincronizar apalancamiento explícitamente en el exchange antes de emitir la orden
    await this.setLeverage(request.simbolo, leverageToUse, request.lado === 'BUY' ? 'long' : 'short');

    // Usar clientOid determinista inmutable provisto por OrderManager
    const clientOrderId = request.clientOid || `cli_${request.simbolo.replace('/', '').toLowerCase()}_${Date.now()}`;

    const transaccion = async (): Promise<ExecutionResult> => {
      // 1. Obtener precio actual de mercado para conversión precisa de tamaño
      const currentPrice = await this.getMarketPrice(request.simbolo);
      
      // Convertir el tamaño en USD de la orden a cantidad nominal de la criptomoneda
      let rawCoinSize = request.tamano / currentPrice;
      
      // Redondear el tamaño nominal a decimales aceptados por el contrato de Bitget
      let formattedSize = '0.001';
      if (mappedSymbol.includes('BTC')) {
        formattedSize = Math.max(0.001, Number(rawCoinSize.toFixed(3))).toString();
      } else if (mappedSymbol.includes('ETH')) {
        formattedSize = Math.max(0.01, Number(rawCoinSize.toFixed(2))).toString();
      } else {
        formattedSize = Math.max(0.1, Number(rawCoinSize.toFixed(1))).toString();
      }

      const isMarketOrder = request.tipo.toLowerCase() === 'market';
      const posSideVal = request.lado === 'BUY' ? 'long' : 'short';
      
      // Cadena de variaciones de payload para compatibilidad universal con Bitget V2 (Modo Unilateral vs Modo Cobertura/Hedge)
      const variacionesPayload: Array<Record<string, string | boolean>> = [
        // Variación 1: Modo Unilateral / One-Way (side: 'buy'/'sell', sin posSide ni tradeSide)
        {
          symbol: mappedSymbol,
          productType: this.getProductType(),
          marginCoin: isReal ? 'USDT' : 'SUSDT',
          marginMode: 'crossed',
          size: formattedSize,
          side: request.lado === 'BUY' ? 'buy' : 'sell',
          orderType: request.tipo.toLowerCase(),
          force: isMarketOrder ? 'ioc' : 'gtc',
          clientOid: clientOrderId
        },
        // Variación 2: Modo Cobertura / Hedge oficial Bitget V2 (posSide: 'long'/'short', tradeSide: 'open')
        {
          symbol: mappedSymbol,
          productType: this.getProductType(),
          marginCoin: isReal ? 'USDT' : 'SUSDT',
          marginMode: 'crossed',
          size: formattedSize,
          side: request.lado === 'BUY' ? 'buy' : 'sell',
          posSide: posSideVal,
          tradeSide: 'open',
          orderType: request.tipo.toLowerCase(),
          force: isMarketOrder ? 'ioc' : 'gtc',
          clientOid: clientOrderId
        }
      ];

      let res: any = null;
      let ultimoError: any = null;

      for (let idx = 0; idx < variacionesPayload.length; idx++) {
        const payloadActual = variacionesPayload[idx];
        try {
          console.log(`[BitgetBroker] [POST /api/v2/mix/order/place-order] Intentando variante de apertura ${idx + 1}/${variacionesPayload.length} [clientOid: ${clientOrderId}]:`, JSON.stringify(payloadActual));
          res = await this.sendRequest('POST', '/api/v2/mix/order/place-order', {}, payloadActual);
          if (res) break; // ¡Éxito!
        } catch (err: any) {
          ultimoError = err;
          console.warn(`[BitgetBroker] Variante de apertura ${idx + 1} rechazada (${err.message || err}). Conmutando variante...`);
          continue;
        }
      }

      if (!res) {
        throw ultimoError || new Error('No se pudo determinar el formato de orden compatible con la cuenta de Bitget.');
      }

      const orderId = res.orderId || res.orderNo || `bitget_ord_${clientOrderId}`;
      const priceExecuted = parseFloat(res.price || '0') || currentPrice;
      const sizeExecuted = parseFloat(res.size || formattedSize);
      const comisionUSD = Number((sizeExecuted * priceExecuted * 0.0006).toFixed(4));

      return {
        exitoso: true,
        orderId,
        clientOrderId,
        precioEjecutado: priceExecuted,
        tamanoEjecutado: sizeExecuted,
        comisionUSD,
        mensajeRespuesta: `Orden en Bitget ${isReal ? 'REAL' : 'DEMO'} colocada con éxito. ID: ${orderId}, ClientOid: ${clientOrderId}, Símbolo: ${mappedSymbol}, Lado: ${request.lado}, Tamaño: ${formattedSize} en $${priceExecuted.toLocaleString()} USD.`,
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    };


    const resultadoReintentos = await this.runWithExponentialBackoff(transaccion);

    if (resultadoReintentos.exito && resultadoReintentos.resultado) {
      return {
        ...resultadoReintentos.resultado,
        reintentosRealizados: resultadoReintentos.intentos - 1
      };
    } else {
      const errorMsg = resultadoReintentos.error?.message || 'Error de API o red de Bitget';
      console.error(`[BitgetBroker] Falla crítica definitiva tras reintentos: ${errorMsg}`);
      return {
        exitoso: false,
        mensajeRespuesta: `No se pudo ejecutar la orden real en Bitget: ${errorMsg}`,
        timestamp: Date.now(),
        error: errorMsg,
        reintentosRealizados: resultadoReintentos.intentos - 1
      };
    }
  }

  /**
   * Obtiene la cotización del ticker en tiempo real de Bitget.
   */
  public async getTicker(symbol: string): Promise<{ symbol: string; price: number; volume24h: number; high24h: number; low24h: number; timestamp: number } | null> {
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      const productType = this.getProductType();
      const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${mappedSymbol}&productType=${productType}`;

      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      if (json.code !== '00000' || !json.data || json.data.length === 0) return null;

      const t = json.data[0];
      return {
        symbol,
        price: parseFloat(t.lastPr),
        volume24h: parseFloat(t.baseVolume ?? t.volume24h ?? '0'),
        high24h: parseFloat(t.high24h ?? t.lastPr),
        low24h: parseFloat(t.low24h ?? t.lastPr),
        timestamp: Date.now()
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Consulta el balance disponible en el monedero de futuros de Bitget (Demo o Real).
   */
  public async getBalance(asset: string): Promise<number> {
    try {
      const isReal = process.env.BITGET_MODO_REAL === 'true';
      const targetProductType = this.getProductType();
      const queryAsset = isReal ? asset.toUpperCase() : (asset.toUpperCase() === 'USDT' ? 'SUSDT' : asset.toUpperCase());
      
      console.log(`[BitgetBroker] [GET /api/v2/mix/account/accounts] Solicitando balance de margen (${isReal ? 'Real' : 'Demo'}) para target asset: ${queryAsset}, productType: ${targetProductType}`);
      const accounts = await this.sendRequest('GET', '/api/v2/mix/account/accounts', { productType: targetProductType });
      
      if (Array.isArray(accounts) && accounts.length > 0) {
        const matched = accounts.find((acc: any) => {
          const coin = (acc.marginCoin || acc.coin || '').toUpperCase();
          return coin === queryAsset || coin === asset.toUpperCase() || coin.includes('USDT');
        }) || accounts[0];

        if (matched) {
          const available = parseFloat(matched.available || matched.availableBalance || matched.maxOpenPosAvailable || matched.equity || '0');
          if (!isNaN(available)) {
            console.log(`[BitgetBroker] Balance obtenido con éxito: $${available} (${matched.marginCoin || matched.coin || asset})`);
            return available;
          }
        }
      }
      return 0;
    } catch (error: any) {
      console.warn(`[BitgetBroker] Aviso al obtener balance de Bitget (${error?.message || error}). Si no has guardado tus API Keys en la pestaña "Configuración API" o en .env, se utilizará 0 como salvaguarda.`);
      return 0;
    }
  }


  /**
   * Consulta el tamaño y PnL no realizado de posiciones activas en Bitget (Demo o Real).
   */
  public async getPosition(symbol: string): Promise<{ size: number; entryPrice: number; unrealizedPnl: number; holdSide?: string; rawSymbol?: string; marginCoin?: string } | null> {
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      const isReal = process.env.BITGET_MODO_REAL === 'true';
      const targetProductType = this.getProductType();
      console.log(`[BitgetBroker] [GET /api/v2/mix/position/all-position] Recuperando posición activa (${isReal ? 'Real' : 'Demo'}) para: ${mappedSymbol}`);
      
      const positions = await this.sendRequest('GET', '/api/v2/mix/position/all-position', { productType: targetProductType });
      
      if (Array.isArray(positions) && positions.length > 0) {
        const matched = positions.find((pos: any) => {
          const posSym = (pos.symbol || pos.instId || pos.symbolId || '').toUpperCase();
          const targetSym = mappedSymbol.toUpperCase();
          
          // Mapeo flexible de símbolo (SBTCSUSDT vs SBTCSUSDT_SUMCBL vs BTCUSDT)
          const cleanPos = posSym.replace(/[^A-Z0-9]/g, '');
          const cleanTarget = targetSym.replace(/[^A-Z0-9]/g, '');
          const isSymbolMatch = cleanPos === cleanTarget || cleanPos.includes(cleanTarget) || cleanTarget.includes(cleanPos);
          
          // Mapeo flexible de tamaño de posición (total, holdAmount, available, size, totalHold, openDelegate, marginSize)
          const rawVal = pos.total ?? pos.holdAmount ?? pos.available ?? pos.size ?? pos.totalHold ?? pos.holdSize ?? pos.marginSize ?? '0';
          const sizeVal = parseFloat(rawVal);
          const isHold = !isNaN(sizeVal) && Math.abs(sizeVal) > 0;
          return isSymbolMatch && isHold;
        });

        if (matched) {
          const rawSize = parseFloat(
            matched.total ?? matched.holdAmount ?? matched.available ?? matched.size ?? matched.totalHold ?? matched.holdSize ?? '0'
          );
          const size = Math.abs(rawSize);
          const holdSideStr = (matched.holdSide || matched.posSide || matched.side || 'long').toLowerCase();
          const isShort = holdSideStr === 'short' || holdSideStr === 'sell';
          const sizeSigned = isShort ? -size : size;
          
          return {
            size: sizeSigned,
            entryPrice: parseFloat(matched.openPrice || matched.entryPrice || matched.achievePrice || matched.openPriceAvg || '0'),
            unrealizedPnl: parseFloat(matched.upl || matched.unrealizedPL || matched.unrealizedPnl || '0'),
            holdSide: isShort ? 'short' : 'long',
            rawSymbol: matched.symbol || matched.instId || mappedSymbol,
            marginCoin: matched.marginCoin || (isReal ? 'USDT' : 'SUSDT')
          };
        }
      }
      return null;
    } catch (error) {
      console.warn(`[BitgetBroker] Error al consultar posición activa para ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Ajusta explícitamente el apalancamiento en la cuenta de Bitget para el símbolo dado.
   */
  public async setLeverage(symbol: string, leverage: number, holdSide: 'long' | 'short' = 'long'): Promise<boolean> {
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      const productType = this.getProductType();
      const isReal = process.env.BITGET_MODO_REAL === 'true';
      const marginCoin = isReal ? 'USDT' : (mappedSymbol.endsWith('SUSDT') ? 'SUSDT' : 'USDT');

      console.log(`[BitgetBroker] Ajustando apalancamiento en Bitget a ${leverage}x para ${mappedSymbol}...`);
      await this.sendRequest('POST', '/api/v2/mix/account/set-leverage', {}, {
        symbol: mappedSymbol,
        productType,
        marginCoin,
        leverage: leverage.toString(),
        holdSide
      });
      return true;
    } catch (err: any) {
      console.warn(`[BitgetBroker] Aviso al ajustar apalancamiento a ${leverage}x en Bitget: ${err.message || err}`);
      return false;
    }
  }

  /**
   * Consulta el estado de una orden en Bitget utilizando su clientOid determinista.
   */
  public async getOrderByClientOid(symbol: string, clientOid: string): Promise<any | null> {
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      const productType = this.getProductType();
      console.log(`[BitgetBroker] Consultando estado de orden por clientOid (${clientOid}) en Bitget...`);
      const res = await this.sendRequest('GET', '/api/v2/mix/order/detail', {
        symbol: mappedSymbol,
        productType,
        clientOid
      });
      if (res && (res.orderId || res.clientOid)) {
        return res;
      }
      return null;
    } catch (err: any) {
      console.warn(`[BitgetBroker] Orden con clientOid (${clientOid}) no encontrada o consulta fallida en Bitget: ${err.message || err}`);
      return null;
    }
  }

  /**
   * Envía una orden de cierre inmediato de la posición activa en Bitget (Demo o Real).
   */
  public async closePosition(symbol: string): Promise<ExecutionResult> {
    const isReal = process.env.BITGET_MODO_REAL === 'true';
    const mappedSymbol = this.mapSymbol(symbol);
    const targetProductType = this.getProductType();
    const targetMarginCoin = isReal ? 'USDT' : 'SUSDT';

    console.log(`[BitgetBroker] Solicitando cierre de posición (${isReal ? 'Real' : 'Demo'}) para: ${mappedSymbol}...`);

    const pos = await this.getPosition(symbol);

    const transaccionCierre = async (): Promise<ExecutionResult> => {
      let res: any = null;
      let ultimoError: any = null;

      // Intentar variante 1: Endpoint oficial de cierre rápido de Bitget V2 (/api/v2/mix/order/close-positions)
      const closePosPayloads = [
        { symbol: mappedSymbol, productType: targetProductType },
        { symbol: pos?.rawSymbol || mappedSymbol, productType: targetProductType },
        { symbol: mappedSymbol, productType: targetProductType, holdSide: pos?.holdSide || 'long' },
        { symbol: mappedSymbol, productType: targetProductType, holdSide: pos?.holdSide || 'short' }
      ];

      for (let idx = 0; idx < closePosPayloads.length; idx++) {
        try {
          console.log(`[BitgetBroker] [POST /api/v2/mix/order/close-positions] Intentando cierre directo en Bitget (Variante ${idx + 1}/${closePosPayloads.length}):`, JSON.stringify(closePosPayloads[idx]));
          res = await this.sendRequest('POST', '/api/v2/mix/order/close-positions', {}, closePosPayloads[idx]);
          if (res) {
            console.log(`[BitgetBroker] ¡Posición cerrada exitosamente vía endpoint /close-positions en Bitget!`);
            break;
          }
        } catch (err: any) {
          ultimoError = err;
          console.warn(`[BitgetBroker] Cierre directo variante ${idx + 1} no aplicable (${err.message || err}). Probando variante reducida...`);
          continue;
        }
      }

      // Si /close-positions tuvo éxito, retornar
      if (res) {
        return {
          exitoso: true,
          orderId: res.orderId || res.orderNo || `close_${Date.now()}`,
          mensajeRespuesta: `Posición cerrada con éxito en Bitget ${isReal ? 'REAL' : 'DEMO'} (${mappedSymbol}).`,
          timestamp: Date.now(),
          reintentosRealizados: 0
        };
      }

      // Si /close-positions falló pero hay posición conocida, intentar orden de reducción de mercado
      if (pos && pos.size !== 0) {
        const absSize = Math.abs(pos.size);
        const posSideVal = pos.size > 0 ? 'long' : 'short';
        const sideVal = pos.size > 0 ? 'sell' : 'buy';

        const variacionesCierre: Array<Record<string, string | boolean>> = [
          {
            symbol: pos.rawSymbol || mappedSymbol,
            productType: targetProductType,
            marginCoin: pos.marginCoin || targetMarginCoin,
            marginMode: 'crossed',
            size: absSize.toString(),
            side: sideVal,
            orderType: 'market',
            force: 'ioc',
            reduceOnly: 'yes'
          },
          {
            symbol: pos.rawSymbol || mappedSymbol,
            productType: targetProductType,
            marginCoin: pos.marginCoin || targetMarginCoin,
            marginMode: 'crossed',
            size: absSize.toString(),
            side: sideVal,
            posSide: posSideVal,
            tradeSide: 'close',
            orderType: 'market',
            force: 'ioc'
          }
        ];

        for (let idx = 0; idx < variacionesCierre.length; idx++) {
          try {
            console.log(`[BitgetBroker] [POST /api/v2/mix/order/place-order] Variante de orden de reducción ${idx + 1}/${variacionesCierre.length}:`, JSON.stringify(variacionesCierre[idx]));
            res = await this.sendRequest('POST', '/api/v2/mix/order/place-order', {}, variacionesCierre[idx]);
            if (res) break;
          } catch (err: any) {
            ultimoError = err;
            console.warn(`[BitgetBroker] Variante de orden de reducción ${idx + 1} rechazada (${err.message || err}).`);
            continue;
          }
        }
      }

      if (res) {
        return {
          exitoso: true,
          orderId: res.orderId || res.orderNo || `close_${Date.now()}`,
          mensajeRespuesta: `Posición cerrada con éxito en Bitget ${isReal ? 'REAL' : 'DEMO'} (${mappedSymbol}).`,
          timestamp: Date.now(),
          reintentosRealizados: 0
        };
      }

      const msgError = ultimoError?.message || '';
      if (msgError.includes('22002') || msgError.includes('No position to close') || msgError.includes('not exist')) {
        return {
          exitoso: true,
          mensajeRespuesta: `La posición para ${mappedSymbol} ya se encuentra totalmente cerrada en Bitget.`,
          timestamp: Date.now(),
          reintentosRealizados: 0
        };
      }

      throw ultimoError || new Error(`No fue posible cerrar la posición para ${mappedSymbol} en Bitget.`);
    };

    try {
      const resultado = await this.runWithExponentialBackoff(transaccionCierre);
      if (resultado.exito && resultado.resultado) {
        return resultado.resultado;
      } else {
        throw new Error(resultado.error?.message || 'Error al cerrar posición');
      }
    } catch (error: any) {
      console.error(`[BitgetBroker] Error al cerrar posición: ${error?.message || error}`);
      return {
        exitoso: false,
        mensajeRespuesta: `Error al cerrar posición en Bitget: ${error.message || error}`,
        timestamp: Date.now(),
        error: 'CLOSE_POSITION_FAILED',
        reintentosRealizados: 0
      };
    }
  }
}
