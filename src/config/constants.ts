/**
 * Application constants and defaults
 */

export const APP_NAME = 'telegram-ai-agent';
export const APP_VERSION = '0.2.0';

export const DEFAULT_BOT_NAME = 'Piyush AI Assistant';
export const DEFAULT_BOT_USERNAME = 'ppiyushhhhBot';
export const DEFAULT_ALLOWED_USER_ID = '9084869490';

// Cloudflare Workers AI is the primary and sole AI provider running on edge compute (Zero external API keys required)
export const DEFAULT_PRIMARY_PROVIDER = 'workers-ai';
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const DEFAULT_WORKERS_AI_FALLBACK_MODELS = [
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/meta/llama-3-8b-instruct'
] as const;
export const DEFAULT_WORKERS_AI_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
export const EMBEDDING_DIMENSIONS = 768;

export const DEFAULT_AI_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 1000;
export const DEFAULT_RATE_LIMIT = 30;

export const TELEGRAM_HEADER_SECRET_TOKEN = 'x-telegram-bot-api-secret-token';

export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  TELEGRAM_API_ERROR: 'TELEGRAM_API_ERROR',
  GEMINI_API_ERROR: 'GEMINI_API_ERROR',
  WORKERS_AI_ERROR: 'WORKERS_AI_ERROR',
  OPENAI_API_ERROR: 'OPENAI_API_ERROR',
  INVALID_CONFIG: 'INVALID_CONFIG'
} as const;
