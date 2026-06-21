import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { registerRoutes } from './routes';
import { setupWebSocket } from './websocket';
import { requestId, requestLogger, errorHandler, notFoundHandler, BODY_LIMIT } from './middleware';
import { startCronJobs } from './cron';
import { checkHealth, setWsServer } from './health';
import { validateEnv } from './utils/env';
import { logger } from './utils/logger';

// Validate environment at startup
const envResult = validateEnv();
if (!envResult.valid) {
  logger.error('Environment validation failed', { errors: envResult.errors });
  process.exit(1);
}
for (const warning of envResult.warnings) {
  logger.warn(warning);
}

// Parse --port from command line args (Tauri sidecar mode)
function parsePort(): number {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (portArg) {
    const port = parseInt(portArg.split('=')[1], 10);
    if (!isNaN(port) && port > 0 && port < 65536) return port;
  }
  return parseInt(process.env.PORT ?? '3001', 10);
}

const PORT = parsePort();
const isDev = process.env.NODE_ENV !== 'production';
const isSidecar = process.argv.some((arg) => arg.startsWith('--port='));

const app = express();

// ============================================================
// Security (simplified for local desktop app)
// ============================================================
if (!isSidecar) {
  // In web mode, use full security
  const helmet = await import('helmet');
  app.use(helmet.default({
    contentSecurityPolicy: isDev ? false : undefined,
    crossOriginEmbedderPolicy: false,
  }));
}

app.use(cors({
  origin: isSidecar
    ? ['http://localhost', /^http:\/\/localhost:\d+$/]
    : (isDev ? true : (process.env.CORS_ORIGIN ?? 'http://localhost:5173')),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge: 86400,
}));

// ============================================================
// Rate limiting — defense in depth for both modes
// ============================================================
const rateLimit = (await import('express-rate-limit')).default;
if (isSidecar) {
  // Sidecar: relaxed limits (single-user desktop, loopback only)
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }));
} else {
  // Web mode: stricter limits
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  }));
}

// ============================================================
// Parsing
// ============================================================
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// ============================================================
// Request tracking
// ============================================================
app.use(requestId);
app.use(requestLogger);

// ============================================================
// Trust proxy (required for rate limiting behind reverse proxy)
// ============================================================
app.set('trust proxy', 1);

// ============================================================
// Routes
// ============================================================
registerRoutes(app);

// Health check with dependency status
app.get('/api/health', async (_req, res) => {
  const health = await checkHealth();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// ============================================================
// Start server (HTTP + WebSocket on same port for sidecar)
// ============================================================
const httpServer = createServer(app);

// In sidecar mode, attach WebSocket to the same HTTP server
const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 65536,
});
setupWebSocket(wss);
setWsServer(wss);

// Bind to 127.0.0.1 (loopback only) to prevent network exposure
// In sidecar mode this is critical — the server has no auth/rate-limit
httpServer.listen(PORT, '127.0.0.1', () => {
  logger.info('Server started', {
    port: PORT,
    ws: `ws://localhost:${PORT}`,
    env: process.env.NODE_ENV ?? 'development',
    sidecar: isSidecar,
  });
});

// Cron jobs
startCronJobs();

// ============================================================
// Graceful shutdown
// ============================================================
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Graceful shutdown initiated', { signal });

  // Close all WS connections
  for (const client of wss.clients) {
    client.close(1001, 'Server shutting down');
  }

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('Server closed');
  });

  // Allow ongoing requests to finish (max 5s)
  await new Promise((resolve) => setTimeout(resolve, 5000));

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, wss };
