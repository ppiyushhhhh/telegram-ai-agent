import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env, AppVariables } from '../types';
import { ERROR_CODES } from '../config/constants';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code: string = ERROR_CODES.INTERNAL_ERROR, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errorHandler: ErrorHandler<{ Bindings: Env; Variables: AppVariables }> = (err, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  const env = c.env?.APP_ENV || 'development';
  const isDev = env === 'development' || env === 'test';

  let statusCode = 500;
  let errorCode: string = ERROR_CODES.INTERNAL_ERROR;
  let message = 'An unexpected internal server error occurred';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof HTTPException) {
    statusCode = err.status;
    errorCode = err.status === 401 ? ERROR_CODES.UNAUTHORIZED :
                err.status === 403 ? ERROR_CODES.FORBIDDEN :
                err.status === 404 ? ERROR_CODES.NOT_FOUND :
                err.status === 400 ? ERROR_CODES.BAD_REQUEST : ERROR_CODES.INTERNAL_ERROR;
    message = err.message;
  } else if (err instanceof Error) {
    message = isDev ? err.message : 'Internal Server Error';
    if (isDev) {
      details = { stack: err.stack };
    }
  }

  // Structured error logging
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    requestId,
    statusCode,
    errorCode,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  }));

  return c.json(
    {
      success: false,
      error: {
        code: errorCode,
        message,
        ...(details ? { details } : {})
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        environment: env
      }
    },
    statusCode as any
  );
};

export const notFoundHandler: NotFoundHandler<{ Bindings: Env; Variables: AppVariables }> = (c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  return c.json(
    {
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `Route not found: ${c.req.method} ${new URL(c.req.url).pathname}`
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString()
      }
    },
    404
  );
};
