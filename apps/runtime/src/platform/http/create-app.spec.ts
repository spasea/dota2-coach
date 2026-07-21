import { Writable } from 'node:stream';

import { describe, expect, it, jest } from '@jest/globals';
import pino from 'pino';
import request from 'supertest';

import type { RecordClientSnapshot } from '../../modules/match/public.js';
import type { TrustedClientIdentity, TrustedClientRegistry } from '../config/config.types.js';
import { createApp } from './create-app.js';

const gsiBodyLimitBytes = 1_048_576;
const knownGsiToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const unknownGsiToken = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const trustedIdentity: TrustedClientIdentity = Object.freeze({
  clientId: 'client-01',
  discordUserId: '123456789012345678',
  coachAlias: 'Local Player',
  defaultRole: 2,
});

function createTestContext() {
  let logOutput = '';
  const logDestination = new Writable({
    write(chunk: string | Buffer, _encoding, callback) {
      logOutput += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      callback();
    },
  });
  const recordClientSnapshot = jest.fn<RecordClientSnapshot>();
  const trustedClientRegistry: TrustedClientRegistry = {
    resolveToken: (gsiToken) => (gsiToken === knownGsiToken ? trustedIdentity : null),
  };
  const app = createApp({
    gsiBodyLimitBytes,
    logger: pino(logDestination),
    recordClientSnapshot,
    requestIdFactory: () => 'request-01',
    trustedClientRegistry,
  });

  return {
    app,
    readLogOutput: () => logOutput,
    recordClientSnapshot,
  };
}

describe('HTTP application', () => {
  it('reports minimal process health with a correlation ID', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/health').set('X-Request-Id', 'caller-controlled-id');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['x-request-id']).toBe('request-01');
    expect(response.body).toEqual({ status: 'ok' });
  });

  it.each(['application/json', 'application/json; charset=utf-8'])(
    'accepts an authenticated object with %s and removes auth before invoking match',
    async (contentType) => {
      const { app, recordClientSnapshot } = createTestContext();
      const snapshot = { provider: { timestamp: 1_753_002_000 } };

      const response = await request(app)
        .post('/gsi')
        .set('Content-Type', contentType)
        .send({ auth: { token: knownGsiToken }, ...snapshot });

      expect(response.status).toBe(200);
      expect(response.text).toBe('');
      expect(recordClientSnapshot).toHaveBeenCalledWith({
        identity: trustedIdentity,
        snapshot,
      });
    }
  );

  it('returns the same unauthorized response for missing and unknown credentials', async () => {
    const { app, recordClientSnapshot } = createTestContext();

    const missingTokenResponse = await request(app)
      .post('/gsi')
      .set('Content-Type', 'application/json')
      .send({ provider: { timestamp: 1_753_002_000 } });
    const unknownTokenResponse = await request(app)
      .post('/gsi')
      .set('Content-Type', 'application/json')
      .send({
        auth: { token: unknownGsiToken },
        provider: { timestamp: 1_753_002_000 },
      });

    expect(missingTokenResponse.status).toBe(401);
    expect(missingTokenResponse.headers['x-request-id']).toBe('request-01');
    expect(missingTokenResponse.body).toEqual({ error: { code: 'UNAUTHORIZED' } });
    expect(unknownTokenResponse.status).toBe(missingTokenResponse.status);
    expect(unknownTokenResponse.body).toEqual(missingTokenResponse.body);
    expect(recordClientSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ['non-object auth', { auth: 'invalid' }],
    ['non-string token', { auth: { token: 42 } }],
    ['invalid token format', { auth: { token: 'short' } }],
  ])('rejects %s as unauthorized', async (_caseName, body) => {
    const { app, recordClientSnapshot } = createTestContext();

    const response = await request(app).post('/gsi').set('Content-Type', 'application/json').send(body);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED' } });
    expect(recordClientSnapshot).not.toHaveBeenCalled();
  });

  it.each(['null', '[]', '"snapshot"', '42', 'true'])('rejects JSON shape %s before authentication', async (body) => {
    const { app, recordClientSnapshot } = createTestContext();

    const response = await request(app).post('/gsi').set('Content-Type', 'application/json').send(body);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: { code: 'INVALID_SNAPSHOT' } });
    expect(recordClientSnapshot).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const { app, recordClientSnapshot } = createTestContext();

    const response = await request(app).post('/gsi').set('Content-Type', 'application/json').send('{"auth":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: { code: 'INVALID_JSON' } });
    expect(recordClientSnapshot).not.toHaveBeenCalled();
  });

  it('rejects a missing media type', async () => {
    const { app, recordClientSnapshot } = createTestContext();

    const response = await request(app).post('/gsi');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    expect(recordClientSnapshot).not.toHaveBeenCalled();
  });

  it.each(['text/plain', 'text/json', 'application/vnd.api+json'])(
    'rejects unsupported media type %s',
    async (contentType) => {
      const { app, recordClientSnapshot } = createTestContext();

      const response = await request(app)
        .post('/gsi')
        .set('Content-Type', contentType)
        .send('{"auth":{"token":"not-parsed"}}');

      expect(response.status).toBe(415);
      expect(response.body).toEqual({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
      expect(recordClientSnapshot).not.toHaveBeenCalled();
    }
  );

  it('rejects a JSON body larger than one MiB', async () => {
    const { app, recordClientSnapshot } = createTestContext();

    const response = await request(app)
      .post('/gsi')
      .set('Content-Type', 'application/json')
      .send({
        auth: { token: knownGsiToken },
        oversized: 'x'.repeat(gsiBodyLimitBytes),
      });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(recordClientSnapshot).not.toHaveBeenCalled();
  });

  it('maps an unknown route to the stable not-found response', async () => {
    const { app } = createTestContext();

    const response = await request(app).get('/unknown-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND' } });
  });

  it('logs bounded request metadata without credentials or raw snapshots', async () => {
    const { app, readLogOutput } = createTestContext();
    const secretSnapshotValue = 'must-never-appear-in-logs';

    await request(app)
      .post('/gsi')
      .set('Content-Type', 'application/json')
      .send({
        auth: { token: knownGsiToken },
        provider: { secretSnapshotValue },
      });

    const logOutput = readLogOutput();

    expect(logOutput).toContain('"clientId":"client-01"');
    expect(logOutput).toContain('"method":"POST"');
    expect(logOutput).toContain('request-01');
    expect(logOutput).toContain('/gsi');
    expect(logOutput).toContain('"statusCode":200');
    expect(logOutput).not.toContain(knownGsiToken);
    expect(logOutput).not.toContain(secretSnapshotValue);
  });
});
