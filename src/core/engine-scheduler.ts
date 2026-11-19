/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Orchestrator } from './orchestrator.ts';
import { Blackboard } from './blackboard.ts';
import { TechnicalAnalystAgent } from '../agents/technical/technical-agent.ts';
import { OrderFlowAgent } from '../agents/orderflow/orderflow-agent.ts';
import { CorrelationAgent } from '../agents/correlation/correlation-agent.ts';
import { LiquidationAgent } from '../agents/liquidation/liquidation-agent.ts';
import { DivergenceAgent } from '../agents/divergence/divergence-agent.ts';
import { SentimentAgent } from '../agents/sentiment/sentiment-agent.ts';
import { LearningAgent } from '../agents/learning/learning-agent.ts';
import { RiskManagerAgent } from '../agents/risk/risk-manager-agent.ts';
import { SupervisorAgent } from '../agents/supervisor/supervisor-agent.ts';
import { NewsAgent } from '../agents/news/news-agent.ts';
import { OnChainAgent } from '../agents/onchain/onchain-agent.ts';
import { OrderRouter } from '../execution/order-router.ts';
import { IExchangeBroker } from '../execution/brokers/types.ts';
import { BrokerFactory } from '../execution/brokers/broker-factory.ts';
import { ReconciliationEngine } from '../execution/reconciliation-engine.ts';
import { mapSymbol, getProductType } from '../execution/brokers/bitget-utils.ts';
import { RiskManagerAnalystOutput } from '../agents/risk/types.ts';
import { MarketStateSnapshot } from '../types.ts';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';

export type EngineLifecycleState =
  | 'STOPPED'
  | 'STARTING'
  | 'RECONCILING'
  | 'READY'
  | 'TRADING'
  | 'FAILED_SAFE';

/**
 * EngineScheduler — Ciclo de Producción con Flujo de Órdenes, Correlaciones, Liquidación, Divergencias, Sentimiento, Noticias, On-Chain y Aprendizaje Bayesiano.
 */
export class EngineScheduler {
  private static instance: EngineScheduler | null = null;

  private orchestrator: Orchestrator;
  private blackboard: Blackboard;
  private orderRouter: OrderRouter;
  private broker: IExchangeBroker;

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private state: EngineLifecycleState = 'STOPPED';
  private cycleInProgress = false;

  private symbol = 'BTC/USDT';
  private timeframe = '15m';
  private intervalMs = 60_000; // 1 minuto por defecto entre ciclos
  private lastCycleAt: number | null = null;
  private lastCycleError: string | null = null;
  private totalCycles = 0;
  private totalDispatches = 0;

  private constructor() {
    this.orchestrator = Orchestrator.getInstance();
    this.blackboard = Blackboard.getInstance();
    this.broker = BrokerFactory.getDefaultBroker();
    this.orderRouter = new OrderRouter(this.broker);
    this.registerActiveAgents();
  }

  public static getInstance(): EngineScheduler {
    if (!EngineScheduler.instance) {
      EngineScheduler.instance = new EngineScheduler();
    }
    return EngineScheduler.instance;
  }

  /**
   * Registra los 11 agentes activos en el pipeline del orquestador.
   */
  private registerActiveAgents(): void {
    this.orchestrator.registerAgent(new TechnicalAnalystAgent());
    this.orchestrator.registerAgent(new OrderFlowAgent());
    this.orchestrator.registerAgent(new CorrelationAgent());
    this.orchestrator.registerAgent(new LiquidationAgent());
    this.orchestrator.registerAgent(new DivergenceAgent());
    this.orchestrator.registerAgent(new SentimentAgent());
    this.orchestrator.registerAgent(new NewsAgent());
    this.orchestrator.registerAgent(new OnChainAgent());
    this.orchestrator.registerAgent(new LearningAgent());
    this.orchestrator.registerAgent(new RiskManagerAgent());
    this.orchestrator.registerAgent(new SupervisorAgent());
  }

