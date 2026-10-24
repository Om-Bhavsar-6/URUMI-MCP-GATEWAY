import crypto from 'crypto';
import express, { Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { aggregator } from './aggregator.js';
import { AuthenticatedRequest } from '../security/auth.js';

function createGatewaySessionServer(user: { id?: string; email?: string }) {
  const mcpServer = new Server(
    { name: 'urumi-team-mcp-gateway', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Dynamic tools/list handler
  mcpServer.setRequestHandler(z.object({ method: z.literal('tools/list') }), async () => {
    const tools = await aggregator.getAggregatedTools();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description || `Tool provided by ${t.serverName}`,
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      })),
    };
  });

  // Dynamic tools/call handler
  mcpServer.setRequestHandler(
    z.object({
      method: z.literal('tools/call'),
      params: z.object({
        name: z.string(),
        arguments: z.record(z.unknown()).optional(),
      }),
    }),
    async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await aggregator.executeTool(name, args || {}, user);
        return result;
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Gateway tool execution failed: ${err.message}` }],
        };
      }
    }
  );

  return mcpServer;
}

export function createGatewayMcpServer() {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const handleMcpHttp = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
          onsessionclosed: (id) => {
            transports.delete(id);
          },
        });
        const user = req.user || { email: 'external-client' };
        const server = createGatewaySessionServer(user);
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);

      if (transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
      }
    } catch (err: any) {
      console.error('[Gateway MCP] Error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: err.message },
          id: null,
        });
      }
    }
  };

  return { handleMcpHttp };
}
