/**
 * Global Environment Bindings & Types for Cloudflare Workers
 */

export interface Env {
  // Cloudflare D1 Database binding (Relational long-term memory & metadata)
  DB: D1Database;

  // Cloudflare R2 Bucket (Voice notes, media, documents, exports)
  MEDIA_BUCKET?: R2Bucket;

  // Cloudflare Vectorize (Vector embeddings for semantic memory search)
  VECTOR_INDEX?: VectorizeIndex;

  // Cloudflare Queues (Background asynchronous tasks like embedding generation)
  TASK_QUEUE?: Queue;

  // Cloudflare Durable Objects (Stateful short-term memory & per-user locks)
  SESSION_DO?: DurableObjectNamespace;

  // Environment mode: 'development' | 'uat' | 'production'
  APP_ENV: string;

  // Logging level: 'debug' | 'info' | 'warn' | 'error'
  LOG_LEVEL?: string;

  // Telegram Configuration
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_TELEGRAM_USER_IDS?: string;

  // AI Provider Selection: 'openai' (primary) | 'gemini' (secondary/fallback)
  PRIMARY_AI_PROVIDER?: 'openai' | 'gemini';

  // OpenAI Configuration (Primary Provider)
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  AI_TEMPERATURE?: string;
  MAX_TOKENS?: string;

  // Gemini Configuration (Secondary / Fallback Provider)
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;

  // Admin and Internal API
  ADMIN_API_KEY?: string;
  RATE_LIMIT_PER_MINUTE?: string;
}

export interface AppVariables {
  requestId: string;
  startTime: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    uptime?: number;
    environment?: string;
  };
}

export interface HealthCheckData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: {
      status: 'ok' | 'failed' | 'not_configured';
      latencyMs?: number;
      message?: string;
    };
    telegram: {
      status: 'configured' | 'missing_token' | 'missing_secret';
    };
    aiProviders: {
      primary: 'openai' | 'gemini';
      openai: {
        status: 'configured' | 'missing_key';
        model: string;
      };
      gemini: {
        status: 'configured' | 'not_configured';
        model: string;
      };
    };
    storage: {
      r2: 'bound' | 'not_bound';
      vectorize: 'bound' | 'not_bound';
      queues: 'bound' | 'not_bound';
    };
  };
}
