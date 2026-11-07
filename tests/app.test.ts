import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import type { Env } from '../src/types';

const mockEnv: Env = {
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ test: 1 }),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true })
      }),
      first: async () => ({ test: 1 }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true })
    }),
    dump: async () => new ArrayBuffer(0),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
    withSession: () => ({} as any)
  } as unknown as D1Database,
  APP_ENV: 'uat',
  LOG_LEVEL: 'info',
  TELEGRAM_BOT_TOKEN: '123456:mock_token_for_tests',
  TELEGRAM_WEBHOOK_SECRET: 'test_webhook_secret_key_123',
  OPENAI_API_KEY: 'sk-mock-key-for-tests',
  OPENAI_MODEL: 'gpt-4o-mini',
  ALLOWED_TELEGRAM_USER_IDS: '111,222',
  ADMIN_API_KEY: 'test_admin_secret_key_999'
};

describe('Telegram AI Agent - Core API Tests', () => {
  const app = createApp();

  it('GET / should return online service metadata', async () => {
    const res = await app.request('/', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 200);

    const body = await res.json<{ success: boolean; data: { name: string; status: string } }>();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'telegram-ai-agent');
    assert.equal(body.data.status, 'online');
  });

  it('GET /health should return system status and component checks', async () => {
    const res = await app.request('/health', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 200);

    const body = await res.json<{
      success: boolean;
      data: {
        status: string;
        environment: string;
        checks: {
          database: { status: string };
          telegram: { status: string };
          aiProviders: {
            primary: string;
            openai: { status: string };
            gemini: { status: string };
          };
          storage: {
            r2: string;
            vectorize: string;
            queues: string;
          };
        };
      };
    }>();

    assert.equal(body.success, true);
    assert.equal(body.data.status, 'healthy');
    assert.equal(body.data.environment, 'uat');
    assert.equal(body.data.checks.database.status, 'ok');
    assert.equal(body.data.checks.telegram.status, 'configured');
    assert.equal(body.data.checks.aiProviders.openai.status, 'configured');
    assert.equal(body.data.checks.aiProviders.primary, 'openai');
  });

  it('POST /telegram/webhook should reject requests missing secret header', async () => {
    const res = await app.request(
      '/telegram/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 1 })
      },
      mockEnv
    );

    assert.equal(res.status, 401);
    const body = await res.json<{ success: boolean; error: { code: string; message: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('GET /invalid-route should trigger 404 handler with structured error', async () => {
    const res = await app.request('/non-existent-route-404', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 404);

    const body = await res.json<{ success: boolean; error: { code: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('GET /api/admin/overview should reject requests without x-admin-key', async () => {
    const res = await app.request('/api/admin/overview', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 401);
    const body = await res.json<{ success: boolean; error: { code: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('GET /api/admin/overview should return system stats with valid x-admin-key', async () => {
    const res = await app.request(
      '/api/admin/overview',
      {
        method: 'GET',
        headers: { 'x-admin-key': 'test_admin_secret_key_999' }
      },
      mockEnv
    );
    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; data: { environment: string; model: string } }>();
    assert.equal(body.success, true);
    assert.equal(body.data.environment, 'uat');
    assert.equal(body.data.model, 'gpt-4o-mini');
  });

  it('GET /api/admin/config should return non-sensitive parameters with valid x-admin-key', async () => {
    const res = await app.request(
      '/api/admin/config',
      {
        method: 'GET',
        headers: { 'x-admin-key': 'test_admin_secret_key_999' }
      },
      mockEnv
    );
    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; data: { temperature: number; maxTokens: number } }>();
    assert.equal(body.success, true);
    assert.equal(typeof body.data.temperature, 'number');
  });
});
