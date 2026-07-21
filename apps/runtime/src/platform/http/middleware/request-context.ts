import type { RequestHandler, Response } from 'express';

export type RequestIdFactory = () => string;

export interface RequestContext {
  readonly requestId: string;
  clientId?: string;
}

interface RequestLocals {
  requestContext?: RequestContext;
}

export function getRequestContext(response: Response): RequestContext {
  const context = (response.locals as RequestLocals).requestContext;

  if (context === undefined) {
    throw new Error('Request context middleware must run before request handlers.');
  }

  return context;
}

export function setResolvedClientId(response: Response, clientId: string): void {
  getRequestContext(response).clientId = clientId;
}

export function createRequestContextMiddleware(requestIdFactory: RequestIdFactory): RequestHandler {
  return (_request, response, next) => {
    const requestId = requestIdFactory();
    const locals = response.locals as RequestLocals;

    locals.requestContext = { requestId };
    response.setHeader('X-Request-Id', requestId);
    next();
  };
}
