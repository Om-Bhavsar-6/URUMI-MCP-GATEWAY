export interface UpstreamServerRecord {
  id: string;
  name: string;
  url: string;
  bearer_token?: string | null;
  enabled: boolean;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, any>;
  serverName: string;
  serverId: string;
}

export interface ServerStatus {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status: 'connected' | 'unreachable' | 'disabled';
  toolCount: number;
  lastChecked: string;
  error?: string;
}

export class UpstreamMcpClient {
  private sessionId?: string;

  constructor(public readonly record: UpstreamServerRecord) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (this.record.bearer_token) {
      headers['Authorization'] = `Bearer ${this.record.bearer_token}`;
      headers['x-mcp-token'] = this.record.bearer_token;
    }
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }
    return headers;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.sessionId) return;

    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'urumi-gateway-aggregator', version: '1.0.0' },
      },
    };

    const res = await fetch(this.record.url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Upstream handshake failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const sessHeader = res.headers.get('mcp-session-id');
    if (sessHeader) {
      this.sessionId = sessHeader;
    }
  }

  async listTools(): Promise<McpToolDefinition[]> {
    await this.ensureInitialized();

    const body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
    };

    const res = await fetch(this.record.url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // If 404 or session invalid, invalidate session and retry once
      if (res.status === 400 || res.status === 404) {
        this.sessionId = undefined;
        await this.ensureInitialized();
        const retryRes = await fetch(this.record.url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        if (!retryRes.ok) throw new Error(`tools/list failed with HTTP ${retryRes.status}`);
        const data = (await retryRes.json()) as any;
        return (data.result?.tools || []).map((t: any) => ({
          ...t,
          serverName: this.record.name,
          serverId: this.record.id,
        }));
      }
      throw new Error(`tools/list failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    if (data.error) {
      throw new Error(`Upstream error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return (data.result?.tools || []).map((t: any) => ({
      ...t,
      serverName: this.record.name,
      serverId: this.record.id,
    }));
  }

  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    await this.ensureInitialized();

    const body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    const res = await fetch(this.record.url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`tools/call failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    if (data.error) {
      throw new Error(`Upstream tool error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data.result;
  }
}
