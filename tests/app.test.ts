import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import type { Env } from '../src/types';
import { UnifiedAIService } from '../src/services/ai/unified';
import { SemanticMemoryService } from '../src/services/memory/semantic';
import { processDueReminders } from '../src/services/scheduler/reminder-processor';
import {
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_WORKERS_AI_FALLBACK_MODELS,
  DEFAULT_WORKERS_AI_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
} from '../src/config/constants';

const processedUpdateIds = new Set<number>();
const usersMap = new Map<number, any>();
const conversationsMap = new Map<number, any>();
const messagesList: any[] = [];
const aiUsageList: any[] = [];
const remindersList: any[] = [];

// In-memory mock Cloudflare D1 Database
const mockD1: any = {
  prepare: (query: string) => {
    return {
      bind: (...args: any[]) => {
        return {
          first: async <T>() => {
            if (query.includes('SELECT 1')) return { test: 1 } as T;
            if (query.includes('FROM processed_updates WHERE update_id = ?')) {
              const id = args[0];
              return processedUpdateIds.has(id) ? ({ update_id: id } as T) : null;
            }
            if (query.includes('FROM users WHERE id = ?')) {
              const id = args[0];
              return (usersMap.get(id) || null) as T;
            }
            if (query.includes('FROM conversations WHERE telegram_chat_id = ?')) {
              const chatId = args[0];
              return (conversationsMap.get(chatId) || null) as T;
            }
            if (query.includes('SELECT sum(total_tokens)')) {
              return { totalTokens: 150, totalCostUsd: 0.00009 } as T;
            }
            if (query.includes('SELECT count(*) as count FROM')) {
              return { count: 5 } as T;
            }
            return null as T;
          },
          all: async <T>() => {
            if (query.includes('FROM messages')) {
              return { results: messagesList } as any;
            }
            if (query.includes('FROM users')) {
              return { results: Array.from(usersMap.values()) } as any;
            }
            if (query.includes('FROM conversations')) {
              return { results: Array.from(conversationsMap.values()) } as any;
            }
            if (query.includes('FROM reminders')) {
              if (query.includes('user_id = ?')) {
                const uid = args[0];
                return { results: remindersList.filter((r) => r.user_id === uid && r.is_sent === 0) } as any;
              }
              return { results: remindersList.filter((r) => r.is_sent === 0) } as any;
            }
            return { results: [] } as any;
          },
          run: async () => {
            if (query.includes('INSERT OR IGNORE INTO processed_updates')) {
              processedUpdateIds.add(args[0]);
              return { success: true };
            }
            if (query.includes('INSERT INTO users')) {
              usersMap.set(args[0], { id: args[0], first_name: args[1], is_allowed: args[4] });
              return { success: true };
            }
            if (query.includes('INSERT INTO conversations')) {
              conversationsMap.set(args[1], { id: args[0], telegram_chat_id: args[1], user_id: args[2], model: args[3] });
              return { success: true };
            }
            if (query.includes('INSERT INTO messages')) {
              messagesList.push({ id: args[0], conversation_id: args[1], role: args[3], content: args[4] });
              return { success: true };
            }
            if (query.includes('INSERT INTO ai_usage')) {
              aiUsageList.push({ id: args[0], user_id: args[1], total_tokens: args[7] });
              return { success: true };
            }
            if (query.includes('INSERT INTO reminders')) {
              remindersList.push({
                id: args[0],
                user_id: args[1],
                chat_id: args[2],
                reminder_text: args[3],
                remind_at: args[4],
                is_sent: 0
              });
              return { success: true };
            }
            if (query.includes('UPDATE reminders') && query.includes('is_sent = 1')) {
              const r = remindersList.find((x) => x.id === args[0]);
              if (r) r.is_sent = 1;
              return { success: true };
            }
            if (query.includes('DELETE FROM reminders')) {
              const uid = args[0];
              const remaining = remindersList.filter((r) => r.user_id !== uid);
              remindersList.length = 0;
              remindersList.push(...remaining);
              return { success: true };
            }
            if (query.includes('DELETE FROM messages')) {
              messagesList.length = 0;
              return { success: true };
            }
            return { success: true };
          }
        };
      },
      first: async () => ({ test: 1 }),
      all: async () => ({ results: [] }),
      run: async () => ({ success: true })
    };
  },
  dump: async () => new ArrayBuffer(0),
  batch: async () => [],
  exec: async () => ({ count: 0, duration: 0 }),
  withSession: () => ({} as any)
};

// Cloudflare Workers AI Mock Binding (Zero API credentials needed)
let shouldFailPrimaryWorkersAI = false;
let shouldFailAllWorkersAI = false;
let lastModelInvoked = '';

