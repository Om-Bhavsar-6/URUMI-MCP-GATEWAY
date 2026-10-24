import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { hashApiKey } from '../db/schema.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'urumi_jwt_gateway_secure_secret_2026';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  authType: 'api_key' | 'jwt';
  keyId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateJwt(user: { id: string; email: string; name: string; role: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  }

  if (!token) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: Missing API key or bearer token' },
      id: null,
    });
  }

  // 1. First check if it's an API Key (starts with ugw_ or is a raw API key)
  try {
    const keyHash = hashApiKey(token);
    const keyRes = await pool.query(`
      SELECT 
        k.id AS key_id,
        k.revoked_at,
        u.id AS user_id,
        u.email,
        u.name,
        u.role
      FROM api_keys k
      JOIN users u ON k.user_id = u.id
      WHERE k.key_hash = $1
    `, [keyHash]);

    if (keyRes.rows.length > 0) {
      const row = keyRes.rows[0];

      // Enforce immediate revocation
      if (row.revoked_at) {
        return res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: This API key has been revoked' },
          id: null,
        });
      }

      req.user = {
        id: row.user_id,
        email: row.email,
        name: row.name,
        role: row.role,
        authType: 'api_key',
        keyId: row.key_id,
      };
      return next();
    }
  } catch (err: any) {
    console.error('[Auth] Error querying API key:', err.message);
  }

  // 2. If not found in API keys, try verifying as JWT token
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      authType: 'jwt',
    };
    return next();
  } catch (_jwtErr) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized: Invalid or expired API key / token' },
      id: null,
    });
  }
}

export function requireRole(role: 'admin') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({
        error: `Forbidden: Only users with '${role}' role can perform this operation`,
      });
    }
    next();
  };
}
