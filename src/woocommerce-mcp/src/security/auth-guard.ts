import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function internalAuthGuard(req: Request, res: Response, next: NextFunction) {
  if (!config.INTERNAL_MCP_TOKEN) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers['x-mcp-token'];

  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (typeof tokenHeader === 'string') {
    token = tokenHeader.trim();
  }

  if (!token || token !== config.INTERNAL_MCP_TOKEN) {
    return res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized: Invalid or missing internal MCP cluster token.',
      },
      id: null,
    });
  }

  next();
}
