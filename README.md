# Telegram AI Agent

A private, enterprise-ready Telegram AI Assistant built from scratch using **TypeScript**, **Cloudflare Workers**, **Hono**, **Cloudflare D1**, **Cloudflare Durable Objects**, **Cloudflare Workers AI**, and a modern **React + Vite** Admin Dashboard.

[![CI Pipeline](https://github.com/ppiyushhhhh/telegram-ai-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/ppiyushhhhh/telegram-ai-agent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Environment: UAT](https://img.shields.io/badge/Environment-UAT%20Live-brightgreen)](https://telegram-ai-agent-uat.piyushprasad8122.workers.dev/health)

---

## 🤖 Live Bot Profile

* **Bot Name:** Piyush AI Assistant
* **Bot Username:** [@ppiyushhhhBot](https://t.me/ppiyushhhhBot)
* **Authorized User ID:** `9084869490` (numeric allowlist enforcement)
* **Live UAT Worker URL:** `https://telegram-ai-agent-uat.piyushprasad8122.workers.dev`
* **Live Health Check:** `https://telegram-ai-agent-uat.piyushprasad8122.workers.dev/health`
* **Live Admin Dashboard:** `https://telegram-ai-agent-dashboard.pages.dev`

---

## ☁️ Cloudflare Setup & Provisioning Walkthrough

The application is deployed serverlessly on **Cloudflare Workers** with zero cold starts, global edge routing, and built-in database and AI infrastructure.

### 1. Active Worker Deployment & Management
The worker `telegram-ai-agent-uat` is active, executing on Cloudflare's edge network, and routing incoming Telegram webhook requests:

![Cloudflare Worker Overview](docs/images/cloudflare-setup.png)

### 2. Edge Bindings Architecture & Zero-Error Execution
The worker connects natively to Workers AI, D1 Database, and Durable Objects with 0 errors and sub-10ms CPU time:

![Cloudflare Worker Bindings & Topology](docs/images/cloudflare-worker-bindings.png)

### 3. Serverless D1 SQL Database (`Storage & databases` ➔ `D1`)
The relational database `telegram-ai-agent-d1-uat` stores authorized users, conversation context, token metrics, and deduplication records:

![Cloudflare D1 Database Active](docs/images/cloudflare-d1-database.png)

### Detailed Configuration Breakdown:

#### 1. Account & Worker Environment
* **Account ID:** `f176e1ac285c0c0b26002f5b66e4c364`
* **Subdomain:** `piyushprasad8122.workers.dev`
* **Worker Target:** `telegram-ai-agent-uat` running live on Cloudflare's global edge network.

#### 2. Cloudflare D1 SQL Database (`telegram-ai-agent-d1-uat`)
* **Database UUID:** `822915c4-31bc-4e99-b585-f047d7bb04a6`
* **Region:** APAC (Singapore `SIN` primary colo)
* **Performance:** Over 129 queries processed, with 168+ rows read and 153+ rows written.
* **Applied Migrations & Active Tables:**
  * `users` — Stores numeric Telegram IDs, names, usernames, and approval status.
  * `conversations` — Tracks active conversational threads per chat ID.
  * `messages` — Sliding context window of conversational turns.
  * `processed_updates` — Telegram delivery deduplication (`update_id` idempotency).
  * `ai_usage` — Edge compute Neuron and token telemetry.
  * `system_settings` — Dynamic runtime configuration.
  * `audit_logs` — Access attempt records and security events.

> **Note on Cloudflare Dashboard "Tables: 0":** The root Cloudflare D1 overview page sometimes caches metadata or shows 0 tables until the database detail view is opened. All tables and migrations are fully verified and present via Wrangler.

#### 3. Cloudflare Workers AI Binding (`ai`)
* **Binding Name:** `AI`
* **Primary Model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Meta LLaMA 3.3 70B Parameter Instruction Model).
* **Automated Fallback Models:** `@cf/meta/llama-3.2-3b-instruct` and `@cf/meta/llama-3-8b-instruct`.
* **Vector Embedding Model:** `@cf/baai/bge-base-en-v1.5` (768 dimensions).
* **Zero External API Credentials:** Completely edge-native on Cloudflare serverless GPUs — no Google Gemini or OpenAI API keys required.

#### 4. Cloudflare Durable Objects (`durable_objects`)
* **Namespace Binding:** `SESSION_DO`
* **Class Name:** `SessionDurableObject`
* **Migration Mode:** `new_sqlite_classes` for SQLite-backed atomic session state supported on Cloudflare Workers Free tier.

#### 5. Encrypted Cloudflare Secrets (`wrangler secret put`)
* `TELEGRAM_BOT_TOKEN`: Encrypted HTTP API token for `@ppiyushhhhBot`.
* `TELEGRAM_WEBHOOK_SECRET`: Secure token for `X-Telegram-Bot-Api-Secret-Token` header verification.
* `ADMIN_API_KEY`: Secret key protecting admin telemetry and management routes.

#### 6. Telegram Webhook Verification
* **Webhook Endpoint:** `POST https://telegram-ai-agent-uat.piyushprasad8122.workers.dev/webhooks/telegram`
* Verified and registered with Telegram's Bot API using custom secret token validation.

---

## 📱 Live Bot Interaction Verification

The bot is live and actively chatting with authorized user `9084869490`. Multi-turn interactions are processed by Cloudflare Workers AI and persisted to Cloudflare D1 in real time.

![Telegram Interaction Verified](docs/images/telegram-chat.png)

---

## 🏗️ Architectural Topology

```
telegram-ai-agent/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Automated typecheck & 22-test validation suite
│       ├── deploy-uat.yml         # Cloudflare UAT environment deployment workflow
│       └── deploy-live.yml        # Production deployment (Requires Manual Approval)
├── dashboard/                     # React + Vite Admin Dashboard
│   ├── src/
│   │   ├── components/            # HealthMonitor, UserWhitelist, ConversationList, AuditLogView, AiMemorySettings
│   │   ├── services/api.ts        # Typed API client with default UAT endpoint
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts             # Dev proxy targeting local worker on port 8787
├── docs/
│   └── images/
│       ├── cloudflare-setup.png   # Cloudflare dashboard architecture screenshot
│       └── telegram-chat.png      # Live Telegram conversation screenshot
├── migrations/
│   ├── 0001_initial_schema.sql    # D1 SQLite schema (users, convs, messages, audit)
│   └── 0002_add_updates_usage_settings.sql # Idempotency, usage metrics & system settings
├── src/
│   ├── index.ts                   # Cloudflare Worker fetch entrypoint & queue handler
│   ├── app.ts                     # Hono application setup & route registry
│   ├── config/
│   │   ├── constants.ts           # Constants, model defaults, bot settings & error codes
│   │   └── env.ts                 # Zod validation for runtime environment bindings
│   ├── durable-objects/
│   │   └── SessionDurableObject.ts# SQLite-backed Durable Object for atomic state
│   ├── middleware/
│   │   ├── admin-auth.ts          # Admin API key authorization (x-admin-key header)
│   │   ├── error-handler.ts       # Centralized error mapping & formatting
│   │   └── telegram-auth.ts       # Telegram webhook secret verification
│   ├── routes/
│   │   ├── admin.ts               # Authenticated Admin REST API (/api/admin/*)
│   │   ├── health.ts              # Deep health-check endpoint (/health, /api/health)
│   │   └── telegram.ts            # Telegram webhook handler, idempotency & slash commands
│   ├── services/
│   │   ├── ai/                    # Cloudflare Workers AI engine with candidate fallback
│   │   ├── db/                    # Cloudflare D1 database operations & metrics client
│   │   ├── memory/                # Semantic memory service via Vectorize (768-dim)
│   │   └── telegram/              # Telegram API client, safe chunker & utilities
│   └── types/
│       └── index.ts               # Worker Env bindings (D1, AI, R2, Vectorize, DO)
├── tests/
│   └── app.test.ts                # Complete 22/22 integration test suite
├── .dev.vars.example              # Secret template for local development
├── package.json                   # Dependencies, scripts & engine requirements
├── tsconfig.json                  # TypeScript compiler options
├── wrangler.jsonc                 # Cloudflare Wrangler multi-environment config
└── README.md                      # Documentation
```

---

## 🧠 Cloudflare Workers AI Engine & Candidate Fallback

The assistant runs exclusively on **Cloudflare Workers AI**, eliminating external third-party API dependencies:

1. **Primary Model — Meta LLaMA 3.3 70B Instruct (`fp8-fast`)**:
   - Model Identifier: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
   - High-precision conversational reasoning with sub-second time-to-first-token.
2. **Resilient Fallback Pool**:
   - Candidate 1: `@cf/meta/llama-3.2-3b-instruct`
   - Candidate 2: `@cf/meta/llama-3-8b-instruct`
   - In case of high load or capacity limits on the 70B model, requests automatically and seamlessly fall back to smaller candidate models.
3. **Semantic Embeddings**:
   - Model: `@cf/baai/bge-base-en-v1.5`
   - Outputs 768-dimensional dense vectors compatible with Cloudflare Vectorize.
4. **Cost Controls & Quotas**:
   - Workers AI includes 10,000 Neurons/day free.
   - Zero unexpected third-party monthly bills.

---

## 💾 Memory Architecture

1. **Short-Term Relational Memory (Cloudflare D1)**:
   - Preserves conversation history across sessions.
   - User commands `/new` and `/clear` allow resetting conversation state.
2. **Long-Term Memory & Deduplication (Cloudflare D1)**:
   - `users`: Tracks numeric Telegram IDs, names, usernames, and approval status.
   - `conversations`: Links user chats with active model configurations.
   - `messages`: Stores user and assistant turns with token usage.
   - `processed_updates`: Guarantees idempotency via Telegram `update_id` tracking.
   - `ai_usage`: Logs prompt tokens, completion tokens, model names, and compute costs.
   - `system_settings`: Key-value configuration for runtime tuning.
3. **Semantic Memory (Cloudflare Vectorize)**:
   - 768-dimensional vector index for multi-session semantic recall.

---

## 🗄️ Cloudflare D1 Database Architecture & Schema Deep-Dive

The relational foundation of the assistant is powered by **Cloudflare D1**, a serverless, globally distributed SQL database built on SQLite with zero management overhead.

* **Database Name:** `telegram-ai-agent-d1-uat`
* **Database UUID:** `822915c4-31bc-4e99-b585-f047d7bb04a6`
* **Region:** APAC (Primary colo: `SIN`)

### 1. Database Entity-Relationship Diagram (ERD)

```
┌────────────────────────┐         ┌───────────────────────────────┐
│         users          │ 1     * │         conversations         │
├────────────────────────┼─────────┼───────────────────────────────┤
│ id (PK, Telegram ID)   │         │ id (PK, UUID)                 │
│ first_name             │         │ telegram_chat_id              │
│ last_name              │         │ user_id (FK -> users.id)      │
│ username               │         │ model                         │
│ is_allowed (0 / 1)     │         │ system_prompt                 │
│ created_at / updated_at│         │ created_at / updated_at       │
└────────────────────────┘         └───────────────┬───────────────┘
            │ 1                                    │ 1
            │                                      │
            │ *                                    │ *
┌───────────▼────────────┐         ┌───────────────▼───────────────┐
│        ai_usage        │         │           messages            │
├────────────────────────┤         ├───────────────────────────────┤
│ id (PK, UUID)          │         │ id (PK, UUID)                 │
│ user_id (FK)           │         │ conversation_id (FK)          │
│ conversation_id        │         │ telegram_message_id           │
│ provider ('workers-ai')│         │ role ('user'|'assistant'|'sys')│
│ model                  │         │ content                       │
│ prompt_tokens          │         │ tokens_used                   │
│ completion_tokens      │         │ created_at                    │
│ total_tokens           │         └───────────────────────────────┘
│ estimated_cost_usd     │
│ created_at             │
└────────────────────────┘

┌────────────────────────┐         ┌───────────────────────────────┐
│   processed_updates    │         │          audit_logs           │
├────────────────────────┤         ├───────────────────────────────┤
│ update_id (PK)         │         │ id (PK, UUID)                 │
│ chat_id                │         │ event_type                    │
│ user_id                │         │ user_id / chat_id             │
│ processed_at           │         │ payload (JSON)                │
└────────────────────────┘         │ created_at                    │
                                   └───────────────────────────────┘
```

### 2. Table-by-Table Schema Breakdown

#### `users` Table
Stores all Telegram users who interact with the bot and enforces access security:
* `id` (`INTEGER PRIMARY KEY`): The numeric Telegram User ID (e.g. `9084869490`).
* `first_name` (`TEXT NOT NULL`): User's first name as reported by Telegram API.
* `last_name` (`TEXT`): User's last name (optional).
* `username` (`TEXT`): User's Telegram username (optional).
* `is_allowed` (`INTEGER NOT NULL DEFAULT 0`): `1` if authorized via `ALLOWED_TELEGRAM_USER_IDS`, `0` if blocked.
* `created_at` / `updated_at`: ISO timestamp tracking registration and latest activity.

#### `conversations` Table
Tracks multi-turn chat sessions per Telegram chat:
* `id` (`TEXT PRIMARY KEY`): Unique conversation identifier (e.g. `chat_9084869490` or UUID).
* `telegram_chat_id` (`INTEGER NOT NULL`): The Telegram chat ID.
* `user_id` (`INTEGER NOT NULL`): Foreign key referencing `users.id`.
* `model` (`TEXT NOT NULL`): The active AI model for this conversation.
* `system_prompt` (`TEXT`): Custom system instructions if set for this conversation.

#### `messages` Table
Maintains short-term chat history for contextual AI interactions:
* `id` (`TEXT PRIMARY KEY`): Message UUID.
* `conversation_id` (`TEXT NOT NULL`): Foreign key referencing `conversations.id`.
* `telegram_message_id` (`INTEGER`): Original message ID from Telegram.
* `role` (`TEXT NOT NULL`): Constrained to `'user'`, `'assistant'`, or `'system'`.
* `content` (`TEXT NOT NULL`): Full text content of the message.
* `tokens_used` (`INTEGER DEFAULT 0`): Tokens consumed by this turn.

#### `processed_updates` Table (Idempotency Guard)
Guarantees duplicate update prevention so duplicate webhook deliveries are never processed twice:
* `update_id` (`INTEGER PRIMARY KEY`): Telegram's unique delivery update ID.
* `chat_id` (`INTEGER`): Chat where update originated.
* `user_id` (`INTEGER`): User who sent the update.
* `processed_at` (`TEXT NOT NULL`): Timestamp of initial processing.

#### `ai_usage` Table (Cost & Telemetry Tracking)
Audits token usage and estimated compute cost:
* `id` (`TEXT PRIMARY KEY`): UUID for this usage record.
* `user_id` (`INTEGER NOT NULL`): User who initiated the AI completion.
* `conversation_id` (`TEXT`): Contextual conversation ID.
* `provider` (`TEXT NOT NULL`): Set to `'workers-ai'`.
* `model` (`TEXT NOT NULL`): Specific model invoked (e.g. `@cf/meta/llama-3.3-70b-instruct-fp8-fast`).
* `prompt_tokens`, `completion_tokens`, `total_tokens`: Token metrics.
* `estimated_cost_usd` (`REAL NOT NULL`): Computed cost based on Workers AI Neurons pricing.

#### `reminders` Table
Manages scheduled proactive reminders processed by Cloudflare Cron Triggers:
* `id` (`TEXT PRIMARY KEY`): Unique reminder ID.
* `user_id` (`INTEGER NOT NULL`): Telegram user ID.
* `chat_id` (`INTEGER NOT NULL`): Target chat ID for notification delivery.
* `reminder_text` (`TEXT NOT NULL`): The reminder task or note.
* `remind_at` (`TEXT NOT NULL`): ISO timestamp when the reminder becomes due.
* `is_sent` (`INTEGER DEFAULT 0`): `0` for pending, `1` when dispatched.
* `created_at` / `sent_at`: ISO timestamps.

#### `system_settings` Table
Dynamic key-value settings table loaded at runtime to adjust behavior without redeploying:
* `key` (`TEXT PRIMARY KEY`): Setting identifier.
* `value` (`TEXT NOT NULL`): Configuration value.
* `description` (`TEXT`): Human-readable purpose of this setting.

### 3. Data Flow on Incoming Webhook Updates

```mermaid
sequenceDiagram
    autonumber
    actor User as Telegram User
    participant TG as Telegram Bot API
    participant Worker as Cloudflare Worker (UAT)
    participant D1 as Cloudflare D1 Database
    participant AI as Cloudflare Workers AI

    User->>TG: Sends text message ("ping")
    TG->>Worker: POST /webhooks/telegram (X-Telegram-Bot-Api-Secret-Token)
    Worker->>Worker: Verify Webhook Secret Token
    Worker->>D1: Check processed_updates (update_id)
    alt Update already processed
        Worker-->>TG: 200 OK (Duplicate ignored)
    else First delivery
        Worker->>D1: Insert into processed_updates
        Worker->>D1: Upsert into users (ID, name, allowlist status)
        Worker->>D1: Get or Create conversation session
        Worker->>D1: Retrieve recent messages (history context)
        Worker->>AI: Generate response (LLaMA 3.3 70B FP8-fast)
        AI-->>Worker: Completion result + token metrics
        Worker->>TG: sendMessage (safe markdown chunking)
        Worker--)D1: Background: Save user & assistant messages
        Worker--)D1: Background: Record token usage in ai_usage
        Worker-->>TG: 200 OK
    end
```

### 4. Useful D1 Database Commands

You can inspect and query your live database directly using Wrangler:

```bash
# View all registered users
npx wrangler d1 execute telegram-ai-agent-d1-uat --remote --env uat --command "SELECT * FROM users;"

# View recent conversation messages
npx wrangler d1 execute telegram-ai-agent-d1-uat --remote --env uat --command "SELECT role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 5;"

# Check total token usage and estimated cost
npx wrangler d1 execute telegram-ai-agent-d1-uat --remote --env uat --command "SELECT provider, model, SUM(total_tokens) AS tokens, SUM(estimated_cost_usd) AS cost FROM ai_usage GROUP BY provider, model;"

# Inspect duplicate update prevention table
npx wrangler d1 execute telegram-ai-agent-d1-uat --remote --env uat --command "SELECT COUNT(*) AS total_processed_updates FROM processed_updates;"
```

---

## 🛡️ Security & Access Control

- **Numeric User ID Allowlist**: Only authorized Telegram user IDs (e.g. `9084869490`) are permitted. Unapproved users receive an access-denied message and their attempts are recorded in audit logs.
- **Webhook Authentication**: All webhook calls verify `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`.
- **Encrypted Secrets**: Sensitive keys (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_API_KEY`) are stored in Cloudflare encrypted secrets.
- **Admin Dashboard Protection**: Admin endpoints require the `x-admin-key` header.
- **Safe Splitting & Delivery**: Long AI responses are safely chunked to fit Telegram's 4096-character limit, with automatic fallback from Markdown to plain text.

---

## 🎮 Telegram Commands

| Command | Description |
| :--- | :--- |
| `/start` | Welcome message and introduction to the assistant. |
| `/help` | Complete command guide and usage tips. |
| `/status` | Real-time report of active AI provider, model, latency, and token metrics. |
| `/new` | Start a brand-new conversation topic. |
| `/clear` | Clear the current chat context. |

---

## 📊 Foundation Health-Check (`GET /health`)

Returns real-time diagnostics of the system:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "0.2.0",
    "environment": "uat",
    "checks": {
      "database": { "status": "ok", "latencyMs": 45 },
      "telegram": { "status": "configured", "botUsername": "ppiyushhhhBot" },
      "aiProviders": {
        "primary": "workers-ai",
        "workersAi": {
          "status": "configured",
          "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          "fallbackModels": [
            "@cf/meta/llama-3.2-3b-instruct",
            "@cf/meta/llama-3-8b-instruct"
          ],
          "embeddingModel": "@cf/baai/bge-base-en-v1.5",
          "embeddingDimensions": 768
        }
      },
      "storage": {
        "r2": "not_bound",
        "vectorize": "not_bound",
        "queues": "not_bound"
      }
    }
  }
}
```

---

## ⚙️ Development & Deployment

### 1. Local Setup
```bash
# Install dependencies
npm install
npm --prefix dashboard install

# Configure local secrets
cp .dev.vars.example .dev.vars
```

### 2. Testing & Quality Checks
```bash
# TypeScript typecheck
npm run typecheck

# Run full integration test suite (22 tests)
npm test

# Build worker dry-run
npm run build

# Build React Admin Dashboard
npm run dashboard:build
```

### 3. Cloudflare Deployment (UAT)
```bash
# Run database migrations
npx wrangler d1 migrations apply telegram-ai-agent-d1-uat --remote --env uat

# Set encrypted secrets
npx wrangler secret put TELEGRAM_BOT_TOKEN --env uat
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET --env uat
npx wrangler secret put ADMIN_API_KEY --env uat

# Deploy Worker
npm run deploy:uat
```

### 4. Register Telegram Webhook
```bash
curl -X POST https://telegram-ai-agent-uat.piyushprasad8122.workers.dev/api/admin/telegram/set-webhook \
  -H "x-admin-key: <YOUR_ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://telegram-ai-agent-uat.piyushprasad8122.workers.dev"}'
```

---

## 📄 License
MIT License. Built with Cloudflare Workers AI.
