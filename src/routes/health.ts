import { Hono } from 'hono';
import type { Env, AppVariables, ApiResponse, HealthCheckData } from '../types';
import {
  APP_VERSION,
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_WORKERS_AI_FALLBACK_MODELS,
  DEFAULT_WORKERS_AI_EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  DEFAULT_BOT_USERNAME
} from '../config/constants';

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

  // 3. Check Cloudflare Workers AI (Primary and sole AI provider)
  const workersAiStatus: 'configured' | 'not_configured' = Boolean(c.env.AI)
    ? 'configured'
    : 'not_configured';

  // 4. Check Cloudflare Storage & Pipeline Bindings
  const r2Status: 'bound' | 'not_bound' = c.env.MEDIA_BUCKET ? 'bound' : 'not_bound';
  const vectorizeStatus: 'bound' | 'not_bound' = c.env.VECTOR_INDEX ? 'bound' : 'not_bound';
  const queueStatus: 'bound' | 'not_bound' = c.env.TASK_QUEUE ? 'bound' : 'not_bound';

  // Determine overall status
  const isHealthy = dbStatus === 'ok' && telegramStatus === 'configured' && workersAiStatus === 'configured';
  const isDegraded = (dbStatus === 'ok' || telegramStatus === 'configured') && workersAiStatus === 'configured';
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
        status: telegramStatus,
        botUsername: c.env.TELEGRAM_BOT_USERNAME || DEFAULT_BOT_USERNAME
      },
      aiProviders: {
        primary: 'workers-ai',
        workersAi: {
          status: workersAiStatus,
          model: c.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL,
          fallbackModels: [...DEFAULT_WORKERS_AI_FALLBACK_MODELS],
          embeddingModel: DEFAULT_WORKERS_AI_EMBEDDING_MODEL,
          embeddingDimensions: EMBEDDING_DIMENSIONS
        }
      },
      storage: {
        r2: r2Status,
        vectorize: vectorizeStatus,
        queues: queueStatus
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
