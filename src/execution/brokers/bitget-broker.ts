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
    console.log(`[BitgetBroker] Preparando orden en Bitget ${isReal ? 'Real' : 'Demo'} para ${mappedSymbol} (${request.lado})...`);

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

      const clientOrderId = `cli_${Math.random().toString(36).substring(2, 12)}`;

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
          console.log(`[BitgetBroker] [POST /api/v2/mix/order/place-order] Intentando variante de apertura ${idx + 1}/${variacionesPayload.length}:`, JSON.stringify(payloadActual));
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

      const orderId = res.orderId || res.orderNo || `bitget_ord_${Math.random().toString(36).substring(2, 10)}`;
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
        mensajeRespuesta: `Orden en Bitget ${isReal ? 'REAL' : 'DEMO'} colocada con éxito. ID: ${orderId}, Símbolo: ${mappedSymbol}, Lado: ${request.lado}, Tamaño: ${formattedSize} en $${priceExecuted.toLocaleString()} USD.`,
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
   * Consulta el balance disponible en el monedero de futuros de Bitget (Demo o Real).
   */
  public async getBalance(asset: string): Promise<number> {
    try {
      const isReal = process.env.BITGET_MODO_REAL === 'true';
      const targetProductType = this.getProductType();
      const queryAsset = isReal ? asset.toUpperCase() : (asset.toUpperCase() === 'USDT' ? 'SUSDT' : asset.toUpperCase());
      
      console.log(`[BitgetBroker] [GET /api/v2/mix/account/accounts] Solicitando balance de margen (${isReal ? 'Real' : 'Demo'}) para target asset: ${queryAsset}, productType: ${targetProductType}`);
      const accounts = await this.sendRequest('GET', '/api/v2/mix/account/accounts', { productType: targetProductType });
      
      if (Array.isArray(accounts)) {
        const matched = accounts.find((acc: any) => 
          acc.marginCoin.toUpperCase() === queryAsset || 
          acc.marginCoin.toUpperCase() === asset.toUpperCase()
        );
        if (matched) {
          const available = parseFloat(matched.available || matched.equity || '0');
          if (!isNaN(available)) {
            return available;
          }
        }
      }
      return 0;
    } catch (error: any) {
      console.warn(`[BitgetBroker] Error al obtener balance real: ${error?.message || error}. Retornando 0 como contingencia.`);
      return 0;
    }
  }

  /**
   * Consulta el tamaño y PnL no realizado de posiciones activas en Bitget (Demo o Real).
   */
  /**
   * Consulta el tamaño y PnL no realizado de posiciones activas en Bitget (Demo o Real).
   */
  public async getPosition(symbol: string): Promise<{ size: number; entryPrice: number; unrealizedPnl: number; holdSide?: string; rawSymbol?: string; marginCoin?: string } | null> {
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      const isReal = process.env.BITGET_MODO_REAL === 'true';
      console.log(`[BitgetBroker] [GET /api/v2/mix/position/all-position] Recuperando posición activa (${isReal ? 'Real' : 'Demo'}) para: ${mappedSymbol}`);
      
      const positions = await this.sendRequest('GET', '/api/v2/mix/position/all-position', { productType: this.getProductType() });
      
      if (Array.isArray(positions)) {
        const matched = positions.find((pos: any) => {
          const posSym = (pos.symbol || pos.instId || '').toUpperCase();
          const targetSym = mappedSymbol.toUpperCase();
          const isSymbolMatch = posSym === targetSym;
          const isHold = parseFloat(pos.total || pos.holdAmount || pos.available || '0') > 0;
          return isSymbolMatch && isHold;
        });
        if (matched) {
          const size = parseFloat(matched.total || matched.holdAmount || matched.available || '0');
          const holdSideStr = (matched.holdSide || matched.posSide || 'long').toLowerCase();
          const isShort = holdSideStr === 'short';
          const sizeSigned = isShort ? -size : size;
          
          return {
            size: sizeSigned,
            entryPrice: parseFloat(matched.openPrice || matched.entryPrice || matched.achievePrice || '0'),
            unrealizedPnl: parseFloat(matched.upl || matched.unrealizedPL || '0'),
            holdSide: holdSideStr,
            rawSymbol: matched.symbol || matched.instId,
            marginCoin: matched.marginCoin
          };
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Envía una orden de cierre inmediato de la posición activa en Bitget (Demo o Real).
   */
  public async closePosition(symbol: string): Promise<ExecutionResult> {
    const isReal = process.env.BITGET_MODO_REAL === 'true';
    console.log(`[BitgetBroker] Solicitando cierre de posición (${isReal ? 'Real' : 'Demo'}) para: ${symbol}`);
    
    try {
      const pos = await this.getPosition(symbol);
      if (!pos || pos.size === 0) {
        return {
          exitoso: true,
          mensajeRespuesta: `No se encontró posición activa para cerrar en Bitget ${isReal ? 'Real' : 'Demo'} (${symbol}).`,
          timestamp: Date.now(),
          reintentosRealizados: 0
        };
      }

      const absSize = Math.abs(pos.size);
      const mappedSymbol = pos.rawSymbol || this.mapSymbol(symbol);
      const isDemoSymbol = mappedSymbol.startsWith('S') && mappedSymbol.endsWith('SUSDT');
      const targetMarginCoin = pos.marginCoin || (isDemoSymbol ? 'SUSDT' : 'USDT');
      const targetProductType = isDemoSymbol ? 'SUSDT-FUTURES' : 'USDT-FUTURES';

      const posSideVal = pos.size > 0 ? 'long' : 'short';
      const sideVal = pos.size > 0 ? 'sell' : 'buy';

      const transaccionCierre = async (): Promise<ExecutionResult> => {
        const variacionesCierre: Array<Record<string, string | boolean>> = [
          // Variante 1: Modo Unilateral / One-Way (side: 'buy'/'sell', reduceOnly: 'yes', sin posSide ni tradeSide)
          {
            symbol: mappedSymbol,
            productType: targetProductType,
            marginCoin: targetMarginCoin,
            marginMode: 'crossed',
            size: absSize.toString(),
            side: sideVal,
            orderType: 'market',
            force: 'ioc',
            reduceOnly: 'yes'
          },
          // Variante 2: Modo Cobertura / Hedge (side: 'buy'/'sell', posSide: 'long'/'short', tradeSide: 'close')
          {
            symbol: mappedSymbol,
            productType: targetProductType,
            marginCoin: targetMarginCoin,
            marginMode: 'crossed',
            size: absSize.toString(),
            side: sideVal,
            posSide: posSideVal,
            tradeSide: 'close',
            orderType: 'market',
            force: 'ioc',
            reduceOnly: 'yes'
          }
        ];

        console.log(`[BitgetBroker] [POST /api/v2/mix/order/place-order] Enviando ORDEN DE CIERRE para ${mappedSymbol} (Lado: ${posSideVal.toUpperCase()}, Tamaño: ${absSize}, Margen: ${targetMarginCoin})...`);
        
        let res: any = null;
        let ultimoError: any = null;

        for (let idx = 0; idx < variacionesCierre.length; idx++) {
          const payloadActual = variacionesCierre[idx];
          try {
            console.log(`[BitgetBroker] Variante de cierre ${idx + 1}/${variacionesCierre.length}:`, JSON.stringify(payloadActual));
            res = await this.sendRequest('POST', '/api/v2/mix/order/place-order', {}, payloadActual);
            if (res) break;
          } catch (err: any) {
            ultimoError = err;
            console.warn(`[BitgetBroker] Variante de cierre ${idx + 1} rechazada (${err.message || err}). Conmutando a siguiente variante...`);
            continue;
          }
        }

        if (!res) {
          const msgError = ultimoError?.message || '';
          if (msgError.includes('22002') || msgError.includes('No position to close')) {
            console.log('[BitgetBroker] La posición ya no existe en Bitget.');
            return {
              exitoso: true,
              mensajeRespuesta: `La posición para ${mappedSymbol} ya se encuentra cerrada en Bitget.`,
              timestamp: Date.now(),
              reintentosRealizados: 0
            };
          }
          throw ultimoError || new Error('No se pudo cerrar la posición en Bitget.');
        }

        const orderId = res.orderId || res.orderNo || `close_${Math.random().toString(36).substring(2, 10)}`;
        const sideCloseLabel = pos.size > 0 ? 'SELL' : 'BUY';
        return {
          exitoso: true,
          orderId,
          mensajeRespuesta: `Posición cerrada con éxito en Bitget ${isReal ? 'REAL' : 'DEMO'}. Lado: ${sideCloseLabel}, Símbolo: ${mappedSymbol}.`,
          timestamp: Date.now(),
          reintentosRealizados: 0
        };
      };

      const resultado = await this.runWithExponentialBackoff(transaccionCierre);
      if (resultado.exito && resultado.resultado) {
        return resultado.resultado;
      } else {
        throw new Error(resultado.error?.message || 'Error al cerrar posición');
      }
    } catch (error: any) {
      console.error(`[BitgetBroker] Error crítico al cerrar la posición: ${error?.message || error}`);
      return {
        exitoso: false,
        mensajeRespuesta: `Falla al cerrar la posición en Bitget Demo: ${error?.message || error}`,
        timestamp: Date.now(),
        reintentosRealizados: 0
      };
    }
  }
}
