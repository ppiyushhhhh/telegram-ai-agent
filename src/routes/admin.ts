import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { adminAuthMiddleware } from '../middleware/admin-auth';
import { DatabaseService } from '../services/db/client';
import { TelegramClient } from '../services/telegram/client';
import { APP_VERSION, DEFAULT_BOT_USERNAME } from '../config/constants';

export const adminRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply admin key authentication to all admin routes
adminRouter.use('*', adminAuthMiddleware);

// 1. Overview & System Statistics
adminRouter.get('/overview', async (c) => {
  const dbService = c.env.DB ? new DatabaseService(c.env.DB) : null;
  const [stats, usage] = await Promise.all([
    dbService
      ? dbService.getStats()
      : {
          totalUsers: 0,
          allowedUsers: 0,
          totalConversations: 0,
          totalMessages: 0,
          totalAuditLogs: 0
        },
    dbService
      ? dbService.getTotalUsageStats()
      : { totalTokens: 0, totalCostUsd: 0 }
  ]);

  const primaryProvider = c.env.PRIMARY_AI_PROVIDER || 'gemini';
  const activeModel = primaryProvider === 'gemini'
    ? (c.env.GEMINI_MODEL || 'gemini-3.8-flash')
    : primaryProvider === 'workers-ai'
    ? (c.env.WORKERS_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct')
    : (c.env.OPENAI_MODEL || 'gpt-4o-mini');

  const botUsername = c.env.TELEGRAM_BOT_USERNAME || DEFAULT_BOT_USERNAME;

  return c.json({
    success: true,
    data: {
      version: APP_VERSION,
      environment: c.env.APP_ENV || 'development',
      primaryProvider,
      botUsername,
      stats,
      usage,
      model: activeModel,
      uptimeSeconds: Math.floor(performance.now() / 1000)
    }
  });
});

// 2. Users Management
adminRouter.get('/users', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database binding unavailable' }, 500);
  }
  const db = new DatabaseService(c.env.DB);
  const users = await db.getAllUsers();
  return c.json({ success: true, data: users });
});

adminRouter.post('/users/:id/allow', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database binding unavailable' }, 500);
  }
  const userId = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(userId)) {
    return c.json({ success: false, error: 'Invalid user ID' }, 400);
  }

  const db = new DatabaseService(c.env.DB);
  await db.setUserAllowed(userId, true);
  await db.logEvent('ADMIN_USER_ALLOWED', userId, undefined, { updatedBy: 'admin' });

  return c.json({ success: true, message: `User ${userId} whitelisted` });
});

adminRouter.post('/users/:id/deny', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database binding unavailable' }, 500);
  }
  const userId = parseInt(c.req.param('id'), 10);
  if (Number.isNaN(userId)) {
    return c.json({ success: false, error: 'Invalid user ID' }, 400);
  }

  const db = new DatabaseService(c.env.DB);
  await db.setUserAllowed(userId, false);
  await db.logEvent('ADMIN_USER_DENIED', userId, undefined, { updatedBy: 'admin' });

  return c.json({ success: true, message: `User ${userId} blocked` });
});

// 3. Conversations & Messages
adminRouter.get('/conversations', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database binding unavailable' }, 500);
  }
  const db = new DatabaseService(c.env.DB);
  const conversations = await db.getAllConversations(50);
  return c.json({ success: true, data: conversations });
});

adminRouter.get('/conversations/:id/messages', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database binding unavailable' }, 500);
  }
  const convId = c.req.param('id');
  const db = new DatabaseService(c.env.DB);
  const messages = await db.getRecentMessages(convId, 100);
  return c.json({ success: true, data: messages });
});

// 4. Audit & Security Logs
adminRouter.get('/logs', async (c) => {
  if (!c.env.DB) {
    return c.json({ success: false, error: 'Database binding unavailable' }, 500);
  }
  const db = new DatabaseService(c.env.DB);
  const logs = await db.getAuditLogs(100);
  return c.json({ success: true, data: logs });
});

// 5. Configuration & Model Settings
adminRouter.get('/config', (c) => {
  const primaryProvider = c.env.PRIMARY_AI_PROVIDER || 'gemini';
  const activeModel = primaryProvider === 'gemini'
    ? (c.env.GEMINI_MODEL || 'gemini-3.8-flash')
    : primaryProvider === 'workers-ai'
    ? (c.env.WORKERS_AI_MODEL || '@cf/meta/llama-3.3-70b-instruct')
    : (c.env.OPENAI_MODEL || 'gpt-4o-mini');

  return c.json({
    success: true,
    data: {
      environment: c.env.APP_ENV || 'development',
      primaryProvider,
      model: activeModel,
      temperature: c.env.AI_TEMPERATURE ? parseFloat(c.env.AI_TEMPERATURE) : 0.7,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : 1000,
      rateLimit: c.env.RATE_LIMIT_PER_MINUTE ? parseInt(c.env.RATE_LIMIT_PER_MINUTE, 10) : 30
    }
  });
});

// 6. Telegram Webhook Management (Protected Admin Endpoints)
adminRouter.get('/telegram/webhook-info', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ success: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }, 400);
  }
  const telegramClient = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
  const info = await telegramClient.getWebhookInfo();
  return c.json({ success: true, data: info });
});

adminRouter.post('/telegram/set-webhook', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ success: false, error: 'Telegram bot token or webhook secret is not configured' }, 400);
  }
  const body = (await c.req.json().catch(() => ({}))) as { url?: string };
  const url = body.url;
  if (!url || !url.startsWith('https://')) {
    return c.json({ success: false, error: 'A valid HTTPS worker URL is required to register the Telegram webhook' }, 400);
  }
  const webhookUrl = `${url.replace(/\/$/, '')}/webhooks/telegram`;
  const telegramClient = new TelegramClient(c.env.TELEGRAM_BOT_TOKEN);
  const result = await telegramClient.setWebhook({
    url: webhookUrl,
    secret_token: c.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message']
  });
  return c.json({ success: true, message: 'Telegram webhook configured successfully', webhookUrl, result });
});