const mockWorkersAiBinding: any = {
  run: async (model: string, options: any) => {
    lastModelInvoked = model;
    if (shouldFailAllWorkersAI) {
      throw new Error('Cloudflare Workers AI compute capacity unavailable or rate limited');
    }
    if (shouldFailPrimaryWorkersAI && model === DEFAULT_WORKERS_AI_MODEL) {
      throw new Error(`Model ${model} overloaded, capacity constrained`);
    }
    if (model.includes('bge') || model.includes('embedding')) {
      // 768-dimensional embedding vector
      const vector = new Array(768).fill(0.05);
      return { shape: [1, 768], data: [vector] };
    }
    return {
      response: `Response generated by ${model} on Cloudflare Workers AI edge.`
    };
  }
};

// Mock Vectorize Index for Semantic Memory
const mockVectorizeIndex: any = {
  query: async () => ({
    matches: [
      {
        id: 'mem_1',
        score: 0.92,
        metadata: { userId: 9084869490, content: 'User prefers concise responses with bullet points' }
      }
    ]
  }),
  insert: async () => ({ mutationId: 'mut_1' }),
  upsert: async () => ({ mutationId: 'mut_2' })
};

// Base mock environment with Workers AI as sole provider
const mockEnv: Env = {
  DB: mockD1 as D1Database,
  AI: mockWorkersAiBinding,
  VECTOR_INDEX: mockVectorizeIndex,
  APP_ENV: 'uat',
  LOG_LEVEL: 'info',
  TELEGRAM_BOT_TOKEN: '123456:mock_token_for_tests',
  TELEGRAM_WEBHOOK_SECRET: 'test_webhook_secret_key_123',
  PRIMARY_AI_PROVIDER: 'workers-ai',
  WORKERS_AI_MODEL: DEFAULT_WORKERS_AI_MODEL,
  ALLOWED_TELEGRAM_USER_IDS: '9084869490',
  TELEGRAM_BOT_USERNAME: 'ppiyushhhhBot',
  ADMIN_API_KEY: 'test_admin_secret_key_999'
};

