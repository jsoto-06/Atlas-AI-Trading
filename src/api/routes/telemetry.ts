/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db } from '../../db/index.ts';
import { settings, learningPerformance, trades } from '../../db/schema.ts';
import { Blackboard } from '../../core/blackboard.ts';
import { MetricsCalculator } from '../../analytics/metrics-calculator.ts';
import { eq, desc } from 'drizzle-orm';

/**
 * Plugin de rutas Fastify para Telemetría y Conciliación de Estados (solo lectura GET).
 */
export const telemetryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const blackboard = Blackboard.getInstance();
  const calculator = new MetricsCalculator();

  /**
   * 1. GET /api/v1/telemetry/state
   * Retorna una instantánea filtrada por TTL de todo el Blackboard de memoria.
   */
  fastify.get('/state', {
    schema: {
      description: 'Obtiene el estado completo y activo del Blackboard en memoria (filtrado por TTL).',
      tags: ['telemetria'],
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'number' },
            slots: { type: 'object', additionalProperties: true }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const activeSlots = blackboard.getAllStates();
      return {
        timestamp: Date.now(),
        slots: activeSlots
      };
    } catch (error: any) {
      fastify.log.error(`Error en GET /telemetry/state: ${error.message}`);
      (reply as any).status(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });

  /**
   * 2. GET /api/v1/telemetry/performance
   * Genera en tiempo real (Big-O optimizado) el informe de analítica y métricas ajustadas al riesgo.
   */
  fastify.get('/performance', {
    schema: {
      description: 'Calcula el Sharpe, Sortino, Profit Factor, Max Drawdown y métricas adicionales de los trades cerrados.',
      tags: ['telemetria'],
      response: {
        200: {
          type: 'object',
          properties: {
            sharpe_ratio: { type: 'number' },
            sortino_ratio: { type: 'number' },
            profit_factor: { type: 'number' },
            win_rate: { type: 'number' },
            max_drawdown_percentage: { type: 'number' },
            total_trades: { type: 'number' },
            net_profit_usd: { type: 'number' },
            total_profit_usd: { type: 'number' },
            total_loss_usd: { type: 'number' },
            average_win_usd: { type: 'number' },
            average_loss_usd: { type: 'number' },
            timestamp: { type: 'number' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const report = await calculator.generateReport();
      return report;
    } catch (error: any) {
      fastify.log.error(`Error en GET /telemetry/performance: ${error.message}`);
      (reply as any).status(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });

  /**
   * 3. GET /api/v1/telemetry/regime
   * Recupera el régimen de mercado activo y la calibración paramétrica de los agentes.
   */
  fastify.get('/regime', {
    schema: {
      description: 'Obtiene el régimen del mercado activo diagnosticado y los pesos paramétricos calibrados.',
      tags: ['telemetria'],
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'number' },
            market_regime: { type: 'string' },
            classification_rationale: { type: 'string' },
            current_weights: { type: 'object', additionalProperties: true },
            current_kelly_fraction: { type: 'number' },
            current_atr_multipliers: {
              type: 'object',
              properties: {
                stop_loss: { type: 'number' },
                take_profit: { type: 'number' }
              }
            },
            min_confidence_threshold: { type: 'number' },
            suspension_flag: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const globalSettings = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'global_risk_limits'))
        .limit(1);

      if (globalSettings && globalSettings.length > 0) {
        const val = globalSettings[0].value as any;
        return {
          timestamp: val.lastTuningTimestamp || Date.now(),
          market_regime: val.marketRegime || 'MEAN_REVERTING',
          classification_rationale: val.classificationRationale || 'Parámetros auto-calibrados recuperados de la configuración global activa.',
          current_weights: val.weights || {
            TechnicalAnalyst: 0.25,
            OnChain: 0.15,
            OrderFlow: 0.20,
            Sentiment: 0.15,
            Correlation: 0.15,
            Divergence: 0.10
          },
          current_kelly_fraction: val.kellyFraction || 8,
          current_atr_multipliers: val.atrMultipliers || {
            stop_loss: 1.5,
            take_profit: 3.0
          },
          min_confidence_threshold: val.minConfidenceThreshold || 0.65,
          suspension_flag: val.suspensionFlag || false
        };
      }

      // Fallback predeterminado si el motor evolutivo no ha completado un bucle completo de optimización
      return {
        timestamp: Date.now(),
        market_regime: 'MEAN_REVERTING',
        classification_rationale: 'Régimen de inicialización por defecto. Esperando primer ciclo de Auto-Tuning.',
        current_weights: {
          TechnicalAnalyst: 0.25,
          OnChain: 0.15,
          OrderFlow: 0.20,
          Sentiment: 0.15,
          Correlation: 0.15,
          Divergence: 0.10
        },
        current_kelly_fraction: 8,
        current_atr_multipliers: {
          stop_loss: 1.5,
          take_profit: 3.0
        },
        min_confidence_threshold: 0.65,
        suspension_flag: false
      };
    } catch (error: any) {
      fastify.log.error(`Error en GET /telemetry/regime: ${error.message}`);
      (reply as any).status(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });

  /**
   * 4. GET /api/v1/telemetry/history
   * Consulta paginada histórica del rendimiento de calibración de parámetros (learning_performance).
   */
  fastify.get('/history', {
    schema: {
      description: 'Obtiene el registro cronológico e histórico de adaptaciones aplicadas por el agente de aprendizaje.',
      tags: ['telemetria'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', default: 50 },
          offset: { type: 'integer', default: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            timestamp: { type: 'number' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  symbol: { type: 'string' },
                  agentName: { type: 'string' },
                  parameterKey: { type: 'string' },
                  parameterValue: { type: 'string' },
                  performanceMetric: { type: 'string' },
                  metricValue: { type: 'string' },
                  createdAt: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'integer' },
                offset: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const q = request.query as { limit?: number; offset?: number };
      const limit = Math.min(100, q.limit || 50);
      const offset = q.offset || 0;

      // Obtener registros paginados desde Drizzle ordenados por los más nuevos
      const records = await db
        .select()
        .from(learningPerformance)
        .orderBy(desc(learningPerformance.createdAt))
        .limit(limit)
        .offset(offset);

      // Formatear fechas a ISOString de forma segura para evitar problemas de serialización
      const mappedData = records.map(r => ({
        id: r.id,
        symbol: r.symbol,
        agentName: r.agentName,
        parameterKey: r.parameterKey,
        parameterValue: r.parameterValue,
        performanceMetric: r.performanceMetric,
        metricValue: r.metricValue,
        createdAt: r.createdAt.toISOString()
      }));

      return {
        timestamp: Date.now(),
        data: mappedData,
        pagination: {
          limit,
          offset
        }
      };
    } catch (error: any) {
      fastify.log.error(`Error en GET /telemetry/history: ${error.message}`);
      (reply as any).status(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });

  /**
   * Helper de seguridad para enmascarar claves privadas y credenciales.
   */
  function maskSecretValue(val: string | undefined): string {
    if (!val) return '';
    if (val.length <= 8) return '****';
    return `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
  }

  /**
   * 5. GET /api/v1/telemetry/config
   * Recupera la configuración actual de API de Bitget enmascarada para resguardar la seguridad.
   */
  fastify.get('/config', {
    schema: {
      description: 'Recupera la configuración actual de API de Bitget enmascarada por seguridad.',
      tags: ['telemetria'],
      response: {
        200: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
            apiSecret: { type: 'string' },
            passphrase: { type: 'string' },
            modoReal: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      return {
        apiKey: maskSecretValue(process.env.BITGET_API_KEY),
        apiSecret: maskSecretValue(process.env.BITGET_API_SECRET),
        passphrase: maskSecretValue(process.env.BITGET_PASSPHRASE),
        modoReal: process.env.BITGET_MODO_REAL === 'true'
      };
    } catch (error: any) {
      fastify.log.error(`Error en GET /telemetry/config: ${error.message}`);
      (reply as any).status(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });

  /**
   * 6. POST /api/v1/telemetry/config
   * Actualiza dinámicamente las credenciales de API de Bitget y el entorno operativo.
   */
  fastify.post('/config', {
    schema: {
      description: 'Actualiza dinámicamente las credenciales de API de Bitget y el entorno operativo de forma inmutable.',
      tags: ['telemetria'],
      body: {
        type: 'object',
        required: ['apiKey', 'apiSecret', 'passphrase', 'modoReal'],
        properties: {
          apiKey: { type: 'string' },
          apiSecret: { type: 'string' },
          passphrase: { type: 'string' },
          modoReal: { type: 'boolean' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { apiKey, apiSecret, passphrase, modoReal } = request.body as any;

      if (apiKey && apiKey.trim() !== '' && !apiKey.includes('...')) {
        process.env.BITGET_API_KEY = apiKey.trim();
        fastify.log.info('BITGET_API_KEY actualizado dinámicamente.');
      }
      if (apiSecret && apiSecret.trim() !== '' && !apiSecret.includes('...')) {
        process.env.BITGET_API_SECRET = apiSecret.trim();
        fastify.log.info('BITGET_API_SECRET actualizado dinámicamente.');
      }
      if (passphrase && passphrase.trim() !== '' && !passphrase.includes('...')) {
        process.env.BITGET_PASSPHRASE = passphrase.trim();
        fastify.log.info('BITGET_PASSPHRASE actualizado dinámicamente.');
      }

      process.env.BITGET_MODO_REAL = modoReal ? 'true' : 'false';
      fastify.log.info(`Entorno operativo conmutado a: ${modoReal ? 'LIVE' : 'SANDBOX'}`);

      return {
        exitoso: true,
        mensaje: 'Configuración de API actualizada correctamente en caliente.',
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error(`Error en POST /telemetry/config: ${error.message}`);
      (reply as any).status(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });
};
