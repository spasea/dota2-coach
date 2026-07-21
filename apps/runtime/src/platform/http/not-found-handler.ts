import type { RequestHandler } from 'express';

import { HttpError } from './errors/http-error.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND'));
};
