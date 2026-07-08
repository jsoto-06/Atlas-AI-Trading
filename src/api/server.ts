/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { telemetryRoutes } from './routes/telemetry.ts';
import { db } from '../db/index.ts';
import { sql } from 'drizzle-orm';

/**
 * Servidor de Exposición de Telemetría (TelemetryServer).
 * 
 * Basado en Fastify para garantizar latencias sub-milisegundo en la serialización
 * de datos en tiempo real de Blackboard y métricas financieras de rendimiento.
 * 
 * Características de producción:
 * 1. CORS limitado estrictamente según variables de entorno.
 * 2. Protección de fugas mediante Error Handler global y saneamiento de trazas de base de datos.
 * 3. Health Checks y diagnóstico integrado del Pool de conexión Drizzle.
 */
export class TelemetryServer {
  private app: FastifyInstance;
  private isRunning = false;

  constructor() {
    // Instanciar Fastify con logger integrado optimizado para entornos contenedores (Cloud Run)
    this.app = fastify({
      logger: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        serializers: {
          req(request) {
            return {
              method: request.method,
              url: request.url,
              hostname: request.hostname,
              remoteAddress: request.ip
            };
          }
        }
      }
    });

    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandler();
  }

  /**
   * Registra los middlewares de seguridad y sanitización requeridos.
   */
  private setupMiddlewares(): void {
    // Determinar orígenes permitidos desde el entorno (o estrella por defecto en local)
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
      ? process.env.CORS_ALLOWED_ORIGINS.split(',') 
      : '*';

    this.app.register(cors, {
      origin: allowedOrigins,
      methods: ['GET', 'POST'], // Permitir GET y POST para actualización segura de la configuración API
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    });
  }

  /**
   * Configura las rutas globales del servidor.
   */
  private setupRoutes(): void {
    // Endpoint de Health Check básico con diagnóstico de base de datos
    this.app.get('/health', async (request, reply) => {
      let dbHealthy = false;
      try {
        // Ejecución de una consulta superficial no bloqueante para certificar la salud del pool pg
        await db.execute(sql`SELECT 1`);
        dbHealthy = true;
      } catch (err: any) {
        this.app.log.error(err, 'Fallo en el Health Check de base de datos');
      }

      const status = dbHealthy ? 200 : 503;
      reply.status(status).send({
        status: dbHealthy ? 'HEALTHY' : 'DEGRADED',
        database: dbHealthy ? 'CONNECTED' : 'DISCONNECTED',
        uptime: process.uptime(),
        timestamp: Date.now()
      });
    });

    // Registrar prefijo API v1 de telemetría reactiva
    this.app.register(telemetryRoutes, { prefix: '/api/v1/telemetry' });
  }

  /**
   * Manejador de excepciones global (ErrorHandler).
   * Evita fugas de información interna o stack-traces hacia clientes externos.
   */
  private setupErrorHandler(): void {
    this.app.setErrorHandler((error: any, request, reply) => {
      const statusCode = error.statusCode || 500;
      
      // Registrar log exacto de error técnico internamente
      this.app.log.error({ err: error, url: request.url, code: error.code }, `[EXCEPCIÓN GLOBAL] Capturado en Fast-Loop REST: ${error.message}`);

      // Retornar mensaje higienizado sin revelar nombres de tablas, variables o contraseñas
      reply.status(statusCode).send({
        error: statusCode === 500 ? 'Internal Server Error' : error.name,
        message: statusCode === 500 
          ? 'Ha ocurrido un error inesperado al procesar la telemetría transaccional.' 
          : error.message,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Arranca asíncronamente el servidor HTTP en el puerto indicado.
   * Enlaza a host '0.0.0.0' para integraciones robustas en plataformas Cloud Run e ingress reverse-proxy.
   */
  public async start(port: number): Promise<void> {
    if (this.isRunning) {
      this.app.log.warn(`El servidor de telemetría ya se encuentra en ejecución.`);
      return;
    }

    try {
      this.app.log.info(`Iniciando servidor de telemetría Fastify en puerto ${port}...`);
      await this.app.listen({ port, host: '0.0.0.0' });
      this.isRunning = true;
      console.log(`\n================================================================`);
      console.log(`      🚀 SERVIDOR DE TELEMETRÍA API v1 ACTIVO Y TRANSMITIENDO   `);
      console.log(`      URL: http://0.0.0.0:${port}                              `);
      console.log(`================================================================\n`);
    } catch (err: any) {
      this.app.log.error(err, 'Fallo crítico al inicializar el servidor de telemetría');
      throw err;
    }
  }

  /**
   * Detiene de manera ordenada y graciosa las conexiones del servidor.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.app.log.info('Deteniendo de forma ordenada el servidor de telemetría...');
    await this.app.close();
    this.isRunning = false;
    console.log('[TelemetryServer] Servidor detenido con éxito.');
  }

  /**
   * Retorna la instancia interna de Fastify (útil para pruebas unitarias de inyección de rutas).
   */
  public getFastifyInstance(): FastifyInstance {
    return this.app;
  }
}
