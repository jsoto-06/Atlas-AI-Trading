/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { HttpTransport, InfoClient, ExchangeClient } from '@nktkas/hyperliquid';
import { SymbolConverter, formatPrice, formatSize } from '@nktkas/hyperliquid/utils';
import { privateKeyToAccount } from 'viem/accounts';
import { BaseBroker } from './base-broker.ts';
import { OrderRequest, ExecutionResult } from '../types.ts';
import { ExchangeId, PositionInfo, TickerInfo, OrderQueryInfo } from './types.ts';

interface SimulatedPosition {
  symbol: string;
  size: number;
  entryPrice: number;
  side: 'long' | 'short';
  timestamp: number;
}

/**
 * Adaptador de Corretaje Oficial para Hyperliquid DEX (HyperliquidBroker).
 * 
 * Implementa la interfaz BaseBroker interactuando con la API L1 de Hyperliquid.
 * Soporta dos entornos Web3:
 * 1. MODO REAL / MAINNET DEX: Conexión firmada con ECDSA a `https://api.hyperliquid.xyz`.
 * 2. MODO TESTNET / SANDBOX: Conexión a `https://api.hyperliquid-testnet.xyz` con fondos de faucet.
 *    - Si no se configura clave privada, activa simulación en memoria con precios de mercado en vivo
 *      (Zero-Friction Paper Trading DEX).
 */
export class HyperliquidBroker extends BaseBroker {
  public readonly exchangeId: ExchangeId = 'hyperliquid';
  public readonly nombreBroker: string = 'Hyperliquid DEX';

  private transport: HttpTransport | null = null;
  private infoClient: InfoClient | null = null;
  private exchangeClient: ExchangeClient | null = null;
  private converter: any = null;
  private walletAddress: `0x${string}` | null = null;

  // Memoria de simulación local cuando se opera sin clave privada
  private simBalance: number = 0;
  private simPositions: Map<string, SimulatedPosition> = new Map();
  private simOrders: Map<string, any> = new Map();

  constructor() {
    super();
    this.initClients();
  }

  /**
   * Inicializa los clientes HTTP y de firma criptográfica según las variables de entorno.
   */
  private initClients(): void {
    const isTestnet = !this.isReal();
    this.transport = new HttpTransport({ isTestnet });
    this.infoClient = new InfoClient({ transport: this.transport });

    const rawPk = process.env.HYPERLIQUID_PRIVATE_KEY?.trim();
    if (rawPk) {
      try {
        const pk = (rawPk.startsWith('0x') ? rawPk : `0x${rawPk}`) as `0x${string}`;
        const wallet = privateKeyToAccount(pk);
        this.walletAddress = wallet.address;
        this.exchangeClient = new ExchangeClient({
          transport: this.transport,
          wallet
        });
        console.log(`[HyperliquidBroker] Inicializado en modo ${this.isReal() ? 'MAINNET DEX' : 'TESTNET'} con wallet: ${this.walletAddress}`);
      } catch (err: any) {
        console.warn(`[HyperliquidBroker] Error al inicializar cuenta viem con la clave privada provista: ${err.message}`);
        this.exchangeClient = null;
        this.walletAddress = null;
      }
    } else {
      console.log(`[HyperliquidBroker] Operando en simulación Web3 (Paper Trading con precios en vivo de ${isTestnet ? 'Testnet' : 'Mainnet'}).`);
    }
  }

  /**
   * Obtiene o inicializa perezosamente el conversor de símbolos y decimales.
   */
  private async getConverter(): Promise<any> {
    if (!this.converter && this.transport) {
      try {
        this.converter = await SymbolConverter.create({ transport: this.transport });
      } catch (err: any) {
        console.warn(`[HyperliquidBroker] Aviso al inicializar SymbolConverter: ${err.message}`);
      }
    }
    return this.converter;
  }

  /**
   * Valida si las credenciales Web3 de Hyperliquid están presentes en el entorno.
   */
  public isConfigured(): boolean {
    return !!(process.env.HYPERLIQUID_PRIVATE_KEY && process.env.HYPERLIQUID_PRIVATE_KEY.trim() !== '');
  }

  /**
   * Determina si se está operando en Mainnet DEX (Real) o Testnet.
   */
  public isReal(): boolean {
    return process.env.HYPERLIQUID_MODO_REAL === 'true';
  }

  /**
   * Normaliza símbolos universales (BTC/USDT, ETH/USDT, SOL/USDT) a monedas de Hyperliquid (BTC, ETH, SOL).
   */
  private normalizeCoin(symbol: string): string {
    const s = symbol.toUpperCase().trim();
    if (s.includes('BTC') || s.includes('XBT')) return 'BTC';
    if (s.includes('ETH')) return 'ETH';
    if (s.includes('SOL')) return 'SOL';
    return s.split('/')[0].split('-')[0];
  }

