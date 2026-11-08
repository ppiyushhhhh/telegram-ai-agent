import { Hono } from 'hono';
import type { Env, AppVariables, ApiResponse, HealthCheckData } from '../types';
import {
  APP_VERSION,
  DEFAULT_PRIMARY_PROVIDER,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  DEFAULT_OPENAI_MODEL
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

  // 3. Check AI Providers (Gemini Primary, Workers AI Secondary, OpenAI Optional)
  const primaryProvider = (c.env.PRIMARY_AI_PROVIDER || DEFAULT_PRIMARY_PROVIDER) as 'gemini' | 'workers-ai' | 'openai';
  const geminiStatus: 'configured' | 'not_configured' = Boolean(c.env.GEMINI_API_KEY && c.env.GEMINI_API_KEY.trim().length > 0)
    ? 'configured'
    : 'not_configured';
  const workersAiStatus: 'configured' | 'not_configured' = Boolean(c.env.AI)
    ? 'configured'
    : 'not_configured';
  const openaiStatus: 'configured' | 'not_configured' = Boolean(c.env.OPENAI_API_KEY && c.env.OPENAI_API_KEY.trim().length > 0)
    ? 'configured'
    : 'not_configured';

  // 4. Check Cloudflare Storage & Pipeline Bindings
  const r2Status: 'bound' | 'not_bound' = c.env.MEDIA_BUCKET ? 'bound' : 'not_bound';
  const vectorizeStatus: 'bound' | 'not_bound' = c.env.VECTOR_INDEX ? 'bound' : 'not_bound';
  const queueStatus: 'bound' | 'not_bound' = c.env.TASK_QUEUE ? 'bound' : 'not_bound';

  // Determine overall status
  let primaryAiReady = false;
  if (primaryProvider === 'gemini') {
    primaryAiReady = geminiStatus === 'configured';
  } else if (primaryProvider === 'workers-ai') {
    primaryAiReady = workersAiStatus === 'configured';
  } else {
    primaryAiReady = openaiStatus === 'configured';
  }

  const anyAiReady = geminiStatus === 'configured' || workersAiStatus === 'configured' || openaiStatus === 'configured';
  const isHealthy = dbStatus === 'ok' && telegramStatus === 'configured' && primaryAiReady;
  const isDegraded = (dbStatus === 'ok' || telegramStatus === 'configured') && anyAiReady;
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
      aiProviders: {
        primary: primaryProvider,
        gemini: {
          status: geminiStatus,
          model: c.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
        },
        workersAi: {
          status: workersAiStatus,
          model: c.env.WORKERS_AI_MODEL || DEFAULT_WORKERS_AI_MODEL
        },
        openai: {
          status: openaiStatus,
          model: c.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
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