  public getStatus() {
    const activeExchange = (process.env.ACTIVE_EXCHANGE as 'bitget' | 'kraken' | 'hyperliquid') || 'bitget';
    const isReal = activeExchange === 'hyperliquid'
      ? process.env.HYPERLIQUID_MODO_REAL === 'true'
      : activeExchange === 'kraken'
        ? process.env.KRAKEN_MODO_REAL === 'true'
        : process.env.BITGET_MODO_REAL === 'true';
    return {
      running: this.running,
      state: this.state,
      modo: isReal ? 'REAL' : 'PAPER/TESTNET',
      exchange: this.broker?.exchangeId || activeExchange,
      symbol: this.symbol,
      timeframe: this.timeframe,
      intervalMs: this.intervalMs,
      lastCycleAt: this.lastCycleAt,
      lastCycleError: this.lastCycleError,
      totalCycles: this.totalCycles,
      totalDispatches: this.totalDispatches,
      registeredAgents: [
        'TechnicalAnalyst',
        'OrderFlow',
        'Correlation',
        'Liquidation',
        'Divergence',
        'Sentiment',
        'News',
        'OnChain',
        'Learning',
        'RiskManager',
        'Supervisor',
      ],
    };
  }

  /**
   * Arranca el bucle tras la reconciliación inicial obligatoria.
   * Flujo de estados: STOPPED -> STARTING -> RECONCILING -> READY -> TRADING (o FAILED_SAFE).
   */
  public async start(params: {
    symbol?: string;
    timeframe?: string;
    intervalMs?: number;
    confirmLive?: boolean;
  }): Promise<{ ok: boolean; message: string; state: EngineLifecycleState }> {
    const activeExchange = (process.env.ACTIVE_EXCHANGE as 'bitget' | 'kraken' | 'hyperliquid') || 'bitget';
    const isReal = activeExchange === 'hyperliquid'
      ? process.env.HYPERLIQUID_MODO_REAL === 'true'
      : activeExchange === 'kraken'
        ? process.env.KRAKEN_MODO_REAL === 'true'
        : process.env.BITGET_MODO_REAL === 'true';

    if (isReal && params.confirmLive !== true) {
      this.state = 'FAILED_SAFE';
      return {
        ok: false,
        message:
          'Entorno REAL configurado pero no se recibió confirmLive=true. ' +
          'Arranque bloqueado por seguridad.',
        state: this.state,
      };
    }

    if (this.running && this.state === 'TRADING') {
      if ((params.symbol && params.symbol !== this.symbol) || (params.timeframe && params.timeframe !== this.timeframe)) {
        this.symbol = params.symbol || this.symbol;
        this.timeframe = params.timeframe || this.timeframe;
        console.log(`[EngineScheduler] Configuración de trading actualizada en caliente: ${this.symbol} (${this.timeframe})`);
        return {
          ok: true,
          message: `Configuración actualizada a ${this.symbol} (${this.timeframe}).`,
          state: this.state,
        };
      }
      return { ok: false, message: 'El motor ya está en ejecución.', state: this.state };
    }

    // Refrescar broker y order router con el adaptador actualmente activo
    this.broker = BrokerFactory.getDefaultBroker();
    this.orderRouter = new OrderRouter(this.broker);

    this.symbol = params.symbol || this.symbol;
    this.timeframe = params.timeframe || this.timeframe;
    this.intervalMs = params.intervalMs || this.intervalMs;
    this.lastCycleError = null;

    // Transición de estados de arranque
    this.state = 'STARTING';
    console.log(`[EngineScheduler] [STARTUP] Inicializando motor... Estado: ${this.state}`);
    this.state = 'RECONCILING';
    console.log(`[EngineScheduler] [STARTUP] Ejecutando reconciliación obligatoria de arranque para ${this.symbol}... Estado: ${this.state}`);

    try {
      // 1. Reconciliación de posiciones/trades de arranque entre Exchange y DB
      const reconciliationEngine = ReconciliationEngine.getInstance();
      const reconcileOk = await reconciliationEngine.reconcileOnStartup(this.broker, this.symbol);

      if (!reconcileOk) {
        this.state = 'FAILED_SAFE';
        this.running = false;
        console.error('[EngineScheduler] [FAILED_SAFE] Falló la reconciliación de arranque. Motor bloqueado.');
        return {
          ok: false,
          message: 'Fallo crítico en la reconciliación de arranque. Motor en FAILED_SAFE. Trading bloqueado.',
          state: this.state,
        };
      }

      // 2. Reconciliación de órdenes no resueltas en OrderManager
      await this.orderRouter.getOrderManager().loadAndResolveUnresolvedOrders();

      // Transición a READY y luego TRADING
      this.state = 'READY';
      console.log(`[EngineScheduler] [STARTUP] Reconciliación completada con éxito. Estado: ${this.state}`);

      this.running = true;
      this.state = 'TRADING';

      console.log(
        `[EngineScheduler] Arrancando ciclo (${isReal ? 'REAL' : 'PAPER/TESTNET'}) [Broker: ${this.broker.exchangeId}] ` +
          `para ${this.symbol} (${this.timeframe}) cada ${this.intervalMs}ms. Estado: ${this.state}`
      );

      // Disparar un primer ciclo inmediatamente
      await this.runCycle();
      this.intervalHandle = setInterval(() => this.runCycle(), this.intervalMs);

      return {
        ok: true,
        message: `Motor arrancado y reconciliado con éxito en modo ${isReal ? 'REAL' : 'PAPER/TESTNET'} (${this.broker.nombreBroker}).`,
        state: this.state,
      };
    } catch (startupError: any) {
      this.state = 'FAILED_SAFE';
      this.running = false;
      const msg = startupError?.message || String(startupError);
      console.error(`[EngineScheduler] [FAILED_SAFE] Excepción crítica durante el arranque: ${msg}`);
      return {
        ok: false,
        message: `Fallo durante el arranque: ${msg}. Motor en FAILED_SAFE.`,
        state: this.state,
      };
    }
  }

