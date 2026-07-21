import type { RequestHandler } from 'express';

import { HttpError } from '../../../platform/http/errors/http-error.js';
import { setGsiRequestContext, type ParsedGsiRequest } from './gsi-request-context.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const parseGsiRequest: RequestHandler = (request, response, next) => {
  if (request.is('application/json') !== 'application/json') {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  const body: unknown = request.body;

  if (!isObject(body)) {
    throw new HttpError(422, 'INVALID_SNAPSHOT');
  }

  const auth = body.auth;
  const gsiToken = isObject(auth) && typeof auth.token === 'string' ? auth.token : undefined;
  const { auth: transportAuth, ...snapshot } = body;
  void transportAuth;

  const context: ParsedGsiRequest =
    gsiToken === undefined
      ? Object.freeze({ stage: 'parsed', snapshot })
      : Object.freeze({ stage: 'parsed', gsiToken, snapshot });

  setGsiRequestContext(response, context);
  next();
};
