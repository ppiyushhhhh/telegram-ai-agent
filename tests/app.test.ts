import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
import type { Env } from '../src/types';
import { UnifiedAIService } from '../src/services/ai/unified';

const processedUpdateIds = new Set<number>();
const usersMap = new Map<number, any>();
const conversationsMap = new Map<number, any>();
const messagesList: any[] = [];
const aiUsageList: any[] = [];

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
let shouldFailWorkersAI = false;
const mockWorkersAiBinding: any = {
  run: async (model: string, options: any) => {
    if (shouldFailWorkersAI) {
      throw new Error('Cloudflare Workers AI compute capacity unavailable or rate limited');
    }
    if (model.includes('bge') || model.includes('embedding') || model.includes('qwen3-embedding')) {
      return { shape: [1, 768], data: [[0.12, 0.34, 0.56, 0.78]] };
    }
    return {
      response: 'Hello from Cloudflare Workers AI edge model (@cf/meta/llama-3.3-70b-instruct)!'
    };
  }
};

// Base mock environment with Gemini as Primary, Workers AI as Secondary, and NO OpenAI key
const mockEnv: Env = {
  DB: mockD1 as D1Database,
  AI: mockWorkersAiBinding,
  APP_ENV: 'uat',
  LOG_LEVEL: 'info',
  TELEGRAM_BOT_TOKEN: '123456:mock_token_for_tests',
  TELEGRAM_WEBHOOK_SECRET: 'test_webhook_secret_key_123',
  PRIMARY_AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'AIzaSyMockGeminiKeyForAutomatedTests',
  GEMINI_MODEL: 'gemini-3.8-flash',
  WORKERS_AI_MODEL: '@cf/meta/llama-3.3-70b-instruct',
  ALLOWED_TELEGRAM_USER_IDS: '9084869490',
  TELEGRAM_BOT_USERNAME: 'PiyushPersonalAssistantBot',
  ADMIN_API_KEY: 'test_admin_secret_key_999'
  // OPENAI_API_KEY is deliberately omitted: demonstrates zero OpenAI dependency!
};

