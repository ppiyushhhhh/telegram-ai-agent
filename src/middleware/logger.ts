import type { MiddlewareHandler } from 'hono';
import type { Env, AppVariables } from '../types';

export const loggerMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (
  c,
  next
) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  const startTime = Date.now();
  c.set('requestId', requestId);
  c.set('startTime', startTime);

  const { method, url } = c.req;
  const path = new URL(url).pathname;

  // Header inspection without logging sensitive tokens
  const userAgent = c.req.header('user-agent') || 'unknown';

  await next();

  const durationMs = Date.now() - startTime;
  const status = c.res.status;

  const logPayload = {
    timestamp: new Date().toISOString(),
    requestId,
    method,
    path,
    status,
    durationMs,
    userAgent,
    env: c.env.APP_ENV || 'development'
  };

  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', ...logPayload }));
  } else if (status >= 400) {
    console.warn(JSON.stringify({ level: 'warn', ...logPayload }));
  } else {
    console.log(JSON.stringify({ level: 'info', ...logPayload }));
  }
};
