import type { RequestHandler } from 'express';

export type RequestIdFactory = () => string;

export function createRequestContextMiddleware(requestIdFactory: RequestIdFactory): RequestHandler {
  void requestIdFactory;

  return (_request, _response, next) => {
    next();
  };
}
