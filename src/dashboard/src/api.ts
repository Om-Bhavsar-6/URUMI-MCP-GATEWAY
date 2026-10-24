export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
}

export interface ServerRecord {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status: 'connected' | 'unreachable' | 'disabled';
  toolCount: number;
  lastChecked: string;
  error?: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked_at?: string | null;
  user_email?: string;
  user_role?: string;
}

export interface AuditLogRecord {
  id: string;
  user_email: string;
  server_name: string;
  tool_name: string;
  arguments: any;
  status: 'success' | 'error';
  duration_ms: number;
  error_message?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    tool: string;
    args: any;
    result: any;
    durationMs: number;
  }>;
  timestamp: string;
}

const API_BASE = ''; // relative to same origin host

export class ApiService {
  private static token: string | null = localStorage.getItem('urumi_token');
  private static currentUser: User | null = JSON.parse(localStorage.getItem('urumi_user') || 'null');

  static getToken(): string | null {
    return this.token;
  }

  static getUser(): User | null {
    return this.currentUser;
  }

  static setAuth(token: string, user: User) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem('urumi_token', token);
    localStorage.setItem('urumi_user', JSON.stringify(user));
  }

  static clearAuth() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('urumi_token');
    localStorage.removeItem('urumi_user');
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Re-login needed
      console.warn('Session expired or unauthorized');
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Request failed with HTTP ${res.status}`);
    }
    return data;
  }

  static async login(email: string, password: string):Promise<{ token: string; user: User }> {
    const data = await this.request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setAuth(data.token, data.user);
    return data;
  }

  static async getServers(): Promise<ServerRecord[]> {
    const data = await this.request<{ servers: ServerRecord[] }>('/api/servers');
    return data.servers;
  }

  static async getServerTools(id: string): Promise<any[]> {
    const data = await this.request<{ tools: any[] }>(`/api/servers/${id}/tools`);
    return data.tools;
  }

  static async toggleServer(id: string): Promise<{ id: string; enabled: boolean }> {
    return await this.request<{ id: string; enabled: boolean }>(`/api/servers/${id}/toggle`, {
      method: 'PATCH',
    });
  }

  static async addServer(server: { name: string; url: string; bearer_token?: string }): Promise<any> {
    return await this.request('/api/servers', {
      method: 'POST',
      body: JSON.stringify(server),
    });
  }

  static async deleteServer(id: string): Promise<any> {
    return await this.request(`/api/servers/${id}`, {
      method: 'DELETE',
    });
  }

  static async getKeys(): Promise<ApiKeyRecord[]> {
    const data = await this.request<{ keys: ApiKeyRecord[] }>('/api/keys');
    return data.keys;
  }

  static async createKey(name: string): Promise<{ apiKey: string; id: string; name: string }> {
    return await this.request('/api/keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  static async revokeKey(id: string): Promise<any> {
    return await this.request(`/api/keys/${id}/revoke`, {
      method: 'POST',
    });
  }

  static async getAuditLogs(params: { limit?: number; offset?: number; search?: string; status?: string; server?: string } = {}): Promise<{ logs: AuditLogRecord[]; total: number }> {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', String(params.limit));
    if (params.offset) query.append('offset', String(params.offset));
    if (params.search) query.append('search', params.search);
    if (params.status) query.append('status', params.status);
    if (params.server) query.append('server', params.server);

    return await this.request<{ logs: AuditLogRecord[]; total: number }>(`/api/audit-logs?${query.toString()}`);
  }

  static async sendChatMessage(prompt: string, history: Array<{ role: string; content: string }>): Promise<{ reply: string; toolCalls: any[] }> {
    return await this.request<{ reply: string; toolCalls: any[] }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt, history }),
    });
  }
}
