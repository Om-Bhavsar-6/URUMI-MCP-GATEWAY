import express, { Request, Response } from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { WooCommerceClient } from './wc-client.js';
import { registerWooCommerceTools } from './tools.js';
import { internalAuthGuard } from './security/auth-guard.js';

async function bootstrap() {
  const app = express();

  // Basic security middleware
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '2mb' }));

  // Liveness & Readiness probe
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      server: 'woocommerce-mcp-server',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Initialize MCP Server
  const mcpServer = new Server(
    {
      name: 'woocommerce-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Initialize WooCommerce Client & Register Tools
  const wcClient = new WooCommerceClient();
  registerWooCommerceTools(mcpServer, wcClient);

  // Map of active Streamable HTTP sessions
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // Mount Streamable HTTP endpoint for all methods (GET for SSE/streaming, POST for JSON-RPC messages)
  app.all('/mcp', internalAuthGuard, async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else {
        // Create transport with official session generator
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
          onsessionclosed: (closedId) => {
            transports.delete(closedId);
          },
        });

        const sessionServer = new Server(
          {
            name: 'woocommerce-mcp-server',
            version: '1.0.0',
          },
          {
            capabilities: {
              tools: {},
            },
          }
        );
        registerWooCommerceTools(sessionServer, wcClient);
        await sessionServer.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);

      // Register session once ID is established
      if (transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
      }
    } catch (err: any) {
      console.error('Error handling Streamable HTTP request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: `Internal error processing MCP request: ${err.message || String(err)}`,
          },
          id: null,
        });
      }
    }
  });

  const serverInstance = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` WooCommerce MCP Server running on port ${config.PORT}`);
    console.log(` Endpoint:   http://0.0.0.0:${config.PORT}/mcp`);
    console.log(` Health:     http://0.0.0.0:${config.PORT}/healthz`);
    console.log(` WC URL:     ${config.WC_URL}`);
    console.log(` Auth Token: ${config.INTERNAL_MCP_TOKEN ? 'ENABLED' : 'DISABLED'}`);
    console.log(`=======================================================`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    try {
      for (const t of transports.values()) {
        await t.close();
      }
      await mcpServer.close();
    } catch (err) {
      console.error('Error closing transport/server:', err);
    }
    serverInstance.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
