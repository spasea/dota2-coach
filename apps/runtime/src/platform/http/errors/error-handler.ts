import type { ErrorRequestHandler } from 'express';

import { HttpError } from './http-error.js';

function hasErrorType(error: unknown, type: string): boolean {
  return error instanceof Error && 'type' in error && error.type === type;
}

export const finalErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;

  if (error instanceof HttpError) {
    response.status(error.status).json({ error: { code: error.code } });
    return;
  }

  if (hasErrorType(error, 'entity.parse.failed')) {
    response.status(400).json({ error: { code: 'INVALID_JSON' } });
    return;
  }

  if (hasErrorType(error, 'entity.too.large')) {
    response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    return;
  }

  response.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
};
