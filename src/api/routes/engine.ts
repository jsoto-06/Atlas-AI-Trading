/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { EngineScheduler } from '../../core/engine-scheduler.ts';
import { BacktestEngine } from '../../backtesting/engine.ts';
import { OrderRouter } from '../../execution/order-router.ts';
import { Blackboard } from '../../core/blackboard.ts';

/**
 * Plugin de rutas Fastify para el control del Motor de Ciclo Mínimo y Backtesting.
 *
 * Estas rutas son el único disparador administrativo del bucle real Technical+RiskManager+
 * Supervisor+OrderRouter y de la simulación determinista Walk-Forward.
 */
export const engineRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const engine = EngineScheduler.getInstance();

  /**
   * Mismo middleware de autenticación fail-safe usado en telemetry.ts.
   */
  const adminAuthHook = async (request: any, reply: any) => {
    const token = process.env.ADMIN_API_TOKEN;
    if (!token || token.trim() === '') {
      fastify.log.warn('ADMIN_API_TOKEN no está configurado. Rechazando petición de forma preventiva (fail-safe).');
      reply.status(401).send({ error: 'Unauthorized', message: 'Acceso denegado.' });
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Acceso denegado.' });
      return;
    }

    const providedToken = authHeader.substring(7).trim();
    if (providedToken !== token.trim()) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Acceso denegado.' });
      return;
    }
  };

  /**
   * GET /api/v1/engine/status
   */
  fastify.get('/status', { preHandler: adminAuthHook }, async (request, reply) => {
    return reply.send(engine.getStatus());
  });

  /**
   * POST /api/v1/engine/start
   * Body: { symbol?: string, timeframe?: string, intervalMs?: number, confirmLive?: boolean }
   *
   * Si BITGET_MODO_REAL=true en el entorno, confirmLive debe ser explícitamente true
   * o el arranque se rechaza. Esto es intencional: operar en real nunca debe ser
   * el resultado de una llamada por defecto.
   */
  fastify.post('/start', { preHandler: adminAuthHook }, async (request, reply) => {
    const body = (request.body as any) || {};
    const result = engine.start({
      symbol: body.symbol,
      timeframe: body.timeframe,
      intervalMs: body.intervalMs,
      confirmLive: body.confirmLive === true,
    });
    return reply.status(result.ok ? 200 : 409).send(result);
  });

  /**
   * POST /api/v1/engine/stop
   */
  fastify.post('/stop', { preHandler: adminAuthHook }, async (request, reply) => {
    const result = engine.stop();
    return reply.status(result.ok ? 200 : 409).send(result);
  });

  /**
   * POST /api/v1/engine/test-order
   * Body: { symbol?: string, side?: 'BUY' | 'SELL', sizeUsd?: number }
   *
   * Fuerza el envío de una orden de prueba a Bitget (Demo/Real) usando el OrderRouter y BitgetBroker.
   */
  fastify.post('/test-order', { preHandler: adminAuthHook }, async (request, reply) => {
    try {
      const body = (request.body as any) || {};
      const symbol = body.symbol || 'BTC/USDT';
      const side = (body.side === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';
      const sizeUsd = parseFloat(body.sizeUsd) || 10;
      const timeframe = '15m';

      // 1. Escribir decisión del Supervisor en Blackboard
      const blackboard = Blackboard.getInstance();
      blackboard.writeAssessment(symbol, timeframe, {
        agentName: 'Supervisor',
        timestamp: Date.now(),
        score: side === 'BUY' ? 50 : -50,
        confidence: 0.90,
        data: {
          simbolo: symbol,
          temporalidad: timeframe,
          timestamp: Date.now(),
          composite_score: side === 'BUY' ? 50 : -50,
          final_decision: side,
          weight_distribution: {},
          confidence_level: 0.90,
          justificacion_cognitiva: `Orden de prueba manual activada por el usuario (${side}).`
        },
        justification: `Orden de prueba manual activada (${side}).`
      });

      // 2. Invocación de OrderRouter
      const router = new OrderRouter();
      const result = await router.dispatchOrder({
        simbolo: symbol,
        temporalidad: timeframe,
        timestamp: Date.now(),
        safe_to_operate: true,
        max_position_size: sizeUsd,
        calculated_stop_loss: 0,
        calculated_take_profit: 0,
        trailing_stop_activation: 0,
        kelly_fraction: 0.015,
        risk_reward_ratio: 2.0,
        rejection_reason: null,
        justificacionConsolidada: `Orden de prueba manual solicitada.`
      });

      return reply.status(result.exitoso ? 200 : 400).send({
        exitoso: result.exitoso,
        resultado: result
      });
    } catch (error: any) {
      fastify.log.error(`Error en POST /engine/test-order: ${error.message}`);
      return reply.status(500).send({
        exitoso: false,
        error: 'Internal Server Error',
        message: `Error al despachar orden de prueba: ${error.message || error}`
      });
    }
  });

  /**
   * POST /api/v1/engine/backtest
   * Body: { symbol?: string, days?: number, timeframe?: string, initialBalance?: number, feeRate?: number, slippage?: number }
   *
   * Ejecuta una simulación determinista Walk-Forward sobre velas históricas reales
   * usando el algoritmo de la Fase 1 congelada (TechnicalAnalyst + RiskManager + Supervisor).
   */
  fastify.post('/backtest', { preHandler: adminAuthHook }, async (request, reply) => {
    try {
      const body = (request.body as any) || {};
      const symbol = body.symbol || 'BTC/USDT';
      const days = Math.min(30, Math.max(1, parseInt(body.days) || 7));
      const initialBalance = parseFloat(body.initialBalance) || 10000;
      const feeRate = parseFloat(body.feeRate) || 0.0006; // 0.06% por defecto
      const slippage = parseFloat(body.slippage) || 0.0005; // 0.05% por defecto

      const endTime = Date.now();
      const startTime = endTime - (days * 24 * 60 * 60 * 1000);

      const backtester = new BacktestEngine();
      const result = await backtester.runBacktest({
        symbol,
        start_time: startTime,
        end_time: endTime,
        initial_balance: initialBalance,
        fee_rate: feeRate,
        slippage_simulation_factor: slippage
      });

      return reply.status(200).send({
        exitoso: true,
        mensaje: `Backtest Walk-Forward completado para ${symbol} (${days} días).`,
        resultado: result
      });
    } catch (error: any) {
      fastify.log.error(`Error en POST /engine/backtest: ${error.message}`);
      return reply.status(500).send({
        exitoso: false,
        error: 'Internal Server Error',
        message: `Fallo en el cálculo del backtest: ${error.message || error}`
      });
    }
  });
};

