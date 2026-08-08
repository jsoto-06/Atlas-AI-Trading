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
import { OrderRouter } from '../execution/order-router.ts';
import { BitgetBroker } from '../execution/brokers/bitget-broker.ts';
import { mapSymbol, getProductType } from '../execution/brokers/bitget-utils.ts';
import { RiskManagerAnalystOutput } from '../agents/risk/types.ts';
import { MarketStateSnapshot } from '../types.ts';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';

/**
 * EngineScheduler — Ciclo de Producción con Flujo de Órdenes, Correlaciones, Liquidación, Divergencias, Sentimiento y Aprendizaje Bayesiano.
 */
export class EngineScheduler {
  private static instance: EngineScheduler | null = null;

  private orchestrator: Orchestrator;
  private blackboard: Blackboard;
  private orderRouter: OrderRouter;
  private broker: BitgetBroker;

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
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
    this.broker = new BitgetBroker();
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
   * Registra los agentes activos en la producción (TechnicalAnalyst, OrderFlow, Correlation, Liquidation, Divergence, Sentiment, Learning, RiskManager, Supervisor).
   */
  private registerActiveAgents(): void {
    this.orchestrator.registerAgent(new TechnicalAnalystAgent());
    this.orchestrator.registerAgent(new OrderFlowAgent());
    this.orchestrator.registerAgent(new CorrelationAgent());
    this.orchestrator.registerAgent(new LiquidationAgent());
    this.orchestrator.registerAgent(new DivergenceAgent());
    this.orchestrator.registerAgent(new SentimentAgent());
    this.orchestrator.registerAgent(new LearningAgent());
    this.orchestrator.registerAgent(new RiskManagerAgent());
    this.orchestrator.registerAgent(new SupervisorAgent());
  }

  public getStatus() {
    const modoReal = process.env.BITGET_MODO_REAL === 'true';
    return {
      running: this.running,
      modo: modoReal ? 'REAL' : 'PAPER/TESTNET',
      symbol: this.symbol,
      timeframe: this.timeframe,
      intervalMs: this.intervalMs,
      lastCycleAt: this.lastCycleAt,
      lastCycleError: this.lastCycleError,
      totalCycles: this.totalCycles,
      totalDispatches: this.totalDispatches,
      registeredAgents: ['TechnicalAnalyst', 'OrderFlow', 'Correlation', 'Liquidation', 'Divergence', 'Sentiment', 'Learning', 'RiskManager', 'Supervisor'],
    };
  }

  /**
   * Arranca el bucle. Guarda de seguridad: si BITGET_MODO_REAL=true, exige
   * confirmLive=true explícito en la llamada. Esto obliga a que operar en real
   * sea una decisión consciente y no un accidente de configuración por defecto.
   */
  public start(params: {
    symbol?: string;
    timeframe?: string;
    intervalMs?: number;
    confirmLive?: boolean;
  }): { ok: boolean; message: string } {
    const modoReal = process.env.BITGET_MODO_REAL === 'true';

    if (modoReal && params.confirmLive !== true) {
      return {
        ok: false,
        message:
          'BITGET_MODO_REAL=true pero no se recibió confirmLive=true. ' +
          'Arranque bloqueado por seguridad. El plan acordado exige semanas en paper/testnet antes de operar en real.',
      };
    }

    if (this.running) {
      return { ok: false, message: 'El motor ya está en ejecución.' };
    }

    this.symbol = params.symbol || this.symbol;
    this.timeframe = params.timeframe || this.timeframe;
    this.intervalMs = params.intervalMs || this.intervalMs;

    this.running = true;
    this.lastCycleError = null;

    console.log(
      `[EngineScheduler] Arrancando ciclo mínimo (${modoReal ? 'REAL' : 'PAPER/TESTNET'}) ` +
        `para ${this.symbol} (${this.timeframe}) cada ${this.intervalMs}ms.`
    );

    // Disparar un primer ciclo inmediatamente, sin esperar al primer intervalo
    this.runCycle();
    this.intervalHandle = setInterval(() => this.runCycle(), this.intervalMs);

    return { ok: true, message: `Motor arrancado en modo ${modoReal ? 'REAL' : 'PAPER/TESTNET'}.` };
  }

  public stop(): { ok: boolean; message: string } {
    if (!this.running) {
      return { ok: false, message: 'El motor no está en ejecución.' };
    }
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    console.log('[EngineScheduler] Motor detenido.');
    return { ok: true, message: 'Motor detenido.' };
  }

  /**
   * Obtiene un ticker público de Bitget para construir el MarketStateSnapshot
   * que el Orchestrator necesita para iniciar el ciclo de agentes.
   */
  private async fetchMarketSnapshot(symbol: string): Promise<MarketStateSnapshot> {
    const cleanSymbol = symbol.replace('/', '').toUpperCase();
    const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${cleanSymbol}&productType=USDT-FUTURES`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fallo HTTP obteniendo ticker de Bitget: ${response.status}`);
    }
    const json = await response.json();
    if (json.code !== '00000' || !json.data || json.data.length === 0) {
      throw new Error(`Respuesta inválida de ticker Bitget: ${json.msg || 'sin datos'}`);
    }

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

  /**
   * Un ciclo completo: dato de mercado -> agentes (Technical, RiskManager, Supervisor) ->
   * decisión -> despacho de orden si procede. Esta función es el único lugar del sistema
   * que llama a OrderRouter.dispatchOrder.
   */
  private async runCycle(): Promise<void> {
    if (this.cycleInProgress) {
      console.warn('[EngineScheduler] Ciclo anterior aún en curso. Se omite este disparo.');
      return;
    }
    this.cycleInProgress = true;
    const cycleStart = Date.now();

    try {
      const marketTick = await this.fetchMarketSnapshot(this.symbol);

      // 1. Ejecutar el pipeline real de agentes (Technical + RiskManager + Supervisor)
      await this.orchestrator.triggerWorkflow(this.symbol, this.timeframe, marketTick);

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
      //    dispatchOrder ya valida internamente contra la decisión del Supervisor en el Blackboard.
      if (riskOutput.safe_to_operate) {
        const resultado = await this.orderRouter.dispatchOrder(riskOutput);
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
