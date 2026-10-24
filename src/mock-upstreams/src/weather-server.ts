import express, { Request, Response } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const WeatherInputSchema = z.object({
  city: z.string().min(1, 'City name is required').max(100),
  days: z.coerce.number().int().min(1).max(7).default(3),
});

const ShippingInputSchema = z.object({
  destination_country: z.string().min(2).max(60),
  weight_kg: z.coerce.number().positive().min(0.1).max(50.0),
  service_level: z.enum(['standard', 'express', 'overnight']).default('standard'),
});

function createWeatherMcpServer() {
  const mcpServer = new Server(
    { name: 'weather-shipping-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register Tools
  mcpServer.setRequestHandler(z.object({ method: z.literal('tools/list') }), async () => {
    return {
      tools: [
        {
          name: 'weather_get_forecast',
          description: 'Get weather forecast for a city to inform shipping and delivery estimations.',
          inputSchema: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name (e.g. "Bengaluru", "San Francisco")' },
              days: { type: 'number', description: 'Number of forecast days (1-7)', default: 3 },
            },
            required: ['city'],
          },
        },
        {
          name: 'shipping_get_rates',
          description: 'Calculate shipping costs and estimated delivery times for e-commerce orders based on weight and destination.',
          inputSchema: {
            type: 'object',
            properties: {
              destination_country: { type: 'string', description: 'Destination country name or code (e.g. "IN", "US")' },
              weight_kg: { type: 'number', description: 'Total shipment weight in kilograms' },
              service_level: { type: 'string', enum: ['standard', 'express', 'overnight'], default: 'standard' },
            },
            required: ['destination_country', 'weight_kg'],
          },
        },
      ],
    };
  });

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
        if (name === 'weather_get_forecast') {
          const { city, days } = WeatherInputSchema.parse(args || {});
          const conditions = ['Sunny', 'Partly Cloudy', 'Light Rain', 'Clear'];
          const forecast = [];
          for (let i = 1; i <= days; i++) {
            forecast.push({
              day: `Day +${i}`,
              temperature: `${20 + (i * 2)}°C`,
              condition: conditions[i % conditions.length],
              precipitation_chance: `${(i * 15) % 60}%`,
            });
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ city, forecast }, null, 2),
              },
            ],
          };
        } else if (name === 'shipping_get_rates') {
          const { destination_country, weight_kg, service_level } = ShippingInputSchema.parse(args || {});
          const baseRate = service_level === 'overnight' ? 35 : service_level === 'express' ? 20 : 10;
          const cost = (baseRate + weight_kg * 4.5).toFixed(2);
          const days = service_level === 'overnight' ? 1 : service_level === 'express' ? 2 : 5;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    destination: destination_country,
                    weight_kg,
                    service_level,
                    carrier: 'Urumi Global Logistics',
                    cost_usd: `$${cost}`,
                    estimated_days: `${days} business days`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Tool error: ${err.message}` }],
        };
      }
    }
  );

  return mcpServer;
}

export function startWeatherServer(port: number = 3001, token: string = 'urumi_internal_mcp_secure_token_123') {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'healthy', server: 'weather-shipping-mcp', port });
  });

  const authGuard = (req: Request, res: Response, next: express.NextFunction) => {
    const auth = req.headers.authorization;
    const headerToken = req.headers['x-mcp-token'];
    let provided = auth?.startsWith('Bearer ') ? auth.substring(7).trim() : headerToken;
    if (token && provided !== token) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized: Invalid internal token' },
        id: null,
      });
    }
    next();
  };

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all('/mcp', authGuard, async (req: Request, res: Response) => {
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
        const server = createWeatherMcpServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);

      if (transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
      }
    } catch (err: any) {
      console.error('[Weather MCP] Error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message }, id: null });
      }
    }
  });

  return app.listen(port, '0.0.0.0', () => {
    console.log(`Weather & Shipping MCP Server listening on port ${port}`);
  });
}
