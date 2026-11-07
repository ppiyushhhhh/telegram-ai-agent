export interface SystemOverview {
  version: string;
  environment: string;
  model: string;
  uptimeSeconds: number;
  stats: {
    totalUsers: number;
    allowedUsers: number;
    totalConversations: number;
    totalMessages: number;
    totalAuditLogs: number;
  };
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: { status: 'ok' | 'failed' | 'not_configured'; latencyMs?: number; message?: string };
    telegram: { status: 'configured' | 'missing_token' | 'missing_secret' };
    openai: { status: 'configured' | 'missing_key'; model: string };
  };
}

export interface AdminUser {
  id: number;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
  is_allowed: number;
  created_at: string;
  updated_at: string;
}

export interface AdminConversation {
  id: string;
  telegram_chat_id: number;
  user_id: number;
  model: string;
  system_prompt?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminMessage {
  id: string;
  conversation_id: string;
  telegram_message_id?: number | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens_used: number;
  created_at: string;
}

export interface AdminAuditLog {
  id: string;
  event_type: string;
  user_id?: number | null;
  chat_id?: number | null;
  payload?: string | null;
  created_at: string;
}

export class DashboardApiClient {
  constructor(private baseUrl: string = '', private adminKey: string = '') {}

  public setAdminKey(key: string) {
    this.adminKey = key;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (this.adminKey) {
      headers.set('x-admin-key', this.adminKey);
    }
    headers.set('Content-Type', 'application/json');

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return data.data;
  }

  public async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/health');
  }

  public async getOverview(): Promise<SystemOverview> {
    return this.request<SystemOverview>('/api/admin/overview');
  }

  public async getUsers(): Promise<AdminUser[]> {
    return this.request<AdminUser[]>('/api/admin/users');
  }

  public async allowUser(userId: number): Promise<void> {
    await this.request(`/api/admin/users/${userId}/allow`, { method: 'POST' });
  }

  public async denyUser(userId: number): Promise<void> {
    await this.request(`/api/admin/users/${userId}/deny`, { method: 'POST' });
  }

  public async getConversations(): Promise<AdminConversation[]> {
    return this.request<AdminConversation[]>('/api/admin/conversations');
  }

  public async getMessages(conversationId: string): Promise<AdminMessage[]> {
    return this.request<AdminMessage[]>(`/api/admin/conversations/${conversationId}/messages`);
  }

  public async getLogs(): Promise<AdminAuditLog[]> {
    return this.request<AdminAuditLog[]>('/api/admin/logs');
  }
}

export const api = new DashboardApiClient();
