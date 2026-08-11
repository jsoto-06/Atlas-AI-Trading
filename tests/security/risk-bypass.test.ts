import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { TelemetryServer } from '../../src/api/server.ts';

describe('CRITICAL 3 — Elimination of Risk Manager Bypass', () => {
  let server: TelemetryServer;
  let app: FastifyInstance;
  const originalEnvNodeEnv = process.env.NODE_ENV;
  const originalAdminToken = process.env.ADMIN_API_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = 'test_token_secret_123';
    server = new TelemetryServer();
    app = server.getFastifyInstance();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnvNodeEnv;
    process.env.ADMIN_API_TOKEN = originalAdminToken;
  });

  it('debe rechazar /api/v1/engine/test-order con 403 Forbidden en entorno de producción', async () => {
    process.env.NODE_ENV = 'production';

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/engine/test-order',
      headers: {
        authorization: 'Bearer test_token_secret_123'
      },
      payload: {
        symbol: 'BTC/USDT',
        side: 'BUY',
        sizeUsd: 100
      }
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('FORBIDDEN_IN_PRODUCTION');
  });

  it('debe solicitar autenticación y no permitir bypass sin token válido', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/engine/test-order',
      headers: {
        authorization: 'Bearer invalid_token'
      },
      payload: {
        symbol: 'BTC/USDT',
        side: 'BUY'
      }
    });

    expect(response.statusCode).toBe(401);
  });
});
