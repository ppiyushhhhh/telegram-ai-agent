import { Hono } from 'hono';
import type { Env, AppVariables } from '../types';
import { adminAuthMiddleware } from '../middleware/admin-auth';
import { DatabaseService } from '../services/db/client';
import { APP_VERSION } from '../config/constants';

export const adminRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Apply admin key authentication to all admin routes
adminRouter.use('*', adminAuthMiddleware);

// 1. Overview & System Statistics
adminRouter.get('/overview', async (c) => {
  const dbService = c.env.DB ? new DatabaseService(c.env.DB) : null;
  const stats = dbService
    ? await dbService.getStats()
    : {
        totalUsers: 0,
        allowedUsers: 0,
        totalConversations: 0,
        totalMessages: 0,
        totalAuditLogs: 0
      };

  return c.json({
    success: true,
    data: {
      version: APP_VERSION,
      environment: c.env.APP_ENV || 'development',
      stats,
      model: c.env.OPENAI_MODEL || 'gpt-4o-mini',
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
  return c.json({
    success: true,
    data: {
      environment: c.env.APP_ENV || 'development',
      model: c.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: c.env.AI_TEMPERATURE ? parseFloat(c.env.AI_TEMPERATURE) : 0.7,
      maxTokens: c.env.MAX_TOKENS ? parseInt(c.env.MAX_TOKENS, 10) : 1000,
      rateLimit: c.env.RATE_LIMIT_PER_MINUTE ? parseInt(c.env.RATE_LIMIT_PER_MINUTE, 10) : 30
    }
  });
});
