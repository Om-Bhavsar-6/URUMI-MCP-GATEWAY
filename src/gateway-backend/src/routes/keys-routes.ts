import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { hashApiKey } from '../db/schema.js';
import { authMiddleware, AuthenticatedRequest } from '../security/auth.js';

export const keysRouter = Router();

keysRouter.use(authMiddleware);

const CreateKeySchema = z.object({
  name: z.string().min(1).max(100),
});

// GET /api/keys - List API keys
keysRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    let query = `
      SELECT 
        k.id,
        k.name,
        k.key_prefix,
        k.created_at,
        k.revoked_at,
        u.id AS user_id,
        u.email AS user_email,
        u.name AS user_name,
        u.role AS user_role
      FROM api_keys k
      JOIN users u ON k.user_id = u.id
    `;
    const params: any[] = [];

    // Members can only see their own keys; admins can see all team keys
    if (user.role !== 'admin') {
      query += ` WHERE k.user_id = $1`;
      params.push(user.id);
    }

    query += ` ORDER BY k.created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ keys: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/keys - Generate a new API key (Copy-once)
keysRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = CreateKeySchema.parse(req.body);
    const user = req.user!;

    const rawSecret = crypto.randomBytes(24).toString('base64url');
    const plainApiKey = `ugw_live_${rawSecret}`;
    const keyHash = hashApiKey(plainApiKey);
    const keyPrefix = plainApiKey.substring(0, 14) + '...';
    const id = `key-${crypto.randomUUID().substring(0, 8)}`;

    await pool.query(
      `
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [id, user.id, name, keyHash, keyPrefix]
    );

    res.status(201).json({
      id,
      name,
      apiKey: plainApiKey, // Returned only once!
      keyPrefix,
      createdAt: new Date().toISOString(),
      message: 'Store this API key securely. It will not be shown again.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/keys/:id/revoke - Revoke an API key immediately
keysRouter.post('/:id/revoke', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    // Admins can revoke any key; members can only revoke their own
    let query = `
      UPDATE api_keys
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    const params: any[] = [id];

    if (user.role !== 'admin') {
      query += ` AND user_id = $2`;
      params.push(user.id);
    }

    query += ` RETURNING id, revoked_at`;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found or permission denied' });
    }

    res.json({
      id: result.rows[0].id,
      revoked_at: result.rows[0].revoked_at,
      message: 'API key has been revoked immediately. All subsequent requests will be rejected.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