  public stop(): { ok: boolean; message: string; state: EngineLifecycleState } {
    if (!this.running && this.state === 'STOPPED') {
      return { ok: false, message: 'El motor no está en ejecución.', state: this.state };
    }
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    this.state = 'STOPPED';
    console.log('[EngineScheduler] Motor detenido.');
    return { ok: true, message: 'Motor detenido.', state: this.state };
  }

  /**
   * Obtiene un snapshot de mercado resiliente usando el broker activo o fallbacks públicos (Bitget / Kraken).
   */
  private async fetchMarketSnapshot(symbol: string): Promise<MarketStateSnapshot> {
    // 1. Intentar con el broker activo configurado
    try {
      if (this.broker && typeof this.broker.getTicker === 'function') {
        const t = await this.broker.getTicker(symbol);
        if (t && t.price > 0) {
          return {
            symbol: t.symbol || symbol,
            price: t.price,
            volume24h: t.volume24h,
            high24h: t.high24h,
            low24h: t.low24h,
            timestamp: t.timestamp || Date.now(),
          };
        }
      }
    } catch (brokerErr: any) {
      console.warn(`[EngineScheduler] Broker getTicker falló (${brokerErr.message}). Probando fallback...`);
    }

    // 2. Fallback: Bitget Market Ticker público
    try {
      const mappedSymbol = mapSymbol(symbol);
      const productType = getProductType();
      const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${mappedSymbol}&productType=${productType}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        if (json.code === '00000' && json.data && json.data.length > 0) {
          const t = json.data[0];
          return {
            symbol,
            price: parseFloat(t.lastPr),
            volume24h: parseFloat(t.baseVolume ?? t.volume24h ?? '0'),
            high24h: parseFloat(t.high24h ?? t.lastPr),
            low24h: parseFloat(t.low24h ?? t.lastPr),
            timestamp: Date.now(),
          };
        }
      }
    } catch (bitgetErr: any) {
      console.warn(`[EngineScheduler] Fallback Bitget falló (${bitgetErr.message}). Probando Kraken...`);
    }

