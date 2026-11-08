import { z } from 'zod';
import type { Env } from '../types';
import {
  DEFAULT_PRIMARY_PROVIDER,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_AI_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_RATE_LIMIT
} from './constants';

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'uat', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1, 'TELEGRAM_WEBHOOK_SECRET is required'),
  ALLOWED_TELEGRAM_USER_IDS: z.string().optional().default(''),
  PRIMARY_AI_PROVIDER: z.enum(['gemini', 'workers-ai', 'openai']).default(DEFAULT_PRIMARY_PROVIDER as 'gemini' | 'workers-ai' | 'openai'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default(DEFAULT_GEMINI_MODEL),
  WORKERS_AI_MODEL: z.string().default(DEFAULT_WORKERS_AI_MODEL),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default(DEFAULT_OPENAI_MODEL),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(DEFAULT_AI_TEMPERATURE),
  MAX_TOKENS: z.coerce.number().min(1).default(DEFAULT_MAX_TOKENS),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().min(1).default(DEFAULT_RATE_LIMIT),
  ADMIN_API_KEY: z.string().optional()
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export function getValidatedConfig(env: Partial<Env>): ValidatedEnv {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map(i => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(`Configuration validation failed: ${errorDetails}`);
  }
  return result.data;
}

/**
 * Returns allowed Telegram user IDs as an array of numbers.
 * If empty or contains '*', access is unconstrained.
 */
export function getAllowedUserIds(allowedString?: string): number[] {
  if (!allowedString || allowedString.trim() === '' || allowedString.trim() === '*') {
    return [];
  }
  return allowedString
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !Number.isNaN(n));
}
