/**
 * Global Environment Bindings & Types for Cloudflare Workers
 */

export interface Env {
  // Cloudflare D1 Database binding
  DB: D1Database;

  // Environment mode: 'development' | 'uat' | 'production'
  APP_ENV: string;

  // Logging level: 'debug' | 'info' | 'warn' | 'error'
  LOG_LEVEL?: string;

  // Telegram Configuration
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_TELEGRAM_USER_IDS?: string;

  // OpenAI Configuration
  OPENAI_API_KEY: string;
  OPENAI_MODEL?: string;
  AI_TEMPERATURE?: string;
  MAX_TOKENS?: string;

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
    openai: {
      status: 'configured' | 'missing_key';
      model: string;
    };
  };
}
