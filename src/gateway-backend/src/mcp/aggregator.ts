import crypto from 'crypto';
import { pool } from '../db/pool.js';
import {
  UpstreamMcpClient,
  UpstreamServerRecord,
  McpToolDefinition,
  ServerStatus,
} from './upstream-client.js';

class ToolAggregator {
  private clients = new Map<string, UpstreamMcpClient>();
  private toolToServerMap = new Map<string, { client: UpstreamMcpClient; serverName: string }>();
  private cachedTools: McpToolDefinition[] = [];
  private lastToolsFetchTime = 0;
  private readonly CACHE_TTL_MS = 5000;

  async refreshServers(): Promise<UpstreamServerRecord[]> {
    const res = await pool.query<UpstreamServerRecord>(`
      SELECT id, name, url, bearer_token, enabled
      FROM mcp_servers
      ORDER BY name ASC
    `);

    const currentRecords = res.rows;
    const currentIds = new Set(currentRecords.map((r) => r.id));

    // Remove deleted clients
    for (const id of this.clients.keys()) {
      if (!currentIds.has(id)) {
        this.clients.delete(id);
      }
    }

    // Add or update clients
    for (const record of currentRecords) {
      const existing = this.clients.get(record.id);
      if (!existing || existing.record.url !== record.url || existing.record.bearer_token !== record.bearer_token) {
        this.clients.set(record.id, new UpstreamMcpClient(record));
      }
    }

    return currentRecords;
  }

  async getServerStatuses(): Promise<ServerStatus[]> {
    const records = await this.refreshServers();
    const statuses: ServerStatus[] = [];

    await Promise.all(
      records.map(async (record) => {
        if (!record.enabled) {
          statuses.push({
            id: record.id,
            name: record.name,
            url: record.url,
            enabled: false,
            status: 'disabled',
            toolCount: 0,
            lastChecked: new Date().toISOString(),
          });
          return;
        }

        const client = this.clients.get(record.id)!;
        try {
          const tools = await client.listTools();
          statuses.push({
            id: record.id,
            name: record.name,
            url: record.url,
            enabled: true,
            status: 'connected',
            toolCount: tools.length,
            lastChecked: new Date().toISOString(),
          });
        } catch (err: any) {
          statuses.push({
            id: record.id,
            name: record.name,
            url: record.url,
            enabled: true,
            status: 'unreachable',
            toolCount: 0,
            lastChecked: new Date().toISOString(),
            error: err.message,
          });
        }
      })
    );

    return statuses.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAggregatedTools(forceRefresh = false): Promise<McpToolDefinition[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedTools.length > 0 && now - this.lastToolsFetchTime < this.CACHE_TTL_MS) {
      return this.cachedTools;
    }

    const records = await this.refreshServers();
    const enabledClients = records
      .filter((r) => r.enabled)
      .map((r) => this.clients.get(r.id)!);

    const newTools: McpToolDefinition[] = [];
    const newToolMap = new Map<string, { client: UpstreamMcpClient; serverName: string }>();

    // Parallel fetch with fault isolation: one failing server will not fail tools/list
    const results = await Promise.allSettled(
      enabledClients.map(async (client) => {
        const tools = await client.listTools();
        return { client, serverName: client.record.name, tools };
      })
    );

    for (const res of results) {
      if (res.status === 'fulfilled') {
        const { client, serverName, tools } = res.value;
        for (const tool of tools) {
          newTools.push(tool);
          newToolMap.set(tool.name, { client, serverName });
        }
      } else {
        console.warn('[Aggregator] Upstream server tools/list failed:', res.reason?.message || res.reason);
      }
    }

    this.cachedTools = newTools;
    this.toolToServerMap = newToolMap;
    this.lastToolsFetchTime = now;

    return newTools;
  }

  async executeTool(
    toolName: string,
    args: Record<string, any> = {},
    user: { id?: string; email?: string } = {}
  ): Promise<any> {
    const startTime = Date.now();
    await this.getAggregatedTools(); // ensure mapping is populated

    const mapping = this.toolToServerMap.get(toolName);
    if (!mapping) {
      const err = new Error(`Tool not found or upstream server disabled: ${toolName}`);
      await this.recordAuditLog({
        user_id: user.id || null,
        user_email: user.email || 'anonymous',
        server_name: 'unknown',
        tool_name: toolName,
        arguments: args,
        status: 'error',
        duration_ms: Date.now() - startTime,
        error_message: err.message,
      });
      throw err;
    }

    const { client, serverName } = mapping;

    try {
      const result = await client.callTool(toolName, args);
      const durationMs = Date.now() - startTime;

      const isError = result.isError === true;
      const status = isError ? 'error' : 'success';
      const errorMessage = isError ? (result.content?.[0]?.text || 'Tool returned error') : null;

      await this.recordAuditLog({
        user_id: user.id || null,
        user_email: user.email || 'anonymous',
        server_name: serverName,
        tool_name: toolName,
        arguments: args,
        status,
        duration_ms: durationMs,
        error_message: errorMessage,
      });

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await this.recordAuditLog({
        user_id: user.id || null,
        user_email: user.email || 'anonymous',
        server_name: serverName,
        tool_name: toolName,
        arguments: args,
        status: 'error',
        duration_ms: durationMs,
        error_message: err.message,
      });
      throw err;
    }
  }

  private async recordAuditLog(log: {
    user_id: string | null;
    user_email: string;
    server_name: string;
    tool_name: string;
    arguments: Record<string, any>;
    status: 'success' | 'error';
    duration_ms: number;
    error_message: string | null;
  }): Promise<void> {
    try {
      const id = `audit-${crypto.randomUUID()}`;
      await pool.query(
        `
        INSERT INTO audit_logs (id, user_id, user_email, server_name, tool_name, arguments, status, duration_ms, error_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
        [
          id,
          log.user_id,
          log.user_email,
          log.server_name,
          log.tool_name,
          JSON.stringify(log.arguments),
          log.status,
          log.duration_ms,
          log.error_message,
        ]
      );
    } catch (err: any) {
      console.error('[AuditLog] Failed to persist audit log entry:', err.message);
    }
  }
}

export const aggregator = new ToolAggregator();
