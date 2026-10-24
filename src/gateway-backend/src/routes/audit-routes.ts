import { Router, Response } from 'express';
import { pool } from '../db/pool.js';
import { authMiddleware, AuthenticatedRequest } from '../security/auth.js';

export const auditRouter = Router();

auditRouter.use(authMiddleware);

// GET /api/audit-logs - Query audit logs with search and pagination
auditRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
    const offset = Math.max(parseInt((req.query.offset as string) || '0', 10), 0);
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const server = req.query.server as string | undefined;

    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`(
        LOWER(user_email) LIKE $${params.length} OR 
        LOWER(tool_name) LIKE $${params.length} OR 
        LOWER(server_name) LIKE $${params.length}
      )`);
    }

    if (status && (status === 'success' || status === 'error')) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (server) {
      params.push(server);
      conditions.push(`server_name = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count
    const countRes = await pool.query(`SELECT COUNT(*) FROM audit_logs ${whereClause}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    // Paginated results
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const query = `
      SELECT id, user_id, user_email, server_name, tool_name, arguments, status, duration_ms, error_message, created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const logsRes = await pool.query(query, params);

    res.json({
      logs: logsRes.rows,
      total,
      limit,
      offset,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
