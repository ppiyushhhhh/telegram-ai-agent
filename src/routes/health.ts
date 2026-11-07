import { Hono } from 'hono';
import type { Env, AppVariables, ApiResponse, HealthCheckData } from '../types';
import { APP_VERSION } from '../config/constants';

export const healthRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const processStartTime = Date.now();

healthRouter.get('/', async (c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  const uptimeSeconds = Math.floor((Date.now() - processStartTime) / 1000);
  const env = c.env.APP_ENV || 'development';

  // 1. Check D1 Database connectivity
  let dbStatus: 'ok' | 'failed' | 'not_configured' = 'not_configured';
  let dbLatencyMs: number | undefined;
  let dbMessage: string | undefined;

  if (c.env.DB) {
    const dbStart = Date.now();
    try {
      await c.env.DB.prepare('SELECT 1 as test').first();
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'ok';
    } catch (err) {
      dbStatus = 'failed';
      dbMessage = err instanceof Error ? err.message : 'D1 ping query failed';
    }
  }

  // 2. Check Telegram config readiness
  let telegramStatus: 'configured' | 'missing_token' | 'missing_secret' = 'configured';
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    telegramStatus = 'missing_token';
  } else if (!c.env.TELEGRAM_WEBHOOK_SECRET) {
    telegramStatus = 'missing_secret';
  }

  // 3. Check OpenAI config readiness
  const openaiStatus: 'configured' | 'missing_key' = c.env.OPENAI_API_KEY
    ? 'configured'
    : 'missing_key';
  const openaiModel = c.env.OPENAI_MODEL || 'gpt-4o-mini';

  // Determine overall status
  const isHealthy = dbStatus === 'ok' && telegramStatus === 'configured' && openaiStatus === 'configured';
  const isDegraded = dbStatus === 'ok' || openaiStatus === 'configured';
  const overallStatus: 'healthy' | 'degraded' | 'unhealthy' = isHealthy
    ? 'healthy'
    : isDegraded
    ? 'degraded'
    : 'unhealthy';

  const healthData: HealthCheckData = {
    status: overallStatus,
    version: APP_VERSION,
    environment: env,
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    checks: {
      database: {
        status: dbStatus,
        ...(dbLatencyMs !== undefined ? { latencyMs: dbLatencyMs } : {}),
        ...(dbMessage ? { message: dbMessage } : {})
      },
      telegram: {
        status: telegramStatus
      },
      openai: {
        status: openaiStatus,
        model: openaiModel
      }
    }
  };

  const response: ApiResponse<HealthCheckData> = {
    success: overallStatus !== 'unhealthy',
    data: healthData,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      environment: env
    }
  };

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;
  return c.json(response, httpStatus);
});
