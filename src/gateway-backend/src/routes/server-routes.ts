import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { authMiddleware, requireRole, AuthenticatedRequest } from '../security/auth.js';
import { validateUpstreamUrl } from '../security/ssrf-guard.js';
import { aggregator } from '../mcp/aggregator.js';

export const serverRouter = Router();

serverRouter.use(authMiddleware);

const ServerInputSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-z0-9-_]+$/i, 'Name must be alphanumeric with dashes or underscores'),
  url: z.string().url('A valid URL is required'),
  bearer_token: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
});

// GET /api/servers - List all upstream servers with live status
serverRouter.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const statuses = await aggregator.getServerStatuses();
    res.json({ servers: statuses });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/servers/:id/tools - List tools for a specific upstream server
serverRouter.get('/:id/tools', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const allTools = await aggregator.getAggregatedTools();
    const serverTools = allTools.filter((t) => t.serverId === id);
    res.json({ tools: serverTools });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/servers - Register new upstream server (Admin only, SSRF protected)
serverRouter.post('/', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, url, bearer_token, enabled } = ServerInputSchema.parse(req.body);

    const ssrfCheck = validateUpstreamUrl(url);
    if (!ssrfCheck.valid) {
      return res.status(400).json({ error: `SSRF Guardrail Violation: ${ssrfCheck.reason}` });
    }

    const id = `srv-${crypto.randomUUID().substring(0, 8)}`;
    await pool.query(
      `
      INSERT INTO mcp_servers (id, name, url, bearer_token, enabled)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [id, name, url, bearer_token || null, enabled]
    );

    await aggregator.getAggregatedTools(true); // force cache refresh
    res.status(201).json({ id, name, url, enabled, message: 'Server registered successfully' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/servers/:id/toggle - Enable or disable an upstream server (Admin only)
serverRouter.patch('/:id/toggle', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const current = await pool.query(`SELECT enabled FROM mcp_servers WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Server not found' });
    }

    const newEnabled = !current.rows[0].enabled;
    await pool.query(
      `
      UPDATE mcp_servers
      SET enabled = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
      [newEnabled, id]
    );

    await aggregator.getAggregatedTools(true); // force cache refresh
    res.json({ id, enabled: newEnabled, message: `Server ${newEnabled ? 'enabled' : 'disabled'} successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/servers/:id - Delete an upstream server (Admin only)
serverRouter.delete('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`DELETE FROM mcp_servers WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Server not found' });
    }

    await aggregator.getAggregatedTools(true); // force cache refresh
    res.json({ message: 'Server removed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
