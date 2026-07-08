import express from 'express';
import path from 'path';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { TelemetryServer } from './src/api/server.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const BACKEND_PORT = 3001;

  // 1. Start the Fastify backend server on port 3001
  const telemetryServer = new TelemetryServer();
  await telemetryServer.start(BACKEND_PORT);
  console.log(`[FullStack] Backend Fastify server running on port ${BACKEND_PORT}`);

  // 2. Simple proxy middleware for API routes to Fastify server
  const proxyToBackend = (req: any, res: any) => {
    const connector = http.request({
      host: '127.0.0.1',
      port: BACKEND_PORT,
      path: req.originalUrl,
      method: req.method,
      headers: req.headers
    }, (resp) => {
      res.writeHead(resp.statusCode || 200, resp.headers);
      resp.pipe(res, { end: true });
    });
    
    // Handle error to prevent crash
    connector.on('error', (err) => {
      console.error(`[Proxy Error] Fail to connect to Fastify backend on port ${BACKEND_PORT}:`, err);
      res.status(502).json({ error: 'Bad Gateway', message: 'No se pudo conectar con el servidor de telemetría.' });
    });

    req.pipe(connector, { end: true });
  };

  app.use('/api', proxyToBackend);
  app.use('/health', proxyToBackend);

  // 3. Serve Frontend via Vite (Dev) or Static Files (Prod)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[FullStack] Vite Dev Middleware mounted on gateway');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[FullStack] Production Static Assets served from ${distPath}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FullStack] Front/API gateway running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[FullStack] Critical error during startup:', err);
  process.exit(1);
});
