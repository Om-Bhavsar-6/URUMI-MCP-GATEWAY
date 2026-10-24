import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  WC_URL: z.string().url().default('http://wordpress.urumi-store.svc.cluster.local'),
  WC_CONSUMER_KEY: z.string().min(1, 'WC_CONSUMER_KEY is required'),
  WC_CONSUMER_SECRET: z.string().min(1, 'WC_CONSUMER_SECRET is required'),
  INTERNAL_MCP_TOKEN: z.string().optional().default('urumi_internal_mcp_secure_token_123'),
  REQUEST_TIMEOUT_MS: z.coerce.number().min(1000).max(30000).default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export const config = envSchema.parse({
  PORT: process.env.PORT,
  WC_URL: process.env.WC_URL || 'http://wordpress.urumi-store.svc.cluster.local',
  WC_CONSUMER_KEY: process.env.WC_CONSUMER_KEY,
  WC_CONSUMER_SECRET: process.env.WC_CONSUMER_SECRET,
  INTERNAL_MCP_TOKEN: process.env.INTERNAL_MCP_TOKEN,
  REQUEST_TIMEOUT_MS: process.env.REQUEST_TIMEOUT_MS,
  NODE_ENV: process.env.NODE_ENV,
});