  /**
   * Genera un Client Order ID (cloid) de 34 caracteres con prefijo 0x para idempotencia en Hyperliquid.
   */
  private generateCloid(seed?: string): `0x${string}` {
    if (seed && seed.startsWith('0x') && seed.length === 34) {
      return seed as `0x${string}`;
    }
    const hash = crypto.createHash('md5').update(seed || `${Date.now()}_${Math.random()}`).digest('hex');
    return `0x${hash}` as `0x${string}`;
  }

  /**
   * Consulta el saldo on-chain real de la wallet en Hyperliquid.
   */
  private async getOnChainBalance(): Promise<number> {
    if (!this.walletAddress || !this.infoClient) return 0;
    try {
      const state = await this.infoClient.clearinghouseState({ user: this.walletAddress });
      if (state && state.withdrawable !== undefined) {
        const avail = parseFloat(state.withdrawable);
        if (!isNaN(avail)) return avail;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Consulta la posición on-chain real para un símbolo.
   */
  private async getOnChainPosition(symbol: string): Promise<PositionInfo | null> {
    const coin = this.normalizeCoin(symbol);
    if (!this.walletAddress || !this.infoClient) return null;
    try {
      const state = await this.infoClient.clearinghouseState({ user: this.walletAddress });
      if (!state || !state.assetPositions || state.assetPositions.length === 0) return null;
      const match = state.assetPositions.find(p => p.position.coin === coin);
      if (!match) return null;
      const pos = match.position;
      const rawSize = parseFloat(pos.szi);
      if (isNaN(rawSize) || Math.abs(rawSize) <= 0.0000001) return null;

      return {
        size: Math.abs(rawSize),
        entryPrice: parseFloat(pos.entryPx) || 0,
        unrealizedPnl: parseFloat(pos.unrealizedPnl) || 0,
        holdSide: rawSize > 0 ? 'long' : 'short',
        rawSymbol: pos.coin,
        marginCoin: 'USDC'
      };
    } catch {
      return null;
    }
  }

  /**
   * Ejecuta una orden de futuros en Hyperliquid DEX.
   */
  public async executeOrder(request: OrderRequest): Promise<ExecutionResult> {
    const isRealMode = this.isReal();
    const isConfigured = this.isConfigured();
    const coin = this.normalizeCoin(request.simbolo);
    const sideRaw = request.lado || (request as any).direccion || (request as any).side || 'BUY';
    const side = String(sideRaw).toUpperCase() as 'BUY' | 'SELL';
    const isBuy = side === 'BUY';

    console.log(
      `[HyperliquidBroker] Preparando orden en Hyperliquid (${isRealMode ? 'MAINNET DEX' : (isConfigured ? 'TESTNET' : 'SIMULACIÓN LOCAL')}) para ${coin} (${side})...`
    );

    // 1. MODO SIMULACIÓN LOCAL (Si no hay clave configurada)
    if (!isConfigured || !this.exchangeClient || !this.walletAddress) {
      return this.executeLocalSimulation(request, coin, side);
    }

    // 2. En TESTNET: Si la wallet tiene 0 USDC en el exchange (faucet bloqueado sin Mainnet),
    // ejecutar mediante Paper Trading con el feed de precios en tiempo real para no bloquear al usuario.
    if (!isRealMode) {
      const onChain = await this.getOnChainBalance();
      if (onChain <= 0) {
        console.log(`[HyperliquidBroker] Testnet sin saldo on-chain ($0.00). Ejecutando orden en Paper Trading con feed L1 en vivo.`);
        return this.executeLocalSimulation(request, coin, side);
      }
    }

    // 3. MODO ON-CHAIN FIRMADO CRIPTOGRÁFICAMENTE (Mainnet o Testnet fondeada)
    return this.runWithExponentialBackoff(async () => {
      const converter = await this.getConverter();
      const assetId = converter?.getAssetId(coin) ?? (coin === 'BTC' ? 3 : coin === 'ETH' ? 4 : 0);
      const szDecimals = converter?.getSzDecimals(coin) ?? 4;

      // Obtener precio actual de mercado para determinar precios límite de protección
      const currentPrice = await this.getMarketPrice(request.simbolo);
      if (currentPrice <= 0) {
        throw new Error(`Precio de mercado no disponible para ${coin} en Hyperliquid.`);
      }

      // Slippage del 1.5% para órdenes a mercado
      const rawTargetSize = request.tamano ?? (request as any).cantidad ?? 0;
      // Si el tamaño viene expresado en nocional USD (ej. > 5 en BTC), convertirlo a cantidad nominal de la criptomoneda
      const targetSize = currentPrice > 0 && rawTargetSize > 5
        ? Number((rawTargetSize / currentPrice).toFixed(szDecimals))
        : rawTargetSize;
      const limitPrice = request.precioLimite ?? (request as any).precio;
      const targetPrice = request.tipo === 'LIMIT' && limitPrice
        ? limitPrice
        : (isBuy ? currentPrice * 1.015 : currentPrice * 0.985);

      const formattedPx = formatPrice(targetPrice.toString(), szDecimals);
      const formattedSz = formatSize(targetSize.toString(), szDecimals);

      if (parseFloat(formattedSz) <= 0) {
        throw new Error(`El tamaño de orden formateado para ${coin} es inferior al mínimo permitido (${formattedSz}).`);
      }

      // Ajustar apalancamiento si se especificó
      if (request.leverage && request.leverage > 0) {
        await this.setLeverage(request.simbolo, request.leverage);
      }

      const cloid = this.generateCloid(request.clientOid);

      console.log(`[HyperliquidBroker] Despachando orden a Hyperliquid L1: Asset ${assetId} (${coin}), Px: ${formattedPx}, Sz: ${formattedSz}, Lado: ${isBuy ? 'LONG' : 'SHORT'}`);

      const res = await this.exchangeClient!.order({
        orders: [
          {
            a: assetId,
            b: isBuy,
            p: formattedPx,
            s: formattedSz,
            r: (request as any).reduceOnly === true,
            t: request.tipo === 'LIMIT'
              ? { limit: { tif: 'Gtc' } }
              : { limit: { tif: 'FrontendMarket' } },
            c: cloid
          }
        ],
        grouping: 'na'
      });

      if (res.status !== 'ok' || !res.response || res.response.data.statuses.length === 0) {
        throw new Error(`Respuesta anómala de Hyperliquid: ${JSON.stringify(res)}`);
      }

      const statusObj = res.response.data.statuses[0];

      if (typeof statusObj === 'object' && 'error' in statusObj) {
        return {
          exitoso: false,
          mensajeRespuesta: `Error en Hyperliquid: ${String(statusObj.error)}`,
          error: String(statusObj.error),
          reintentosRealizados: 0,
          timestamp: Date.now()
        };
      }

      let orderId = '0';
      let avgPrice = currentPrice;
      let executedQty = targetSize;

      if (typeof statusObj === 'object' && 'filled' in statusObj) {
        orderId = statusObj.filled.oid.toString();
        avgPrice = parseFloat(statusObj.filled.avgPx) || currentPrice;
        executedQty = parseFloat(statusObj.filled.totalSz) || targetSize;
      } else if (typeof statusObj === 'object' && 'resting' in statusObj) {
        orderId = statusObj.resting.oid.toString();
      }

      console.log(`[HyperliquidBroker] ✅ Orden ejecutada con éxito en Hyperliquid. OID: ${orderId}, Precio: $${avgPrice}`);

      return {
        exitoso: true,
        orderId,
        clientOrderId: request.clientOid || cloid,
        precioEjecutado: avgPrice,
        tamanoEjecutado: executedQty,
        comisionUSD: executedQty * avgPrice * 0.00035, // 0.035% fee taker en Hyperliquid
        mensajeRespuesta: `Orden ejecutada con éxito en Hyperliquid. OID: ${orderId}`,
        reintentosRealizados: 0,
        timestamp: Date.now()
      };
    }).then(res => {
      if (!res.exito) {
        return {
          exitoso: false,
          mensajeRespuesta: res.error?.message || 'Fallo de red en Hyperliquid.',
          error: res.error?.message || 'Fallo de red en Hyperliquid.',
          reintentosRealizados: res.intentos - 1,
          timestamp: Date.now()
        };
      }
      return res.resultado!;
    });
  }

  /**
   * Ejecución simulada con precios de mercado en tiempo real cuando se opera sin claves privadas.
   */
  private async executeLocalSimulation(
    request: OrderRequest,
    coin: string,
    side: 'BUY' | 'SELL'
  ): Promise<ExecutionResult> {
    const currentPrice = await this.getMarketPrice(request.simbolo);
    const rawTargetSize = request.tamano ?? (request as any).cantidad ?? 0;
    // Si el tamaño viene expresado en nocional USD (ej. > 5 en BTC), convertirlo a cantidad nominal de la criptomoneda
    const targetSize = currentPrice > 0 && rawTargetSize > 5
      ? Number((rawTargetSize / currentPrice).toFixed(4))
      : rawTargetSize;
    const limitPrice = request.precioLimite ?? (request as any).precio;
    const execPrice = request.tipo === 'LIMIT' && limitPrice ? limitPrice : currentPrice;
    const clientOid = request.clientOid || `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const orderId = `hl_sim_${Date.now()}`;

    // Actualizar posición simulada
    const existing = this.simPositions.get(coin);
    if (existing) {
      if ((existing.side === 'long' && side === 'SELL') || (existing.side === 'short' && side === 'BUY')) {
        const netSize = existing.size - targetSize;
        if (netSize <= 0.00001) {
          this.simPositions.delete(coin);
        } else {
          existing.size = netSize;
        }
      } else {
        existing.size += targetSize;
      }
    } else {
      this.simPositions.set(coin, {
        symbol: coin,
        size: targetSize,
        entryPrice: execPrice,
        side: side === 'BUY' ? 'long' : 'short',
        timestamp: Date.now()
      });
    }

    return {
      exitoso: true,
      orderId,
      clientOrderId: clientOid,
      precioEjecutado: execPrice,
      tamanoEjecutado: targetSize,
      comisionUSD: targetSize * execPrice * 0.00035,
      mensajeRespuesta: 'Orden ejecutada en Simulación DEX Hyperliquid (Paper Trading con precios L1 en vivo)',
      reintentosRealizados: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Consulta el saldo disponible (withdrawable USDC) en Hyperliquid.
   */
  public async getBalance(_asset: string = 'USDC'): Promise<number> {
    if (!this.isConfigured() || !this.walletAddress || !this.infoClient) {
      return this.simBalance > 0 ? this.simBalance : 1000;
    }

    try {
      console.log(`[HyperliquidBroker] Consultando estado de cuenta en Hyperliquid para ${this.walletAddress}...`);
      const state = await this.infoClient.clearinghouseState({ user: this.walletAddress });

      if (state && state.withdrawable !== undefined) {
        const avail = parseFloat(state.withdrawable);
        if (!isNaN(avail) && avail > 0) {
          console.log(`[HyperliquidBroker] Balance disponible en Hyperliquid: $${avail.toFixed(2)} USDC`);
          return avail;
        }
      }

      if (state && state.marginSummary && state.marginSummary.accountValue) {
        const accVal = parseFloat(state.marginSummary.accountValue);
        if (!isNaN(accVal) && accVal > 0) {
          return accVal;
        }
      }

      // Si estamos en Testnet y la wallet tiene 0 USDC on-chain (faucet bloqueado sin Mainnet),
      // activamos saldo virtual de Paper Trading de 1.000$ para permitir pruebas continuas sin bloqueo.
      if (!this.isReal()) {
        console.log(`[HyperliquidBroker] Testnet: Wallet sin balance on-chain en Hyperliquid. Activando saldo de simulación DEX: $1,000 USD.`);
        return this.simBalance > 0 ? this.simBalance : 1000;
      }

      return 0;
    } catch (err: any) {
      console.warn(`[HyperliquidBroker] Aviso al consultar balance: ${err.message}. Retornando fallback.`);
      return !this.isReal() ? 1000 : 0;
    }
  }

  /**
   * Consulta la posición activa actual para un símbolo en Hyperliquid.
   */
  public async getPosition(symbol: string): Promise<PositionInfo | null> {
    const coin = this.normalizeCoin(symbol);

    // 1. Si hay posición on-chain real, retornarla
    if (this.isConfigured() && this.walletAddress && this.infoClient) {
      try {
        const onChain = await this.getOnChainPosition(symbol);
        if (onChain) return onChain;
      } catch {
        // Silencioso
      }
    }

    // 2. Si no hay posición on-chain, verificar simulación en memoria (Paper Trading DEX)
    const sim = this.simPositions.get(coin);
    if (!sim || sim.size <= 0) return null;
    const currentPrice = await this.getMarketPrice(symbol);
    const pnl = sim.side === 'long'
      ? (currentPrice - sim.entryPrice) * sim.size
      : (sim.entryPrice - currentPrice) * sim.size;

    return {
      size: sim.size,
      entryPrice: sim.entryPrice,
      unrealizedPnl: pnl,
      holdSide: sim.side,
      rawSymbol: coin,
      marginCoin: 'USDC'
    };
  }

  /**
   * Cierra de forma inmediata cualquier posición abierta para el símbolo en Hyperliquid.
   */
  public async closePosition(symbol: string): Promise<ExecutionResult> {
    const pos = await this.getPosition(symbol);
    if (!pos || pos.size <= 0) {
      return {
        exitoso: true,
        orderId: 'no_pos_to_close',
        clientOrderId: 'no_pos_to_close',
        precioEjecutado: 0,
        tamanoEjecutado: 0,
        mensajeRespuesta: 'No hay posición abierta para cerrar.',
        reintentosRealizados: 0,
        timestamp: Date.now()
      };
    }

    const closeSide = pos.holdSide === 'long' ? 'SELL' : 'BUY';
    console.log(`[HyperliquidBroker] Cerrando posición abierta de ${pos.size} ${pos.rawSymbol} (${pos.holdSide}) a mercado...`);

    return this.executeOrder({
      simbolo: symbol,
      temporalidad: '15m',
      lado: closeSide,
      tipo: 'MARKET',
      tamano: pos.size,
      timestamp: Date.now()
    } as any);
  }

  /**
   * Consulta el estado de una orden mediante Client Order ID en Hyperliquid.
   */
  public async getOrderByClientOid(_symbol: string, clientOid: string): Promise<OrderQueryInfo | null> {
    if (!this.infoClient || !this.walletAddress) return null;

    try {
      const cloid = this.generateCloid(clientOid);
      const status = await this.infoClient.orderStatus({
        user: this.walletAddress,
        oid: cloid
      });

      if (!status || (status as any).status === 'unknownOid') {
        return null;
      }

      const orderData = (status as any).order;
      const innerStatus = orderData?.status || 'open';

      return {
        clientOid,
        status: innerStatus,
        state: innerStatus === 'filled' ? 'filled' : innerStatus === 'open' ? 'live' : 'canceled',
        order: (status as any).order
      };
    } catch {
      return null;
    }
  }

  /**
   * Configura el apalancamiento objetivo en Hyperliquid.
   */
  public async setLeverage(symbol: string, leverage: number, _holdSide?: 'long' | 'short'): Promise<boolean> {
    if (!this.exchangeClient) return true;

    try {
      const coin = this.normalizeCoin(symbol);
      const converter = await this.getConverter();
      const assetId = converter?.getAssetId(coin) ?? (coin === 'BTC' ? 3 : coin === 'ETH' ? 4 : 0);

      console.log(`[HyperliquidBroker] Configurando apalancamiento cross a ${leverage}x para ${coin} (Asset ${assetId})...`);

      const res = await this.exchangeClient.updateLeverage({
        asset: assetId,
        isCross: true,
        leverage
      });

      return res.status === 'ok';
    } catch (err: any) {
      console.warn(`[HyperliquidBroker] Aviso al ajustar apalancamiento a ${leverage}x: ${err.message}`);
      return false;
    }
  }

  /**
   * Consulta el precio medio actual de mercado para un símbolo.
   */
  public async getMarketPrice(symbol: string): Promise<number> {
    const coin = this.normalizeCoin(symbol);
    if (!this.infoClient) return 0;

    try {
      const mids = await this.infoClient.allMids();
      if (mids && mids[coin]) {
        const px = parseFloat(mids[coin]);
        if (!isNaN(px) && px > 0) return px;
      }
      return 0;
    } catch (err: any) {
      console.warn(`[HyperliquidBroker] Error al obtener precio de mercado para ${coin}: ${err.message}`);
      return 0;
    }
  }

  /**
   * Consulta estadísticas de ticker en tiempo real.
   */
  public async getTicker(symbol: string): Promise<TickerInfo | null> {
    const coin = this.normalizeCoin(symbol);
    if (!this.infoClient) return null;

    try {
      const [meta, ctxs] = await this.infoClient.metaAndAssetCtxs();
      const idx = meta.universe.findIndex(u => u.name === coin);
      if (idx === -1 || !ctxs[idx]) {
        const px = await this.getMarketPrice(symbol);
        return {
          symbol,
          price: px,
          volume24h: 0,
          high24h: px * 1.02,
          low24h: px * 0.98,
          timestamp: Date.now()
        };
      }

      const ctx = ctxs[idx];
      const markPx = parseFloat(ctx.markPx) || 0;
      const dayNtlVlm = parseFloat(ctx.dayNtlVlm) || 0;

      return {
        symbol,
        price: markPx,
        volume24h: dayNtlVlm,
        high24h: markPx * 1.02,
        low24h: markPx * 0.98,
        timestamp: Date.now()
      };
    } catch (err: any) {
      console.warn(`[HyperliquidBroker] Error al obtener ticker para ${coin}: ${err.message}`);
      return null;
    }
  }
}