describe('Telegram AI Agent - Workers AI Integration Test Suite', () => {
  const app = createApp();
  let originalFetch: typeof globalThis.fetch;

  before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';

      // Telegram Bot API mock
      if (url.includes('api.telegram.org')) {
        return new Response(
          JSON.stringify({
            ok: true,
            result: { message_id: 999, text: 'mocked_telegram_message' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    }) as any;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Health & Service Metadata
  it('GET / should return online service metadata', async () => {
    const res = await app.request('/', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; data: { name: string; status: string } }>();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'telegram-ai-agent');
    assert.equal(body.data.status, 'online');
  });

  it('GET /health should report Workers AI as sole provider with active & fallback models', async () => {
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
            workersAi: {
              status: string;
              model: string;
              fallbackModels: string[];
              embeddingModel: string;
              embeddingDimensions: number;
            };
          };
        };
      };
    }>();

    assert.equal(body.success, true);
    assert.equal(body.data.status, 'healthy');
    assert.equal(body.data.checks.database.status, 'ok');
    assert.equal(body.data.checks.telegram.status, 'configured');
    assert.equal(body.data.checks.aiProviders.primary, 'workers-ai');
    assert.equal(body.data.checks.aiProviders.workersAi.status, 'configured');
    assert.equal(body.data.checks.aiProviders.workersAi.model, DEFAULT_WORKERS_AI_MODEL);
    assert.deepEqual(body.data.checks.aiProviders.workersAi.fallbackModels, DEFAULT_WORKERS_AI_FALLBACK_MODELS);
    assert.equal(body.data.checks.aiProviders.workersAi.embeddingModel, DEFAULT_WORKERS_AI_EMBEDDING_MODEL);
    assert.equal(body.data.checks.aiProviders.workersAi.embeddingDimensions, EMBEDDING_DIMENSIONS);
  });

  // 2. Webhook Security Verification
  it('POST /webhooks/telegram should reject requests missing secret header with 401', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 1, message: { text: 'hi' } })
      },
      mockEnv
    );
    assert.equal(res.status, 401);
    const body = await res.json<{ success: boolean; error: { code: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('POST /webhooks/telegram should reject invalid secret token with 401', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong_secret_token_val'
        },
        body: JSON.stringify({ update_id: 2, message: { text: 'hi' } })
      },
      mockEnv
    );
    assert.equal(res.status, 401);
    const body = await res.json<{ success: boolean; error: { code: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  // 3. User Authorization (Numeric Telegram Allowlist)
  it('POST /webhooks/telegram should block unauthorized Telegram users not in allowlist', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 3,
          message: {
            message_id: 10,
            from: { id: 111222333, first_name: 'Attacker', is_bot: false },
            chat: { id: 111222333, type: 'private' },
            text: 'Hello from unauthorized sender'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Unauthorized user notified');
  });

  // 4. Private Chat Enforcement
  it('POST /webhooks/telegram should reject non-private group chats', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 4,
          message: {
            message_id: 11,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: -100999888, type: 'group' },
            text: 'Hello in a group'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Non-private chat notification sent');
  });

  // 5. Bot Commands
  it('POST /webhooks/telegram should handle /start command', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 20,
          message: {
            message_id: 100,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: '/start'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled /start');
  });

  it('POST /webhooks/telegram should handle /help command', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 21,
          message: {
            message_id: 101,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: '/help'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled /help');
  });

  it('POST /webhooks/telegram should handle /status command', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 22,
          message: {
            message_id: 102,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: '/status'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled /status');
  });

  it('POST /webhooks/telegram should handle /new command', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 23,
          message: {
            message_id: 103,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: '/new'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled /new');
  });

  it('POST /webhooks/telegram should handle /clear command', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 24,
          message: {
            message_id: 104,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: '/clear'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled /clear');
  });

  // 6. Update Idempotency
  it('POST /webhooks/telegram should process first update and ignore duplicate update_id', async () => {
    const uniqueUpdateId = 777123;
    const updatePayload = {
      update_id: uniqueUpdateId,
      message: {
        message_id: 200,
        from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
        chat: { id: 9084869490, type: 'private' },
        text: 'Hello test idempotency'
      }
    };

    // First request should process
    const res1 = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify(updatePayload)
      },
      mockEnv
    );
    assert.equal(res1.status, 200);

    // Duplicate request should be ignored
    const res2 = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify(updatePayload)
      },
      mockEnv
    );
    assert.equal(res2.status, 200);
    const body2 = await res2.json<{ success: boolean; message: string }>();
    assert.equal(body2.success, true);
    assert.equal(body2.message, 'Duplicate update ignored');
  });

  // 7. Workers AI Primary Model Execution
  it('POST /webhooks/telegram should process message with Workers AI primary model', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 888,
          message: {
            message_id: 201,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: 'Tell me about edge computing.'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; provider: string; model: string }>();
    assert.equal(body.success, true);
    assert.equal(body.provider, 'workers-ai');
    assert.equal(body.model, DEFAULT_WORKERS_AI_MODEL);
  });

  // 8. Resilient Multi-Model Fallback
  it('UnifiedAIService should fall back to smaller candidate model when primary 70B fails', async () => {
    shouldFailPrimaryWorkersAI = true;

    const unified = new UnifiedAIService(mockEnv);
    const result = await unified.generateChatResponse([
      { role: 'user', content: 'What is serverless?' }
    ]);

    shouldFailPrimaryWorkersAI = false;

    assert.equal(result.provider, 'workers-ai');
    assert.equal(result.model, DEFAULT_WORKERS_AI_FALLBACK_MODELS[0]);
    assert.match(result.text, /Response generated by/);
  });

  // 9. Missing Binding Handling
  it('UnifiedAIService should fail cleanly with missing AI binding error', async () => {
    const envWithoutAi: Env = {
      ...mockEnv,
      AI: undefined
    };

    const unified = new UnifiedAIService(envWithoutAi);
    await assert.rejects(
      async () => {
        await unified.generateChatResponse([{ role: 'user', content: 'Hi without AI' }]);
      },
      {
        message: /Cloudflare Workers AI binding \(env\.AI\) is not configured/
      }
    );
  });

  // 10. All Model Candidates Failure Handling
  it('UnifiedAIService should handle failures gracefully when all candidates fail', async () => {
    shouldFailAllWorkersAI = true;
    try {
      const unified = new UnifiedAIService(mockEnv);
      await assert.rejects(
        async () => {
          await unified.generateChatResponse([{ role: 'user', content: 'Testing failure' }]);
        },
        {
          message: /Workers AI failed to generate response/
        }
      );
    } finally {
      shouldFailAllWorkersAI = false;
    }
  });

  // 11. 768-dim Vector Embeddings Generation
  it('UnifiedAIService should generate 768-dimensional embeddings using BGE model', async () => {
    const unified = new UnifiedAIService(mockEnv);
    const embResult = await unified.generateEmbedding('Semantic memory sentence');

    assert.equal(embResult.provider, 'workers-ai');
    assert.equal(embResult.dimensions, EMBEDDING_DIMENSIONS);
    assert.equal(embResult.values.length, 768);
  });

  // 12. Semantic Memory Storage & Retrieval
  it('SemanticMemoryService should query and recall relevant memories', async () => {
    const unified = new UnifiedAIService(mockEnv);
    const memoryService = new SemanticMemoryService(mockEnv, unified);

    assert.equal(memoryService.isVectorizeReady(), true);

    const memories = await memoryService.queryRelevantMemories(9084869490, 'preferences', 1);
    assert.equal(memories.length, 1);
    assert.match(memories[0].content, /concise responses/);
  });

  // 13. Admin API Endpoints
  it('GET /api/admin/overview should reject requests without x-admin-key', async () => {
    const res = await app.request('/api/admin/overview', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 401);
    const body = await res.json<{ success: boolean; error: { code: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('GET /api/admin/overview should return Workers AI as sole primary provider', async () => {
    const res = await app.request(
      '/api/admin/overview',
      {
        method: 'GET',
        headers: { 'x-admin-key': 'test_admin_secret_key_999' }
      },
      mockEnv
    );
    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; data: { environment: string; model: string; primaryProvider: string } }>();
    assert.equal(body.success, true);
    assert.equal(body.data.environment, 'uat');
    assert.equal(body.data.primaryProvider, 'workers-ai');
    assert.equal(body.data.model, DEFAULT_WORKERS_AI_MODEL);
  });

  // 14. Telegram Webhook Admin Management
  it('GET /api/admin/telegram/webhook-info should return webhook info with valid x-admin-key', async () => {
    const res = await app.request(
      '/api/admin/telegram/webhook-info',
      {
        method: 'GET',
        headers: { 'x-admin-key': 'test_admin_secret_key_999' }
      },
      mockEnv
    );
    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; data: any }>();
    assert.equal(body.success, true);
  });

  it('POST /api/admin/telegram/set-webhook should register Telegram webhook securely', async () => {
    const res = await app.request(
      '/api/admin/telegram/set-webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'test_admin_secret_key_999'
        },
        body: JSON.stringify({ url: 'https://telegram-ai-agent-uat.workers.dev' })
      },
      mockEnv
    );
    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; webhookUrl: string }>();
    assert.equal(body.success, true);
    assert.equal(body.webhookUrl, 'https://telegram-ai-agent-uat.workers.dev/webhooks/telegram');
  });

  // 15. Durable Objects Concurrency Locking
  it('POST /webhooks/telegram should throttle concurrent requests when Durable Object lock is active', async () => {
    const mockSessionDoNamespace: any = {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({
        acquireLock: async () => false, // Simulate lock collision (already processing)
        releaseLock: async () => {},
        appendEphemeralMessage: async () => {},
        clearSession: async () => {}
      })
    };

    const envWithDo: Env = {
      ...mockEnv,
      SESSION_DO: mockSessionDoNamespace
    };

    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 991,
          message: {
            message_id: 301,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: 'Rapid-fire second message'
          }
        })
      },
      envWithDo
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.match(body.message, /Concurrent request throttled/);
  });

  // 16. Scheduled Reminders & Proactive Notifications
  it('POST /webhooks/telegram should schedule reminder via natural language prompt', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 992,
          message: {
            message_id: 302,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: 'remind me to renew my netflix subscription in 30 minutes'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled reminder creation');
    assert.equal(remindersList.length, 1);
    assert.equal(remindersList[0].reminder_text, 'renew my netflix subscription');
  });

  it('POST /webhooks/telegram should list pending reminders via /reminders', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 993,
          message: {
            message_id: 303,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: '/reminders'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled /reminders');
  });

  it('processDueReminders should dispatch due reminders and mark them as sent', async () => {
    // Force reminder time into the past so it triggers as due
    remindersList[0].remind_at = new Date(Date.now() - 60000).toISOString();

    const result = await processDueReminders(mockEnv);
    assert.equal(result.processed, 1);
    assert.equal(result.sent, 1);
    assert.equal(remindersList[0].is_sent, 1);
  });

  it('POST /webhooks/telegram should cancel reminders via /clearreminders', async () => {
    // Add another pending reminder
    remindersList.push({
      id: 'test_rem_2',
      user_id: 9084869490,
      chat_id: 9084869490,
      reminder_text: 'Buy groceries',
      remind_at: new Date(Date.now() + 3600000).toISOString(),
      is_sent: 0
    });

    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 994,
          message: {
            message_id: 304,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: '/clearreminders'
          }
        })
      },
      mockEnv
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; message: string }>();
    assert.equal(body.success, true);
    assert.equal(body.message, 'Handled /clearreminders');
  });
});
