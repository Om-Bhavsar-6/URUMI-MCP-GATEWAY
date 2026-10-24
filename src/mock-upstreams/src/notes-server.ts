import express, { Request, Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import crypto from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface CustomerNote {
  id: string;
  customer_email: string;
  note: string;
  category: 'general' | 'vip' | 'delivery' | 'support' | 'billing';
  created_at: string;
}

// In-memory customer notes store seeded with demo data
const notesStore: CustomerNote[] = [
  {
    id: 'note-001',
    customer_email: 'alice@example.com',
    note: 'VIP customer. Prefers evening deliveries after 6 PM. Always verify package seal.',
    category: 'vip',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'note-002',
    customer_email: 'alice@example.com',
    note: 'Requested recurring order updates via WhatsApp if possible.',
    category: 'support',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'note-003',
    customer_email: 'bob@example.com',
    note: 'Gate code #4412 for ground floor delivery.',
    category: 'delivery',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
];

const SaveNoteSchema = z.object({
  customer_email: z.string().email('Valid email address is required').max(150),
  note: z.string().min(1, 'Note cannot be empty').max(1000, 'Note cannot exceed 1000 characters').trim(),
  category: z.enum(['general', 'vip', 'delivery', 'support', 'billing']).default('general'),
});

const GetNotesSchema = z.object({
  customer_email: z.string().email('Valid email address is required').max(150),
});

const ListRecentNotesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

function createNotesMcpServer() {
  const mcpServer = new Server(
    { name: 'customer-notes-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Register Tools
  mcpServer.setRequestHandler(z.object({ method: z.literal('tools/list') }), async () => {
    return {
      tools: [
        {
          name: 'customer_notes_save',
          description: 'Save an internal CRM or fulfillment note for a customer (e.g. VIP preferences, delivery notes, support context).',
          inputSchema: {
            type: 'object',
            properties: {
              customer_email: { type: 'string', description: 'Customer email address (e.g. "alice@example.com")' },
              note: { type: 'string', description: 'Detailed note text' },
              category: {
                type: 'string',
                enum: ['general', 'vip', 'delivery', 'support', 'billing'],
                description: 'Note category',
                default: 'general',
              },
            },
            required: ['customer_email', 'note'],
          },
        },
        {
          name: 'customer_notes_get',
          description: 'Retrieve all internal CRM notes on file for a specific customer by email address.',
          inputSchema: {
            type: 'object',
            properties: {
              customer_email: { type: 'string', description: 'Customer email address' },
            },
            required: ['customer_email'],
          },
        },
        {
          name: 'customer_notes_list_recent',
          description: 'List the most recent customer CRM notes across all customer accounts.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max number of notes to return (1-50)', default: 10 },
            },
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
        if (name === 'customer_notes_save') {
          const parsed = SaveNoteSchema.parse(args || {});
          const newNote: CustomerNote = {
            id: `note-${crypto.randomUUID().substring(0, 8)}`,
            customer_email: parsed.customer_email.toLowerCase(),
            note: parsed.note,
            category: parsed.category,
            created_at: new Date().toISOString(),
          };
          notesStore.unshift(newNote);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    message: `Note saved successfully for ${parsed.customer_email}`,
                    note: newNote,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } else if (name === 'customer_notes_get') {
          const parsed = GetNotesSchema.parse(args || {});
          const email = parsed.customer_email.toLowerCase();
          const customerNotes = notesStore.filter((n) => n.customer_email === email);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    customer_email: email,
                    total_notes: customerNotes.length,
                    notes: customerNotes,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } else if (name === 'customer_notes_list_recent') {
          const parsed = ListRecentNotesSchema.parse(args || {});
          const recentNotes = notesStore.slice(0, parsed.limit);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    limit: parsed.limit,
                    returned: recentNotes.length,
                    notes: recentNotes,
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

export function startNotesServer(port: number = 3002, token: string = 'urumi_internal_mcp_secure_token_123') {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'healthy', server: 'customer-notes-mcp', port, total_notes: notesStore.length });
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
        const server = createNotesMcpServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);

      if (transport.sessionId && !transports.has(transport.sessionId)) {
        transports.set(transport.sessionId, transport);
      }
    } catch (err: any) {
      console.error('[Notes MCP] Error handling request:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: err.message }, id: null });
      }
    }
  });

  return app.listen(port, '0.0.0.0', () => {
    console.log(`Customer Notes CRM MCP Server listening on port ${port}`);
  });
}
