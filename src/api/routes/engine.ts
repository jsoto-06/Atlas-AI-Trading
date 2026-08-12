/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { EngineScheduler } from '../../core/engine-scheduler.ts';
import { BacktestEngine } from '../../backtesting/engine.ts';
import { OrderRouter } from '../../execution/order-router.ts';
import { BitgetBroker } from '../../execution/brokers/bitget-broker.ts';
import { Blackboard } from '../../core/blackboard.ts';
import { RiskManagerAgent } from '../../agents/risk/risk-manager-agent.ts';
import { RiskManagerAnalystOutput } from '../../agents/risk/types.ts';
import crypto from 'crypto';

/**
 * Plugin de rutas Fastify para el control del Motor de Ciclo Mínimo y Backtesting.
 */
export const engineRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const engine = EngineScheduler.getInstance();

  /**
   * Middleware de autenticación con comparación en tiempo constante (constant-time) para prevenir ataques de sincronización.
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
    const tokenBuf = Buffer.from(token.trim());
    const providedBuf = Buffer.from(providedToken);

    if (tokenBuf.length !== providedBuf.length || !crypto.timingSafeEqual(tokenBuf, providedBuf)) {
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
   */
  fastify.post('/start', { preHandler: adminAuthHook }, async (request, reply) => {
    const body = (request.body as any) || {};
    const result = await engine.start({
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
   * CRITICAL 3: Bloqueado estrictamente en producción.
   * En entorno TEST no puede hacer bypass del RiskManager: debe invocar la validación real del RiskManagerAgent.
   */
  fastify.post('/test-order', { preHandler: adminAuthHook }, async (request, reply) => {
    // 1. Bloqueo estricto en producción
    if (process.env.NODE_ENV === 'production') {
      return reply.status(403).send({
        exitoso: false,
        error: 'FORBIDDEN_IN_PRODUCTION',
        message: 'El endpoint /test-order está estrictamente desactivado en entornos de producción.'
      });
    }

    try {
      const body = (request.body as any) || {};
      const symbol = body.symbol || 'BTC/USDT';
      const side = (body.side === 'SELL' || body.side === 'SHORT' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';
      const timeframe = '15m';
      const cycleId = `test_order_${Date.now()}`;

      // 2. Registrar decisión en Blackboard para Supervisor (desactivando maxDataAgeMs con 0 para orden manual)
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
          confidence_level: 0.90,
          justificacion_cognitiva: `Petición de orden de prueba manual.`
        },
        justification: `Petición manual de prueba (${side}).`
      }, 1800000, undefined, 0);

      // 3. Ejecutar obligatoriamente el análisis del RiskManagerAgent (NO BYPASS)
      const riskAgent = new RiskManagerAgent();
      await riskAgent.analyze(symbol, timeframe);

      const snapshot = blackboard.getSnapshot(symbol, timeframe);
      const riskAssessment = snapshot.assessments['RiskManager'];

      if (!riskAssessment || !riskAssessment.value || !riskAssessment.value.data) {
        return reply.status(400).send({
          exitoso: false,
          error: 'RISK_MANAGER_UNAVAILABLE',
          message: 'El Gestor de Riesgos no produjo evaluación. Orden bloqueada por seguridad (Fail-Closed).'
        });
      }

      const riskOutput = riskAssessment.value.data as RiskManagerAnalystOutput;

      if (!riskOutput.safe_to_operate) {
        return reply.status(400).send({
          exitoso: false,
          error: 'BLOCKED_BY_RISK_MANAGER',
          message: `El Gestor de Riesgos rechazó la orden de prueba: ${riskOutput.rejection_reason || 'Riesgo inaceptable'}`
        });
      }

      // 4. Invocación segura de OrderRouter atravesando la cadena normal
      const router = new OrderRouter();
      const result = await router.dispatchOrder(riskOutput, 10, cycleId);

      return reply.status(result.exitoso ? 200 : 400).send({
        exitoso: result.exitoso,
        resultado: result
      });
    } catch (error: any) {
      fastify.log.error(`Error en POST /engine/test-order: ${error.message}`);
      return reply.status(500).send({
        exitoso: false,
        error: 'Internal Server Error',
        message: `Error al procesar orden de prueba: ${error.message || error}`
      });
    }
  });

  /**
   * POST /api/v1/engine/close-position
   */
  fastify.post('/close-position', { preHandler: adminAuthHook }, async (request, reply) => {
    try {
      const body = (request.body as any) || {};
      const symbol = body.symbol || 'BTC/USDT';
      const broker = new BitgetBroker();
      const result = await broker.closePosition(symbol);

      return reply.status(result.exitoso ? 200 : 400).send({
        exitoso: result.exitoso,
        resultado: result
      });
    } catch (error: any) {
      fastify.log.error(`Error en POST /engine/close-position: ${error.message}`);
      return reply.status(500).send({
        exitoso: false,
        error: 'Internal Server Error',
        message: `Error al cerrar posición en Bitget: ${error.message || error}`
      });
    }
  });

  /**
   * POST /api/v1/engine/backtest
   */
  fastify.post('/backtest', { preHandler: adminAuthHook }, async (request, reply) => {
    try {
      const body = (request.body as any) || {};
      const symbol = body.symbol || 'BTC/USDT';
      const days = Math.min(30, Math.max(1, parseInt(body.days) || 7));
      const initialBalance = parseFloat(body.initialBalance) || 10000;
      const feeRate = parseFloat(body.feeRate) || 0.0006;
      const slippage = parseFloat(body.slippage) || 0.0005;

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
