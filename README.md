# Private Telegram AI Agent (Cloudflare Workers)

A production-oriented, private Telegram AI Assistant built with **TypeScript**, **Hono**, **Cloudflare Workers**, **OpenAI**, and **Cloudflare D1**.

---

## 🏗️ Architecture & Project Structure

```
telegram-ai-agent/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Automated typecheck & build validation
│       ├── deploy-uat.yml         # UAT environment deployment pipeline
│       └── deploy-live.yml        # Production release pipeline
├── dashboard/                     # Future React + Vite Admin Dashboard
│   └── README.md
├── migrations/
│   └── 0001_initial_schema.sql    # D1 SQLite schema (users, convs, messages, audit)
├── src/
│   ├── index.ts                   # Cloudflare Worker fetch entrypoint
│   ├── app.ts                     # Hono application setup & route registry
│   ├── config/
│   │   ├── constants.ts           # Global constants, defaults & error codes
│   │   └── env.ts                 # Zod validation for runtime environment bindings
│   ├── middleware/
│   │   ├── error-handler.ts       # Centralized error mapping & formatting
│   │   ├── logger.ts              # Structured JSON request logging
│   │   └── telegram-auth.ts       # Telegram webhook secret verification
│   ├── routes/
│   │   ├── health.ts              # Deep health-check endpoint (/health, /api/health)
│   │   └── telegram.ts            # Telegram webhook handler (/telegram/webhook)
│   ├── services/
│   │   ├── db/
│   │   │   ├── client.ts          # Cloudflare D1 database operations
│   │   │   └── schema.ts          # Database record TypeScript models
│   │   ├── openai/
│   │   │   └── client.ts          # OpenAI SDK client wrapper & completions
│   │   └── telegram/
│   │       ├── client.ts          # Telegram Bot API client (fetch-based)
│   │       └── types.ts           # Telegram update, message & chat interfaces
│   └── types/
│       └── index.ts               # Cloudflare Worker Env bindings & response models
├── tests/
│   └── app.test.ts                # Test suite for health, auth & routing
├── .dev.vars.example              # Secret template for local development
├── .gitignore                     # Git ignore rules
├── package.json                   # Dependencies, scripts & engine requirements
├── tsconfig.json                  # TypeScript compiler options
├── wrangler.jsonc                 # Cloudflare Wrangler multi-environment config
└── README.md                      # Documentation
```

---

## 🚀 Key Features (Phase 1)

1. **Hono on Edge**: Ultra-fast request handling with low-latency edge routing.
2. **Environment Separation**: Distinct configs for `development`, `uat` (staging), and `live` (production).
3. **Deep Health Check (`/health`)**: Returns status for D1 database connectivity, OpenAI configuration, and Telegram token readiness.
4. **Structured JSON Logging**: Every request outputs structured JSON logs with duration, status code, method, path, and unique `requestId`.
5. **Centralized Error Handling**: Unified error response contract protecting internal server details in non-dev environments.
6. **Webhook Authentication**: `x-telegram-bot-api-secret-token` header validation prevents unauthorized webhook payloads.
7. **Private Access Control**: Whitelist restriction via `ALLOWED_TELEGRAM_USER_IDS` to keep the bot strictly private.
8. **Cloudflare D1 Storage**: Schema and migrations for users, conversations, chat messages, and audit logs.
9. **CI/CD Ready**: GitHub Actions workflows for continuous integration, UAT, and Live deployments.
10. **Dashboard Ready**: Clean architecture ready for the React + Vite admin dashboard under `dashboard/`.

---

## 🛠️ Prerequisites

