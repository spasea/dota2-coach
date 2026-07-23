import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { finalErrorHandler } from '../../platform/http/errors/error-handler.js';
import { createRequestContextMiddleware } from '../../platform/http/middleware/request-context.js';
import { notFoundHandler } from '../../platform/http/not-found-handler.js';
import type { EnqueueManualSpeech } from './manual-speech.router.js';
import { createManualSpeechRouter } from './manual-speech.router.js';

const bearerToken = 'dedicated-manual-speech-secret';

function createTestContext(result: ReturnType<EnqueueManualSpeech> = { status: 'queued', jobId: 'speech-job-01' }) {
  const enqueueSpeech = jest.fn<EnqueueManualSpeech>().mockReturnValue(result);
  const app = express();

  app.use(createRequestContextMiddleware(() => 'request-01'));
  app.use(
    createManualSpeechRouter({
      bearerToken,
      maxTextCharacters: 300,
      enqueueSpeech,
    })
  );
  app.use(notFoundHandler);
  app.use(finalErrorHandler);

  return { app, enqueueSpeech };
}

function postAuthorized(app: express.Express) {
  return request(app)
    .post('/internal/speech-jobs')
    .set('Authorization', `Bearer ${bearerToken}`)
    .set('Content-Type', 'application/json');
}

describe('Manual speech router', () => {
  it('authenticates before parsing a malformed JSON body', async () => {
    const { app, enqueueSpeech } = createTestContext();

    const response = await request(app)
      .post('/internal/speech-jobs')
      .set('Content-Type', 'application/json')
      .send('{"speaker":');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'MANUAL_SPEECH_UNAUTHORIZED' } });
    expect(enqueueSpeech).not.toHaveBeenCalled();
  });

  it('admits trimmed text into the shared coordinator and returns immediately', async () => {
    const { app, enqueueSpeech } = createTestContext();

    const response = await postAuthorized(app).send({
      speaker: 'aidar',
      text: '  Проверка синтеза речи.  ',
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ jobId: 'speech-job-01', status: 'queued' });
    expect(enqueueSpeech).toHaveBeenCalledWith({
      requestId: 'request-01',
      source: 'manual',
      speaker: 'aidar',
      text: 'Проверка синтеза речи.',
    });
  });

  it.each(['aidar', 'baya', 'kseniya', 'xenia', 'eugene'] as const)('accepts the fixed %s speaker', async (speaker) => {
    const { app, enqueueSpeech } = createTestContext();

    const response = await postAuthorized(app).send({ speaker, text: 'Проверка.' });

    expect(response.status).toBe(202);
    expect(enqueueSpeech).toHaveBeenCalledWith(expect.objectContaining({ speaker }));
  });

  it.each([
    ['malformed JSON', '{"speaker":'],
    ['unknown field', { speaker: 'aidar', text: 'Проверка.', model: 'v5_5_ru' }],
    ['non-object body', []],
  ])('maps %s to an invalid-body response', async (_caseName, body) => {
    const { app, enqueueSpeech } = createTestContext();

    const response = await postAuthorized(app).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: 'MANUAL_SPEECH_INVALID_BODY' } });
    expect(enqueueSpeech).not.toHaveBeenCalled();
  });

  it.each([
    ['unsupported speaker', { speaker: 'random', text: 'Проверка.' }],
    ['missing speaker', { text: 'Проверка.' }],
    ['missing text', { speaker: 'aidar' }],
    ['blank text', { speaker: 'aidar', text: '   ' }],
    ['multiline text', { speaker: 'aidar', text: 'Первая строка\nВторая строка' }],
    ['carriage return', { speaker: 'aidar', text: 'Первая строка\rВторая строка' }],
    ['control character', { speaker: 'aidar', text: 'Проверка\u0000' }],
    ['more than 300 code points', { speaker: 'aidar', text: '🙂'.repeat(301) }],
  ])('maps %s to an invalid-input response', async (_caseName, body) => {
    const { app, enqueueSpeech } = createTestContext();

    const response = await postAuthorized(app).send(body);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: { code: 'MANUAL_SPEECH_INVALID_INPUT' } });
    expect(enqueueSpeech).not.toHaveBeenCalled();
  });

  it('counts Unicode code points rather than UTF-16 code units', async () => {
    const { app, enqueueSpeech } = createTestContext();

    const response = await postAuthorized(app).send({
      speaker: 'xenia',
      text: '🙂'.repeat(300),
    });

    expect(response.status).toBe(202);
    expect(enqueueSpeech).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['queue_full', 429, 'SPEECH_QUEUE_FULL'],
    ['text_only', 503, 'SPEECH_UNAVAILABLE'],
    ['stopped', 503, 'SPEECH_UNAVAILABLE'],
  ] as const)('maps %s admission to HTTP %d', async (status, httpStatus, code) => {
    const { app } = createTestContext({ status });

    const response = await postAuthorized(app).send({
      speaker: 'baya',
      text: 'Проверка.',
    });

    expect(response.status).toBe(httpStatus);
    expect(response.body).toEqual({ error: { code } });
  });

  it.each([
    ['GET', '/internal/speech-jobs'],
    ['GET', '/internal/speech-jobs/speech-job-01'],
    ['DELETE', '/internal/speech-jobs/speech-job-01'],
  ])('does not expose a status or lifecycle route: %s %s', async (method, path) => {
    const { app } = createTestContext();

    const response = await request(app)[method.toLowerCase() as 'get' | 'delete'](path);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND' } });
  });
});
