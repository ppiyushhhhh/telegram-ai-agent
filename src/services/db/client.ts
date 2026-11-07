import type { DbUser, DbConversation, DbMessage } from './schema';
import { AppError } from '../../middleware/error-handler';
import { ERROR_CODES } from '../../config/constants';

export class DatabaseService {
  constructor(private readonly db: D1Database) {
    if (!db) {
      throw new AppError('Cloudflare D1 Database binding is missing', 500, ERROR_CODES.DATABASE_ERROR);
    }
  }

  public async upsertUser(user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    is_allowed: boolean;
  }): Promise<void> {
    const isAllowedInt = user.is_allowed ? 1 : 0;
    await this.db
      .prepare(
        `INSERT INTO users (id, first_name, last_name, username, is_allowed, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           first_name = excluded.first_name,
           last_name = excluded.last_name,
           username = excluded.username,
           updated_at = datetime('now')`
      )
      .bind(user.id, user.first_name, user.last_name || null, user.username || null, isAllowedInt)
      .run();
  }

  public async getUser(id: number): Promise<DbUser | null> {
    return this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<DbUser>();
  }

  public async getOrCreateConversation(chatId: number, userId: number, model: string): Promise<DbConversation> {
    let conv = await this.db
      .prepare('SELECT * FROM conversations WHERE telegram_chat_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(chatId)
      .first<DbConversation>();

    if (!conv) {
      const convId = crypto.randomUUID();
      await this.db
        .prepare(
          `INSERT INTO conversations (id, telegram_chat_id, user_id, model)
           VALUES (?, ?, ?, ?)`
        )
        .bind(convId, chatId, userId, model)
        .run();

      conv = {
        id: convId,
        telegram_chat_id: chatId,
        user_id: userId,
        model,
        system_prompt: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    return conv;
  }

  public async resetConversation(chatId: number): Promise<boolean> {
    const conv = await this.db
      .prepare('SELECT id FROM conversations WHERE telegram_chat_id = ?')
      .bind(chatId)
      .first<{ id: string }>();

    if (conv) {
      await this.db
        .prepare('DELETE FROM messages WHERE conversation_id = ?')
        .bind(conv.id)
        .run();
      await this.db
        .prepare('UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?')
        .bind(conv.id)
        .run();
      return true;
    }
    return false;
  }

  public async getUserStats(userId: number): Promise<{ messageCount: number; conversationCount: number }> {
    const [msgCount, convCount] = await Promise.all([
      this.db
        .prepare(
          `SELECT count(*) as count FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           WHERE c.user_id = ?`
        )
        .bind(userId)
        .first<{ count: number }>(),
      this.db
        .prepare('SELECT count(*) as count FROM conversations WHERE user_id = ?')
        .bind(userId)
        .first<{ count: number }>()
    ]);

    return {
      messageCount: msgCount?.count || 0,
      conversationCount: convCount?.count || 0
    };
  }

  public async getRecentMessages(conversationId: string, limit = 10): Promise<DbMessage[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC
           LIMIT ?
         ) ORDER BY created_at ASC`
      )
      .bind(conversationId, limit)
      .all<DbMessage>();

    return results.results || [];
  }

  public async saveMessage(msg: {
    conversationId: string;
    telegramMessageId?: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokensUsed?: number;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, telegram_message_id, role, content, tokens_used)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        msg.conversationId,
        msg.telegramMessageId || null,
        msg.role,
        msg.content,
        msg.tokensUsed || 0
      )
      .run();
    return id;
  }

  public async logEvent(eventType: string, userId?: number, chatId?: number, payload?: Record<string, unknown>): Promise<void> {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO audit_logs (id, event_type, user_id, chat_id, payload)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, eventType, userId || null, chatId || null, payload ? JSON.stringify(payload) : null)
      .run();
  }

  public async getAllUsers(): Promise<DbUser[]> {
    const res = await this.db.prepare('SELECT * FROM users ORDER BY updated_at DESC').all<DbUser>();
    return res.results || [];
  }

  public async setUserAllowed(userId: number, allowed: boolean): Promise<boolean> {
    const res = await this.db
      .prepare('UPDATE users SET is_allowed = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(allowed ? 1 : 0, userId)
      .run();
    return res.success;
  }

  public async getAllConversations(limit = 50): Promise<DbConversation[]> {
    const res = await this.db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?')
      .bind(limit)
      .all<DbConversation>();
    return res.results || [];
  }

  public async getAuditLogs(limit = 100): Promise<any[]> {
    const res = await this.db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all();
    return res.results || [];
  }

  public async getStats(): Promise<{
    totalUsers: number;
    allowedUsers: number;
    totalConversations: number;
    totalMessages: number;
    totalAuditLogs: number;
  }> {
    const [u, au, c, m, a] = await Promise.all([
      this.db.prepare('SELECT count(*) as count FROM users').first<{ count: number }>(),
      this.db.prepare('SELECT count(*) as count FROM users WHERE is_allowed = 1').first<{ count: number }>(),
      this.db.prepare('SELECT count(*) as count FROM conversations').first<{ count: number }>(),
      this.db.prepare('SELECT count(*) as count FROM messages').first<{ count: number }>(),
      this.db.prepare('SELECT count(*) as count FROM audit_logs').first<{ count: number }>()
    ]);

    return {
      totalUsers: u?.count || 0,
      allowedUsers: au?.count || 0,
      totalConversations: c?.count || 0,
      totalMessages: m?.count || 0,
      totalAuditLogs: a?.count || 0
    };
  }
}
