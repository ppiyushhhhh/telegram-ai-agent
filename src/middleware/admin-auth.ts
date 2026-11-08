import type { MiddlewareHandler } from 'hono';
import type { Env, AppVariables } from '../types';
import { ERROR_CODES } from '../config/constants';
import { AppError } from './error-handler';

/**
 * Middleware to authenticate requests to the Admin API.
 * Verifies the x-admin-key header against c.env.ADMIN_API_KEY.
 */
export const adminAuthMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: AppVariables;
}> = async (c, next) => {
  const adminKeyHeader = c.req.header('x-admin-key')?.trim();
  const expectedKey = c.env.ADMIN_API_KEY?.trim();

  if (!expectedKey) {
    throw new AppError(
      'Server configuration error: ADMIN_API_KEY is not configured on this environment.',
      500,
      ERROR_CODES.INVALID_CONFIG
    );
  }

  if (!adminKeyHeader || adminKeyHeader !== expectedKey) {
    throw new AppError(
      'Unauthorized: missing or invalid Admin API key.',
      401,
      ERROR_CODES.UNAUTHORIZED
    );
  }

  await next();
};
