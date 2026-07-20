import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { finalErrorHandler } from './error-handler.js';
import { HttpError } from './http-error.js';

describe('final HTTP error handler', () => {
  it('maps an expected HTTP error to the stable public shape', async () => {
    const app = express();
    app.get('/expected-error', (_request, _response, next) => {
      next(new HttpError(401, 'UNAUTHORIZED'));
    });
    app.use(finalErrorHandler);

    const response = await request(app).get('/expected-error');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED' } });
  });

  it('does not expose unexpected error details', async () => {
    const app = express();
    app.get('/unexpected-error', (_request, _response, next) => {
      next(new Error('private implementation details'));
    });
    app.use(finalErrorHandler);

    const response = await request(app).get('/unexpected-error');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR' } });
    expect(response.text).not.toContain('private implementation details');
  });
});
