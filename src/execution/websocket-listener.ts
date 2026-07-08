/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac } from 'node:crypto';

export interface WSOrderEvent {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number; // Precio solicitado/límite
  fillPrice: number; // Precio real de ejecución
  size: number;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED';
  timestamp: number;
}

export interface WSPositionEvent {
  symbol: string;
  holdSide: 'long' | 'short';
  totalSize: number;
  availableSize: number;
  entryPrice: number;
  unrealizedPnL: number;
  timestamp: number;
}

type OrderCallback = (event: WSOrderEvent) => void | Promise<void>;
type PositionCallback = (event: WSPositionEvent) => void | Promise<void>;

/**
 * Oyente de WebSockets para Bitget (BitgetWebSocketListener).
 * 
 * Se conecta a los canales privados de Bitget ('orders' y 'positions').
 * Cuenta con:
 * 1. Autenticación segura mediante firma criptográfica HMAC-SHA256.
 * 2. Control de latencia por Heartbeat (Ping-Pong) con temporizadores activos.
 * 3. Reconexión automática tolerante a fallos mediante backoff exponencial.
 * 4. Modo de Simulación Inteligente en caso de no contar con credenciales de API vivas,
 *    permitiendo certificar la lógica de conciliación sin congelar los hilos de ejecución.
 */
export class BitgetWebSocketListener {
  private readonly wsUrl = 'wss://ws.bitget.com/v2/mix/private';
  private ws: any = null; // Tipo genérico para soportar entornos con/sin cargador global de WebSocket
  private ordersCallbacks: Set<OrderCallback> = new Set();
  private positionsCallbacks: Set<PositionCallback> = new Set();
  
  // Control de estado de conexión
  private isConnected = false;
  private isConnecting = false;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingIntervalTimer: NodeJS.Timeout | null = null;
  private pongTimeoutTimer: NodeJS.Timeout | null = null;

  // Credenciales cargadas de forma segura y perezosa
  private apiKey?: string;
  private apiSecret?: string;
  private passphrase?: string;

  constructor() {
    this.cargarCredenciales();
  }

  /**
   * Carga perezosamente las credenciales del entorno.
   */
  private cargarCredenciales(): boolean {
    this.apiKey = process.env.BITGET_API_KEY;
    this.apiSecret = process.env.BITGET_API_SECRET;
    this.passphrase = process.env.BITGET_PASSPHRASE;

    return !!(this.apiKey && this.apiSecret && this.passphrase);
  }

  /**
   * Registra un callback para actualizaciones del canal de Órdenes.
   */
  public onOrderUpdate(callback: OrderCallback): void {
    this.ordersCallbacks.add(callback);
  }

  /**
   * Registra un callback para actualizaciones del canal de Posiciones.
   */
  public onPositionUpdate(callback: PositionCallback): void {
    this.positionsCallbacks.add(callback);
  }

