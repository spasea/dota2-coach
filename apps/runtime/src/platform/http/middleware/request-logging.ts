import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

import { getRequestContext } from './request-context.js';

export function createRequestLoggingMiddleware(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const startedAt = process.hrtime.bigint();

    response.once('finish', () => {
      const context = getRequestContext(response);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      logger.info(
        {
          ...(context.clientId === undefined ? {} : { clientId: context.clientId }),
          durationMs,
          method: request.method,
          path: request.path,
          requestId: context.requestId,
          statusCode: response.statusCode,
        },
        'request completed'
      );
    });

    next();
  };
}