- **Node.js**: `v20.0.0` or higher (tested on Node v24)
- **Cloudflare Account**: [Sign up for free](https://dash.cloudflare.com)
- **Telegram Bot Token**: Created via [@BotFather](https://t.me/BotFather)
- **OpenAI API Key**: Platform OpenAI key with access to GPT-4o / GPT-4o-mini

---

## ⚙️ Setup & Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Local Secrets
Create a local `.dev.vars` file from the example template:
```bash
cp .dev.vars.example .dev.vars
```

Update `.dev.vars` with your credentials:
```env
APP_ENV=development
LOG_LEVEL=debug
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_WEBHOOK_SECRET=your_random_secret_token_min_16_chars
OPENAI_API_KEY=sk-...
ALLOWED_TELEGRAM_USER_IDS=123456789
```

### 3. Initialize Local D1 Database
Apply the initial schema to your local SQLite / Miniflare instance:
```bash
npm run d1:migrations:apply:local
```

### 4. Run Locally
Start the Cloudflare Workers development server:
```bash
npm run dev
```

The Worker will start on `http://localhost:8787`.

---

## 🧪 Testing & Verification

Run the test suite:
```bash
npm test
```

Run TypeScript compilation check:
```bash
npm run typecheck
```

Verify build output (dry-run):
```bash
npm run build
```

---

## 🌐 Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/` | Root info & service metadata | None |
| `GET` | `/health` | Deep health-check (DB, OpenAI, Telegram) | None |
| `POST` | `/telegram/webhook` | Telegram update webhook handler | `X-Telegram-Bot-Api-Secret-Token` |
| `GET` | `/telegram/webhook/info`| View current Telegram webhook info | `x-admin-key` header |

### Sample Health Check Response (`GET /health`)
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "0.1.0",
    "environment": "uat",
    "timestamp": "2026-11-07T16:43:00.451Z",
    "uptimeSeconds": 142,
    "checks": {
      "database": {
        "status": "ok",
        "latencyMs": 2
      },
      "telegram": {
        "status": "configured"
      },
      "openai": {
        "status": "configured",
        "model": "gpt-4o-mini"
      }
    }
  },
  "meta": {
    "requestId": "e85f8b60-aa10-4b9c-9879-3c7ac2766156",
    "timestamp": "2026-11-07T16:43:00.451Z",
    "uptime": 142,
    "environment": "uat"
  }
}
```

---

## 📦 Cloudflare Environments & Deployment Guide

The application defines two isolated environments in `wrangler.jsonc`:

| Environment | Worker Name | D1 Database Binding | Purpose |
|---|---|---|---|
| **Local / Dev** | `telegram-ai-agent` | `telegram-ai-agent-d1-local` | Local development with Miniflare |
| **UAT (Staging)** | `telegram-ai-agent-uat` | `telegram-ai-agent-d1-uat` | Testing with real Telegram webhook |
| **Live (Production)** | `telegram-ai-agent-live` | `telegram-ai-agent-d1-live` | Production serving real users |

### Setting Up UAT Environment (When Ready)

1. **Create the UAT D1 Database**:
   ```bash
   npx wrangler d1 create telegram-ai-agent-d1-uat
   ```
   Copy the `database_id` output and paste it into `wrangler.jsonc` under `env.uat.d1_databases[0].database_id`.

2. **Apply Migrations to UAT D1**:
   ```bash
   npm run d1:migrations:apply:uat
   ```

3. **Configure UAT Secrets on Cloudflare**:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN --env uat
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env uat
   npx wrangler secret put OPENAI_API_KEY --env uat
   npx wrangler secret put ADMIN_API_KEY --env uat
   ```

4. **Deploy to UAT**:
   ```bash
   npm run deploy:uat
   ```

5. **Register Webhook with Telegram**:
   ```bash
   curl -F "url=https://telegram-ai-agent-uat.<your-subdomain>.workers.dev/telegram/webhook" \
        -F "secret_token=<YOUR_TELEGRAM_WEBHOOK_SECRET>" \
        https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook
   ```

---

## 🔒 Security & Privacy Practices

- **Zero Secrets in Repository**: No API keys or tokens are stored in Git. All secrets are loaded through Cloudflare Worker bindings or `.dev.vars` (which is `.gitignore`d).
- **Private Access Whitelist**: Incoming Telegram updates check the sender's Telegram User ID against `ALLOWED_TELEGRAM_USER_IDS`. Unauthorized users are rejected and logged to `audit_logs`.
- **Sanitized Logging**: Loggers strip sensitive tokens, authorization headers, and request bodies containing sensitive information.
- **Fail-Safe Webhook Validation**: Telegram webhook requires the exact `X-Telegram-Bot-Api-Secret-Token` header.

---

## 🧭 Next Steps (Phase 2)

- [ ] Create D1 database instances on Cloudflare for UAT and apply schema migrations.
- [ ] Set secret tokens using `wrangler secret put` for UAT.
- [ ] Set up the React + Vite dashboard inside `/dashboard`.
- [ ] Add conversation session management and prompt customization from the dashboard.
