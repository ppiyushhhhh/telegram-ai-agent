import type { MiddlewareHandler } from 'hono';
import type { Env, AppVariables } from '../types';
import { TELEGRAM_HEADER_SECRET_TOKEN, ERROR_CODES } from '../config/constants';
import { AppError } from './error-handler';

/**
 * Middleware to authenticate requests originating from Telegram's Webhook delivery.
 * Verifies the X-Telegram-Bot-Api-Secret-Token header matches TELEGRAM_WEBHOOK_SECRET.
 */
export const telegramWebhookAuthMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  const secretHeader = c.req.header(TELEGRAM_HEADER_SECRET_TOKEN);
  const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret) {
    throw new AppError(
      'Server misconfiguration: TELEGRAM_WEBHOOK_SECRET is not set.',
      500,
      ERROR_CODES.INVALID_CONFIG
    );
  }

  if (!secretHeader || secretHeader !== expectedSecret) {
    throw new AppError(
      'Unauthorized: invalid or missing Telegram webhook secret token.',
      401,
      ERROR_CODES.UNAUTHORIZED
    );
  }

  await next();
};
