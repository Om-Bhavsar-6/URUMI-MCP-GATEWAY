import { Router, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { hashPassword } from '../db/schema.js';
import { generateJwt, authMiddleware, AuthenticatedRequest } from '../security/auth.js';

export const authRouter = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const passHash = hashPassword(password);

    const userRes = await pool.query(`
      SELECT id, email, name, role
      FROM users
      WHERE email = $1 AND password_hash = $2
    `, [email.toLowerCase(), passHash]);

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const token = generateJwt(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});
