/**
 * Application constants and defaults
 */

export const APP_NAME = 'telegram-ai-agent';
export const APP_VERSION = '0.2.0';

export const DEFAULT_BOT_NAME = 'Piyush AI Assistant';
export const DEFAULT_BOT_USERNAME = 'PiyushPersonalAssistantBot';
export const DEFAULT_ALLOWED_USER_ID = '9084869490';

// Primary AI provider is Gemini; Workers AI is the edge-native zero-credential secondary provider; OpenAI is optional tertiary
export const DEFAULT_PRIMARY_PROVIDER = 'gemini';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct';
export const DEFAULT_WORKERS_AI_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

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
