import crypto from 'crypto';
import { pool } from './pool.js';

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function hashPassword(password: string, salt: string = 'urumi_secure_static_salt_2026'): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

export async function initDatabase(): Promise<void> {
  let retries = 10;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        console.log('[DB] Connected to PostgreSQL. Initializing schema...');

        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(32) NOT NULL DEFAULT 'member',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS api_keys (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            key_hash VARCHAR(64) UNIQUE NOT NULL,
            key_prefix VARCHAR(32) NOT NULL,
            revoked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS mcp_servers (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(255) UNIQUE NOT NULL,
            url VARCHAR(500) NOT NULL,
            bearer_token VARCHAR(255) DEFAULT NULL,
            enabled BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS audit_logs (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) DEFAULT NULL,
            user_email VARCHAR(255) DEFAULT NULL,
            server_name VARCHAR(255) NOT NULL,
            tool_name VARCHAR(255) NOT NULL,
            arguments JSONB DEFAULT '{}',
            status VARCHAR(32) NOT NULL,
            duration_ms INTEGER NOT NULL,
            error_message TEXT DEFAULT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email);
          CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
        `);

        // Seed Users
        const aliceHash = hashPassword('AliceAdmin123!');
        const bobHash = hashPassword('BobMember123!');

        await client.query(`
          INSERT INTO users (id, email, password_hash, name, role)
          VALUES 
            ('user-alice-01', 'alice@example.com', $1, 'Alice Admin', 'admin'),
            ('user-bob-02', 'bob@example.com', $2, 'Bob Member', 'member')
          ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
        `, [aliceHash, bobHash]);

        // Seed API Keys
        const aliceKey = 'ugw_live_alice_admin_secret_key_123';
        const bobKey = 'ugw_live_bob_member_secret_key_456';

        await client.query(`
          INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix)
          VALUES 
            ('key-alice-01', 'user-alice-01', 'Alice Default Key', $1, 'ugw_live_alice_'),
            ('key-bob-01', 'user-bob-02', 'Bob Default Key', $2, 'ugw_live_bob_m_')
          ON CONFLICT (key_hash) DO NOTHING;
        `, [hashApiKey(aliceKey), hashApiKey(bobKey)]);

        // Seed Upstream MCP Servers
        await client.query(`
          INSERT INTO mcp_servers (id, name, url, bearer_token, enabled)
          VALUES 
            (
              'srv-wc-01',
              'woocommerce-mcp',
              'http://woocommerce-mcp.urumi-store.svc.cluster.local:3000/mcp',
              'urumi_internal_mcp_secure_token_123',
              true
            ),
            (
              'srv-weather-02',
              'weather-shipping-mcp',
              'http://weather-mcp.urumi-gateway.svc.cluster.local:3001/mcp',
              'urumi_internal_mcp_secure_token_123',
              true
            ),
            (
              'srv-notes-03',
              'customer-notes-mcp',
              'http://notes-mcp.urumi-gateway.svc.cluster.local:3002/mcp',
              'urumi_internal_mcp_secure_token_123',
              true
            )
          ON CONFLICT (name) DO UPDATE SET 
            url = EXCLUDED.url,
            bearer_token = EXCLUDED.bearer_token;
        `);

        console.log('[DB] Database schema and initial seed data initialized successfully.');
        return;
      } finally {
        client.release();
      }
    } catch (err: any) {
      retries--;
      console.warn(`[DB] PostgreSQL connection attempt failed (${err.message}). Retries remaining: ${retries}`);
      if (retries === 0) throw err;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}