describe('Telegram AI Agent - Full Integration Test Suite', () => {
  const app = createApp();
  let originalFetch: typeof globalThis.fetch;
  let shouldFailGemini = false;
  let shouldFailOpenAI = false;

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

      // Google Gemini API mock
      if (url.includes('generativelanguage.googleapis.com')) {
        if (shouldFailGemini) {
          return new Response(
            JSON.stringify({
              error: { message: 'Gemini 3.8 Flash rate limit quota exceeded (HTTP 429)' }
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.includes(':generateContent')) {
          return new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [{ text: 'Hello! I am your AI assistant powered by Google Gemini 3.8 Flash.' }]
                  },
                  finishReason: 'STOP'
                }
              ],
              usageMetadata: {
                promptTokenCount: 15,
                candidatesTokenCount: 25,
                totalTokenCount: 40
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.includes(':embedContent')) {
          return new Response(
            JSON.stringify({
              embedding: {
                values: [0.01, 0.02, 0.03, 0.04]
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      // OpenAI API mock (Optional tertiary provider)
      if (url.includes('api.openai.com')) {
        if (shouldFailOpenAI) {
          return new Response(
            JSON.stringify({
              error: { message: 'OpenAI rate limit exceeded' }
            }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-mock-123',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'Hello from OpenAI tertiary provider.'
                },
                finish_reason: 'stop'
              }
            ],
            usage: {
              prompt_tokens: 15,
              completion_tokens: 25,
              total_tokens: 40
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return originalFetch(input, init);
    }) as any;
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Service Health & Metadata
  it('GET / should return online service metadata', async () => {
    const res = await app.request('/', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 200);

    const body = await res.json<{ success: boolean; data: { name: string; status: string } }>();
    assert.equal(body.success, true);
    assert.equal(body.data.name, 'telegram-ai-agent');
    assert.equal(body.data.status, 'online');
  });

  it('GET /health should return system status with Gemini Primary, Workers AI Secondary, and OpenAI optional', async () => {
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
            gemini: { status: string; model: string };
            workersAi: { status: string; model: string };
            openai: { status: string; model: string };
          };
        };
      };
    }>();

    assert.equal(body.success, true);
    assert.equal(body.data.status, 'healthy');
    assert.equal(body.data.checks.database.status, 'ok');
    assert.equal(body.data.checks.telegram.status, 'configured');
    assert.equal(body.data.checks.aiProviders.primary, 'gemini');
    assert.equal(body.data.checks.aiProviders.gemini.status, 'configured');
    assert.equal(body.data.checks.aiProviders.gemini.model, 'gemini-3.8-flash');
    assert.equal(body.data.checks.aiProviders.workersAi.status, 'configured');
    assert.equal(body.data.checks.aiProviders.openai.status, 'not_configured');
  });

  // 2. Webhook Verification
  it('POST /webhooks/telegram should reject requests missing secret header with 401', async () => {
    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 1 })
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
          'x-telegram-bot-api-secret-token': 'wrong_secret_value'
        },
        body: JSON.stringify({ update_id: 2 })
      },
      mockEnv
    );

    assert.equal(res.status, 401);
    const body = await res.json<{ success: boolean; error: { code: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  // 3. User Authorization (Numeric Telegram user ID allowlist)
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
          update_id: 10,
          message: {
            message_id: 1,
            from: { id: 999999, first_name: 'Attacker', is_bot: false },
            chat: { id: 999999, type: 'private' },
            text: 'Hello from unauthorized user'
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
          update_id: 11,
          message: {
            message_id: 2,
            from: { id: 9084869490, first_name: 'AuthorizedUser', is_bot: false },
            chat: { id: -1001234567, type: 'group' },
            text: 'Hello group'
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

  // 5. Bot Commands (/start, /help, /status, /new, /clear)
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

  // 6. Duplicate Update Prevention (Idempotency)
  it('POST /webhooks/telegram should process first update and ignore duplicate update_id', async () => {
    const updatePayload = {
      update_id: 777,
      message: {
        message_id: 200,
        from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
        chat: { id: 9084869490, type: 'private' },
        text: 'What is Cloudflare Workers?'
      }
    };

    // First delivery (executes with Gemini primary)
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
    const body1 = await res1.json<{ success: boolean; provider: string }>();
    assert.equal(body1.success, true);
    assert.equal(body1.provider, 'gemini');

    // Duplicate delivery with same update_id
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

  // 7. Automated Fallback: Gemini Primary -> Cloudflare Workers AI Secondary
  it('POST /webhooks/telegram should automatically fall back to Workers AI when Gemini rate limits', async () => {
    shouldFailGemini = true; // Simulate 429 rate limit or Gemini failure

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

    shouldFailGemini = false;
    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; provider: string; model: string }>();
    assert.equal(body.success, true);
    assert.equal(body.provider, 'workers-ai');
  });

  // 8. Missing Credentials Fallback Handling
  it('POST /webhooks/telegram should cleanly fall back to Workers AI if GEMINI_API_KEY is not configured', async () => {
    const envWithoutGeminiKey: Env = {
      ...mockEnv,
      GEMINI_API_KEY: undefined
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
          update_id: 889,
          message: {
            message_id: 202,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: 'Hello without Gemini key'
          }
        })
      },
      envWithoutGeminiKey
    );

    assert.equal(res.status, 200);
    const body = await res.json<{ success: boolean; provider: string }>();
    assert.equal(body.success, true);
    assert.equal(body.provider, 'workers-ai');
  });

  // 9. All Providers Failure Handling
  it('POST /webhooks/telegram should gracefully report 500 when all configured providers fail', async () => {
    shouldFailGemini = true;
    shouldFailWorkersAI = true;

    const res = await app.request(
      '/webhooks/telegram',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test_webhook_secret_key_123'
        },
        body: JSON.stringify({
          update_id: 890,
          message: {
            message_id: 203,
            from: { id: 9084869490, first_name: 'Piyush', is_bot: false },
            chat: { id: 9084869490, type: 'private' },
            text: 'Both providers failing'
          }
        })
      },
      mockEnv
    );

    shouldFailGemini = false;
    shouldFailWorkersAI = false;

    assert.equal(res.status, 500);
    const body = await res.json<{ success: boolean; error: string }>();
    assert.equal(body.success, false);
  });

  // 10. Optional Tertiary OpenAI Provider (Executed ONLY when credentials supplied)
  it('UnifiedAIService should fall back to OpenAI as tertiary provider if Gemini and Workers AI fail and OpenAI key is provided', async () => {
    shouldFailGemini = true;
    shouldFailWorkersAI = true;

    const envWithOpenAI: Env = {
      ...mockEnv,
      OPENAI_API_KEY: 'sk-mock-key-for-test-fallback'
    };

    const unified = new UnifiedAIService(envWithOpenAI);
    const result = await unified.generateChatResponse([
      { role: 'user', content: 'Fallback to optional tertiary provider' }
    ]);

    shouldFailGemini = false;
    shouldFailWorkersAI = false;

    assert.equal(result.provider, 'openai');
    assert.match(result.text, /OpenAI tertiary provider/);
  });

  // 11. Vector Embeddings Generation & Fallback
  it('UnifiedAIService should generate embeddings using gemini-embedding-2 and fall back to Workers AI', async () => {
    const unified = new UnifiedAIService(mockEnv);
    const embResult = await unified.generateEmbedding('Test memory sentence');

    assert.equal(embResult.provider, 'gemini');
    assert.equal(embResult.dimensions, 4);

    // Now test fallback to Workers AI embedding
    shouldFailGemini = true;
    const fallbackEmb = await unified.generateEmbedding('Test fallback memory');
    shouldFailGemini = false;

    assert.equal(fallbackEmb.provider, 'workers-ai');
    assert.equal(fallbackEmb.dimensions, 4);
  });

  // 12. Admin API Endpoints
  it('GET /api/admin/overview should reject requests without x-admin-key', async () => {
    const res = await app.request('/api/admin/overview', { method: 'GET' }, mockEnv);
    assert.equal(res.status, 401);
    const body = await res.json<{ success: boolean; error: { code: string } }>();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  it('GET /api/admin/overview should return system stats and Gemini primary model with valid x-admin-key', async () => {
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
    assert.equal(body.data.primaryProvider, 'gemini');
    assert.equal(body.data.model, 'gemini-3.8-flash');
  });

  // 13. Telegram Webhook Admin Management
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
});