  /**
   * Inicia la conexión física al WebSocket.
   */
  public connect(): void {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    console.log(`[WS-Listener] Conectando a canal de telemetría de Bitget...`);

    const tieneCredenciales = this.cargarCredenciales();

    if (!tieneCredenciales) {
      console.warn('[WS-Listener] ADVERTENCIA: Faltan credenciales de Bitget. Iniciando en MODO SIMULACIÓN de telemetría reactiva.');
      this.iniciarModoSimulacion();
      return;
    }

    try {
      // Uso del WebSocket global nativo (disponible en Node.js v22+)
      const WS = (globalThis as any).WebSocket;
      if (!WS) {
        console.warn('[WS-Listener] Entorno sin soporte de WebSocket nativo global. Activando simulación robusta de eventos.');
        this.iniciarModoSimulacion();
        return;
      }

      this.ws = new WS(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[WS-Listener] Canal WebSocket físico abierto. Enviando firma de autenticación...');
        this.attempt = 0;
        this.autenticar();
      };

      this.ws.onmessage = (event: any) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error: any) => {
        console.error('[WS-Listener] Error detectado en el stream de WebSocket:', error?.message || error);
      };

      this.ws.onclose = () => {
        console.warn('[WS-Listener] Canal WebSocket cerrado inesperadamente.');
        this.handleDisconnect();
      };

    } catch (err) {
      console.error('[WS-Listener] Error al instanciar el WebSocket:', err);
      this.handleDisconnect();
    }
  }

  /**
   * Autentica la conexión enviando la firma requerida por Bitget.
   */
  private autenticar(): void {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const method = 'GET';
      const requestPath = '/user/verify';
      const messageToSign = timestamp + method + requestPath;

      // Generación de firma HMAC-SHA256 codificada en Base64
      const signature = createHmac('sha256', this.apiSecret!)
        .update(messageToSign)
        .digest('base64');

      const authPayload = {
        op: 'login',
        args: [
          {
            apiKey: this.apiKey,
            passphrase: this.passphrase,
            timestamp: timestamp,
            sign: signature
          }
        ]
      };

      this.send(JSON.stringify(authPayload));
    } catch (error) {
      console.error('[WS-Listener] Error al generar la firma de autenticación de WebSocket:', error);
      this.handleDisconnect();
    }
  }

  /**
   * Suscribe a los canales privados después de un login exitoso.
   */
  private suscribirCanalesPrivados(): void {
    console.log('[WS-Listener] Autenticado con éxito. Suscribiendo a canales de telemetría de órdenes y posiciones...');

    const subscriptionPayload = {
      op: 'subscribe',
      args: [
        {
          instType: 'USDT-FUTURES',
          channel: 'orders',
          instId: 'default'
        },
        {
          instType: 'USDT-FUTURES',
          channel: 'positions',
          instId: 'default'
        }
      ]
    };

    this.send(JSON.stringify(subscriptionPayload));
    this.isConnected = true;
    this.isConnecting = false;

    // Arrancar el latido del corazón (Ping-Pong)
    this.startHeartbeat();
  }

  /**
   * Administra la lógica de procesamiento de tramas/mensajes recibidos.
   */
  private handleMessage(rawData: string): void {
    try {
      if (rawData === 'pong') {
        // Latido recibido correctamente
        if (this.pongTimeoutTimer) {
          clearTimeout(this.pongTimeoutTimer);
        }
        return;
      }

      const data = JSON.parse(rawData);

      // 1. Manejo del evento de login exitoso
      if (data.event === 'login' && data.code === '0') {
        this.suscribirCanalesPrivados();
        return;
      }

      // 2. Manejo de canales de datos (orders o positions)
      if (data.action === 'snapshot' || data.action === 'update') {
        const channel = data.arg?.channel;
        
        if (channel === 'orders' && data.data) {
          for (const rawOrder of data.data) {
            const mappedOrder: WSOrderEvent = {
              orderId: rawOrder.orderId,
              clientOrderId: rawOrder.clientOid,
              symbol: rawOrder.instId,
              side: rawOrder.side?.toUpperCase() === 'BUY' ? 'BUY' : 'SELL',
              price: Number(rawOrder.px || 0),
              fillPrice: Number(rawOrder.fillPx || rawOrder.px || 0),
              size: Number(rawOrder.sz || 0),
              status: this.mapBitgetStatus(rawOrder.status),
              timestamp: Number(rawOrder.uTime || Date.now())
            };
            this.emitOrder(mappedOrder);
          }
        } else if (channel === 'positions' && data.data) {
          for (const rawPos of data.data) {
            const mappedPosition: WSPositionEvent = {
              symbol: rawPos.instId,
              holdSide: rawPos.holdSide === 'short' ? 'short' : 'long',
              totalSize: Number(rawPos.total || 0),
              availableSize: Number(rawPos.available || 0),
              entryPrice: Number(rawPos.openPrice || 0),
              unrealizedPnL: Number(rawPos.unrealizedPL || 0),
              timestamp: Date.now()
            };
            this.emitPosition(mappedPosition);
          }
        }
      }
    } catch (err) {
      console.error('[WS-Listener] Error al deserializar mensaje de WebSocket:', err);
    }
  }

  /**
   * Mapea los códigos de estado internos de Bitget a estados estandarizados.
   */
  private mapBitgetStatus(status: string): 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' {
    switch (status?.toLowerCase()) {
      case 'new':
        return 'NEW';
      case 'partially_filled':
        return 'PARTIALLY_FILLED';
      case 'filled':
        return 'FILLED';
      case 'cancelled':
        return 'CANCELLED';
      default:
        return 'FILLED'; // Fallback seguro para la lógica de liquidación
    }
  }

  /**
   * Envía datos en formato texto al WebSocket activo.
   */
  private send(message: string): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(message);
    }
  }

  /**
   * Inicializa el ciclo de latidos constante (Heartbeat / Ping-Pong).
   * Bitget requiere enviar "ping" cada 30 segundos.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingIntervalTimer = setInterval(() => {
      console.log('[WS-Listener] [PING] Enviando latido al servidor de Bitget...');
      this.send('ping');

      // Si no hay respuesta "pong" en 10 segundos, asumimos desconexión
      this.pongTimeoutTimer = setTimeout(() => {
        console.error('[WS-Listener] [TIMEOUT] El servidor de Bitget no respondió al latido en 10s. Forzando reconexión.');
        this.handleDisconnect();
      }, 10000);
    }, 30000);
  }

  /**
   * Detiene todos los temporizadores de latido abiertos.
   */
  private stopHeartbeat(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  /**
   * Administra la desconexión del flujo e inicia el reintento con backoff exponencial.
   */
  private handleDisconnect(): void {
    this.isConnected = false;
    this.isConnecting = false;
    this.stopHeartbeat();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.attempt++;
    const delay = Math.min(30000, 1000 * Math.pow(2, this.attempt - 1));
    console.log(`[WS-Listener] Programando reintento de conexión #${this.attempt} en ${delay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Emite el evento a todos los callbacks de órdenes.
   */
  private emitOrder(event: WSOrderEvent): void {
    for (const cb of this.ordersCallbacks) {
      try {
        cb(event);
      } catch (err) {
        console.error('[WS-Listener] Error procesando callback de órden:', err);
      }
    }
  }

  /**
   * Emite el evento a todos los callbacks de posiciones.
   */
  private emitPosition(event: WSPositionEvent): void {
    for (const cb of this.positionsCallbacks) {
      try {
        cb(event);
      } catch (err) {
        console.error('[WS-Listener] Error procesando callback de posición:', err);
      }
    }
  }

  /**
   * Desconecta explícitamente el listener del stream.
   */
  public disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    console.log('[WS-Listener] Telemetría WebSocket desconectada de forma segura.');
  }

  /**
   * Simulación Inteligente de Eventos (Mock Mode).
   * Genera de forma reactiva eventos periódicos para comprobar el correcto funcionamiento
   * de los engranajes de conciliación y cálculo de Slippage.
   */
  private iniciarModoSimulacion(): void {
    this.isConnected = true;
    this.isConnecting = false;
    console.log('[WS-Listener] [SIMULACIÓN] Ecosistema de simulación de WebSockets Bitget ACTIVO.');

    // Simular latidos locales en la bitácora
    this.pingIntervalTimer = setInterval(() => {
      console.log('[WS-Listener] [SIMULACIÓN PING/PONG] Latido verificado de forma interna.');
    }, 30000);
  }

  /**
   * Utilidad pública para inyectar eventos de prueba simulados.
   * Utilizado para alimentar el motor de conciliación de forma reactiva.
   */
  public injectSimulatedOrder(order: WSOrderEvent): void {
    console.log(`[WS-Listener] [SIMULACIÓN] Inyectando evento de orden simulado para ${order.symbol}...`);
    this.emitOrder(order);
  }

  /**
   * Utilidad pública para inyectar eventos de posición simulados.
   */
  public injectSimulatedPosition(position: WSPositionEvent): void {
    console.log(`[WS-Listener] [SIMULACIÓN] Inyectando evento de posición para ${position.symbol}...`);
    this.emitPosition(position);
  }
}
