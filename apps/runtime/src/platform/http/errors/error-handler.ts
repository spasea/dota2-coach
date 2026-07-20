import type { ErrorRequestHandler } from 'express';

export const finalErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void error;
  void _next;

  response.status(501).json({ error: { code: 'INTERNAL_ERROR' } });
};
