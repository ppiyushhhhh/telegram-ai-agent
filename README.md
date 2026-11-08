# Telegram AI Agent

A private, enterprise-ready Telegram AI Assistant built from scratch using **TypeScript**, **Cloudflare Workers**, **Hono**, **Cloudflare D1**, **Cloudflare R2**, **Cloudflare Durable Objects**, **Cloudflare Queues**, **Cloudflare Vectorize**, **OpenAI API**, **Gemini API**, and a modern **React + Vite** Admin Dashboard.

---

## 🏗️ Architectural Topology

```
telegram-ai-agent/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Automated typecheck & build validation
│       ├── deploy-uat.yml         # UAT environment staging deployment
│       └── deploy-live.yml        # Production deployment (Requires Manual Approval)
├── dashboard/                     # React + Vite Admin Dashboard
│   ├── src/
│   │   ├── components/            # Health, Whitelist, Conversations, Audit Logs
│   │   ├── services/api.ts        # Typed API client
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── migrations/
│   └── 0001_initial_schema.sql    # D1 SQLite schema (users, convs, messages, audit)
├── src/
│   ├── index.ts                   # Cloudflare Worker fetch entrypoint
│   ├── app.ts                     # Hono application setup & route registry
│   ├── config/
│   │   ├── constants.ts           # Constants, model defaults & error codes
│   │   └── env.ts                 # Zod validation for runtime environment bindings
│   ├── middleware/
│   │   ├── admin-auth.ts          # Admin API key authorization (x-admin-key)
│   │   ├── error-handler.ts       # Centralized error mapping & formatting
│   │   ├── logger.ts              # Structured JSON request logging
│   │   └── telegram-auth.ts       # Telegram webhook secret verification
│   ├── routes/
│   │   ├── admin.ts               # Authenticated Admin REST API (/api/admin/*)
│   │   ├── health.ts              # Deep health-check endpoint (/health, /api/health)
│   │   └── telegram.ts            # Telegram webhook handler & slash commands
│   ├── services/
│   │   ├── db/                    # Cloudflare D1 database operations & models
│   │   ├── openai/                # OpenAI SDK client wrapper (Primary AI provider)
│   │   └── telegram/              # Telegram API client, safe chunker & utilities
│   └── types/
│       └── index.ts               # Worker Env bindings (D1, R2, Vectorize, Queues, DO)
├── tests/
│   └── app.test.ts                # Test suite for health, auth, admin API, routes
├── .dev.vars.example              # Secret template for local development
├── .gitignore                     # Git ignore rules
├── package.json                   # Dependencies, scripts & engine requirements
├── tsconfig.json                  # TypeScript compiler options
├── wrangler.jsonc                 # Cloudflare Wrangler multi-environment config
└── README.md                      # Documentation
```

---

## 🧠 Memory & AI Architecture

1. **Short-Term Memory**:
   - Fast, ephemeral conversational memory managed via Cloudflare D1 / Durable Objects.
   - Preserves multi-turn conversational context with `/new` and `/clear` command capabilities to reset session context.
2. **Long-Term Relational Memory (Cloudflare D1)**:
   - Relational tables for authorized Telegram users, conversation history, individual messages with roles, update idempotency, and audit trails.
3. **Semantic Memory (Cloudflare Vectorize)**:
   - Vector embeddings using `gemini-embedding-2` with fallback to Cloudflare Workers AI (`@cf/baai/bge-base-en-v1.5`) for semantic knowledge retrieval.
4. **Media & Document Storage (Cloudflare R2)**:
   - Media bucket binding (`MEDIA_BUCKET`) for voice notes, image generation outputs, document uploads, and chat exports.