    // 3. Fallback: Kraken Futures Ticker público
    try {
      const krakenRes = await fetch('https://futures.kraken.com/derivatives/api/v3/tickers');
      if (krakenRes.ok) {
        const json = await krakenRes.json();
        if (json.tickers && Array.isArray(json.tickers)) {
          const t = json.tickers.find((item: any) => item.symbol === 'PF_XBTUSD');
          if (t) {
            const price = parseFloat(t.last || t.markPrice || '0');
            if (price > 0) {
              return {
                symbol,
                price,
                volume24h: parseFloat(t.vol24h || t.volume || '0'),
                high24h: parseFloat(t.high24h || t.last || '0'),
                low24h: parseFloat(t.low24h || t.last || '0'),
                timestamp: Date.now(),
              };
            }
          }
        }
      }
    } catch (krakenErr: any) {
      console.warn(`[EngineScheduler] Fallback Kraken falló: ${krakenErr.message}`);
    }

    throw new Error(`[FAIL CLOSED] Imposible obtener cotización de mercado en vivo para ${symbol} en ningún feed.`);
  }

  /**
   * Un ciclo completo: dato de mercado -> agentes -> decisión -> despacho de orden si procede.
   */
  private async runCycle(): Promise<void> {
    if (this.state !== 'TRADING') {
      console.warn(`[EngineScheduler] Intento de ejecutar ciclo con motor fuera de estado TRADING (Estado actual: ${this.state}). Omitiendo.`);
      return;
    }

    if (this.cycleInProgress) {
      console.warn('[EngineScheduler] Ciclo anterior aún en curso. Se omite este disparo.');
      return;
    }
    this.cycleInProgress = true;
    const cycleStart = Date.now();
    const cycleId = `cycle_${Date.now()}`;

    try {
      const marketTick = await this.fetchMarketSnapshot(this.symbol);

      // 1. Ejecutar el pipeline real de agentes
      await this.orchestrator.triggerWorkflow(this.symbol, this.timeframe, marketTick, cycleId);

      // 2. Leer el resultado del RiskManager desde el Blackboard
      const snapshot = this.blackboard.getSnapshot(this.symbol, this.timeframe);
      const riskAssessment = snapshot.assessments['RiskManager'];

      if (!riskAssessment || !riskAssessment.value) {
        await this.logCycle('WARN', 'RiskManager no produjo ningún assessment en este ciclo. No se despacha ninguna orden.');
        this.totalCycles += 1;
        this.lastCycleAt = Date.now();
        return;
      }

      const riskOutput = riskAssessment.value.data as RiskManagerAnalystOutput;

      // 3. Despachar SOLO si el firewall de riesgo lo autoriza.
      if (riskOutput.safe_to_operate) {
        const resultado = await this.orderRouter.dispatchOrder(riskOutput, 10, cycleId);
        this.totalDispatches += 1;
        await this.logCycle(
          resultado.exitoso ? 'INFO' : 'WARN',
          `Despacho de orden ${resultado.exitoso ? 'EXITOSO' : 'RECHAZADO/FALLIDO'}: ${resultado.mensajeRespuesta}`,
          { resultado, riskOutput }
        );
      } else {
        await this.logCycle(
          'DEBUG',
          `RiskManager bloqueó la operación: ${riskOutput.rejection_reason || 'sin razón especificada'}.`,
          { riskOutput }
        );
      }

      this.totalCycles += 1;
      this.lastCycleAt = Date.now();
      this.lastCycleError = null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.lastCycleError = msg;
      console.error(`[EngineScheduler] Error durante el ciclo:`, msg);
      await this.logCycle('ERROR', `Fallo en el ciclo del motor: ${msg}`);
    } finally {
      this.cycleInProgress = false;
      console.log(`[EngineScheduler] Ciclo completado en ${Date.now() - cycleStart}ms.`);
    }
  }

  private async logCycle(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, payload: any = null): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        level,
        agentName: 'EngineScheduler',
        message,
        payload: payload ? JSON.parse(JSON.stringify(payload)) : null,
      });
    } catch (dbError) {
      console.error('[EngineScheduler] Fallo escribiendo audit log:', dbError);
      console.log(`[${level}] [EngineScheduler] ${message}`);
    }
  }
}
