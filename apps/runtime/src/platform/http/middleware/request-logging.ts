import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function createRequestLoggingMiddleware(logger: Logger): RequestHandler {
  void logger;

  return (_request, _response, next) => {
    next();
  };
}