5. **Triple-Tier AI Engine & Automated Fallback**:
   - **Primary**: Google Gemini API (`gemini-3.8-flash` for chat, `gemini-embedding-2` for embeddings).
   - **Secondary (Edge-Native Fallback)**: Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct` / `@cf/qwen/qwen3.8-27b`). Zero external API credentials required.
   - **Tertiary (Optional)**: OpenAI API (`gpt-4o-mini`). Strictly optional and only invoked if `OPENAI_API_KEY` is explicitly configured. Never silently switched to without credentials.
   - Dynamic provider selection via `PRIMARY_AI_PROVIDER` (`gemini` | `workers-ai` | `openai`).
   - Zero OpenAI dependency: `OPENAI_API_KEY` is fully decoupled and optional. Automated tests pass with zero live API keys.

---

## 🛡️ Security & Privacy Guardrails

- **Zero Secrets in Repository**: Secrets are strictly injected through Cloudflare Secrets (`wrangler secret put`) or `.dev.vars` (which is `.gitignore`d).
- **Approved User Whitelist**: Strict user access control via `ALLOWED_TELEGRAM_USER_IDS` and D1 `users.is_allowed`. Unapproved users are blocked, notified, and logged to `audit_logs`.
- **Fail-Safe Webhook Validation**: Telegram webhook requires the exact `X-Telegram-Bot-Api-Secret-Token` header.
- **Admin API Protection**: Dashboard endpoints require `x-admin-key` authentication.
- **Sanitized Logging**: Loggers strip sensitive tokens, authorization headers, and request bodies.
- **Manual Approval for LIVE**: Production deployments require explicit manual trigger and GitHub Actions approval (`deploy-live.yml`).

---

## 🚀 Foundation Health-Check Endpoint (`GET /health`)

The `/health` endpoint inspects the status of the entire stack:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "0.1.0",
    "environment": "uat",
    "timestamp": "2026-11-07T16:53:00.000Z",
    "uptimeSeconds": 240,
    "checks": {
      "database": {
        "status": "ok",
        "latencyMs": 1
      },
      "telegram": {
        "status": "configured"
      },
      "aiProviders": {
        "primary": "gemini",
        "gemini": {
          "status": "configured",
          "model": "gemini-3.8-flash"
        },
        "workersAi": {
          "status": "configured",
          "model": "@cf/meta/llama-3.3-70b-instruct"
        },
        "openai": {
          "status": "not_configured",
          "model": "gpt-4o-mini"
        }
      },
      "storage": {
        "r2": "bound",
        "vectorize": "not_bound",
        "queues": "not_bound"
      }
    }
  }
}
```

---

## ⚙️ Setup & Local Development

### 1. Install Dependencies
```bash
npm install
npm --prefix dashboard install
```

### 2. Configure Local Secrets
Copy the example file to `.dev.vars`:
```bash
cp .dev.vars.example .dev.vars
```
Populate `.dev.vars` with your tokens (Telegram Bot Token, OpenAI API Key, Gemini API Key, Webhook Secret, Admin Key).

### 3. Initialize Local D1 Database
```bash
npm run d1:migrations:apply:local
```

### 4. Start the Application
- **Start Backend Worker**:
  ```bash
  npm run dev
  ```
  Runs on `http://127.0.0.1:8787`.
- **Start Admin Dashboard**:
  ```bash
  npm run dashboard:dev
  ```
  Runs on `http://localhost:3000` with automated proxy to Worker.

---

## 🧪 Validation & Testing Commands

```bash
# Typecheck backend
npm run typecheck

# Run test suite
npm test

# Dry-run Worker build (Cloudflare Wrangler)
npm run build

# Build React Admin Dashboard
npm run dashboard:build
```

---

## 📦 Environments & Deployment Workflow

| Environment | Worker Name | D1 Binding | R2 Binding | Purpose |
|---|---|---|---|---|
| **Development** | `telegram-ai-agent` | `telegram-ai-agent-d1-local` | `telegram-ai-agent-r2-local` | Local Miniflare development |
| **UAT (Staging)** | `telegram-ai-agent-uat` | `telegram-ai-agent-d1-uat` | `telegram-ai-agent-r2-uat` | Staging / testing with real Telegram |
| **LIVE (Production)** | `telegram-ai-agent-live` | `telegram-ai-agent-d1-live` | `telegram-ai-agent-r2-live` | Production serving verified users |

### Deploying to UAT:
```bash
npm run deploy:uat
```

### Deploying to LIVE (Manual Approval Required):
Deployments to production are gated via the GitHub Actions workflow `deploy-live.yml`, requiring the user to type `DEPLOY_LIVE` and undergo GitHub environment manual reviewer approval.
