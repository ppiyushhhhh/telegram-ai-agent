import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, AppVariables, ApiResponse } from './types';
import { loggerMiddleware } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health';
import { telegramRouter } from './routes/telegram';
import { APP_NAME, APP_VERSION } from './config/constants';

export function createApp(): Hono<{ Bindings: Env; Variables: AppVariables }> {
  const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

  // Global Middlewares
  app.use('*', cors());
  app.use('*', loggerMiddleware);

  // Centralized Error and 404 Handlers
  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  // Root information endpoint
  app.get('/', (c) => {
    const requestId = c.get('requestId') || crypto.randomUUID();
    const env = c.env.APP_ENV || 'development';

    const response: ApiResponse<{
      name: string;
      version: string;
      status: string;
      documentation: string;
    }> = {
      success: true,
      data: {
        name: APP_NAME,
        version: APP_VERSION,
        status: 'online',
        documentation: '/health'
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        environment: env
      }
    };

    return c.json(response);
  });

  // Mount Health routes
  app.route('/health', healthRouter);
  app.route('/api/health', healthRouter);

  // Mount Telegram routes
  app.route('/telegram', telegramRouter);
  app.route('/api/telegram', telegramRouter);

  return app;
}
