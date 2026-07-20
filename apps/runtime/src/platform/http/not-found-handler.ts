import type { RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new Error('Phase 5 not-found behavior is not implemented.'));
};
