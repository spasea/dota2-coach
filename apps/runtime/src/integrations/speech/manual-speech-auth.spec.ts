import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { finalErrorHandler } from '../../platform/http/errors/error-handler.js';
import { createAuthenticateManualSpeechRequest } from './manual-speech-auth.js';

const bearerToken = 'dedicated-manual-speech-secret';

function createTestApp() {
  const app = express();

  app.post('/manual', createAuthenticateManualSpeechRequest(bearerToken), (_request, response) => {
    response.status(204).end();
  });
  app.use(finalErrorHandler);

  return app;
}

describe('Manual speech authentication', () => {
  it('accepts only the dedicated Bearer token', async () => {
    const response = await request(createTestApp()).post('/manual').set('Authorization', `Bearer ${bearerToken}`);

    expect(response.status).toBe(204);
  });

  it.each([
    ['missing header', undefined],
    ['wrong scheme', `Basic ${bearerToken}`],
    ['missing token', 'Bearer'],
    ['wrong token', 'Bearer known-gsi-token'],
    ['extra token part', `Bearer ${bearerToken} trailing`],
  ])('rejects a %s with the same stable response', async (_caseName, authorization) => {
    let pendingRequest = request(createTestApp()).post('/manual');

    if (authorization !== undefined) {
      pendingRequest = pendingRequest.set('Authorization', authorization);
    }

    const response = await pendingRequest;

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'MANUAL_SPEECH_UNAUTHORIZED' } });
    expect(response.text).not.toContain(bearerToken);
  });
});
