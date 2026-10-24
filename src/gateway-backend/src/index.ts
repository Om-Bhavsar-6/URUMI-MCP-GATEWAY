import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase } from './db/schema.js';
import { authMiddleware } from './security/auth.js';
import { createGatewayMcpServer } from './mcp/gateway-mcp-server.js';
import { authRouter } from './routes/auth-routes.js';
import { serverRouter } from './routes/server-routes.js';
import { keysRouter } from './routes/keys-routes.js';
import { auditRouter } from './routes/audit-routes.js';
import { chatRouter } from './routes/chat-routes.js';
import { aggregator } from './mcp/aggregator.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

// Health probe endpoint
app.get('/healthz', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'urumi-team-mcp-gateway',
    timestamp: new Date().toISOString(),
  });
});

// Gateway MCP Server endpoint (Streamable HTTP, Bearer API Key authenticated)
const { handleMcpHttp } = createGatewayMcpServer();
app.all('/mcp', authMiddleware, handleMcpHttp);

// REST API Routes
app.use('/api/auth', authRouter);
app.use('/api/servers', serverRouter);
app.use('/api/keys', keysRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/chat', chatRouter);

// Serve Static Frontend Dashboard
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.resolve(__dirname, '../public');

if (fs.existsSync(publicPath)) {
  console.log(`[Gateway] Serving static frontend dashboard from: ${publicPath}`);
  app.use(express.static(publicPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp') || req.path.startsWith('/healthz')) {
      return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Gateway] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

async function startServer() {
  try {
    console.log('[Gateway] Initializing database...');
    await initDatabase();

    console.log('[Gateway] Pre-warming upstream server tool catalog...');
    try {
      const tools = await aggregator.getAggregatedTools(true);
      console.log(`[Gateway] Tool catalog warmed up with ${tools.length} tools across upstream servers.`);
    } catch (warmupErr: any) {
      console.warn('[Gateway] Tool warmup warning (will retry on demand):', warmupErr.message);
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Gateway] Urumi Team MCP Gateway listening on http://0.0.0.0:${PORT}`);
      console.log(`[Gateway] Unified MCP Streamable HTTP endpoint: http://0.0.0.0:${PORT}/mcp`);
    });
  } catch (err: any) {
    console.error('[Gateway] Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
