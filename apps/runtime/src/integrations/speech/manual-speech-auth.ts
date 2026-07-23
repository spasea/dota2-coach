import { timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

import { HttpError } from '../../platform/http/errors/http-error.js';

export function createAuthenticateManualSpeechRequest(bearerToken: string): RequestHandler {
  const expectedToken = Buffer.from(bearerToken, 'utf8');

  return (request, _response, next) => {
    const authorization = request.get('authorization');
    const providedToken = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];

    if (providedToken === undefined) {
      next(new HttpError(401, 'MANUAL_SPEECH_UNAUTHORIZED'));
      return;
    }

    const providedTokenBytes = Buffer.from(providedToken, 'utf8');
    const authorized =
      providedTokenBytes.length === expectedToken.length && timingSafeEqual(providedTokenBytes, expectedToken);

    if (!authorized) {
      next(new HttpError(401, 'MANUAL_SPEECH_UNAUTHORIZED'));
      return;
    }

    next();
  };
}
