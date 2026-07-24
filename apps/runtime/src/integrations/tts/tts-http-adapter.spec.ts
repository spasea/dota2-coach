import { describe, expect, it, jest } from '@jest/globals';

import { SpeechSynthesisError, type SynthesizeSpeech } from '../../modules/speech/public.js';
import { createTtsHttpAdapter, createTtsReadinessProbe } from './tts-http-adapter.js';

const request = Object.freeze({
  requestId: 'speech-job-01',
  speaker: 'baya' as const,
  text: 'Fire, защищай нижнюю башню.',
  signal: new AbortController().signal,
});

describe('TTS HTTP adapter', () => {
  it('probes the bounded readiness endpoint without synthesis or retries', async () => {
    const fetch = jest
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ready', model: 'v5_5_ru', device: 'cpu' })));
    const probeReadiness = createTtsReadinessProbe(defaultOptions, { fetch });
    const signal = new AbortController().signal;

    await expect(probeReadiness(signal)).resolves.toBe('ready');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('http://tts:8080/ready', {
      method: 'GET',
      signal,
    });
  });

  it('serializes the exact versioned synthesis request and returns an immutable audio artifact', async () => {
    const fixture = createFixture(successResponse());

    const artifact = await fixture.synthesizeSpeech(request);

    expect(fixture.fetch).toHaveBeenCalledTimes(1);
    expect(fixture.fetch).toHaveBeenCalledWith('http://tts:8080/v1/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId: 'speech-job-01',
        speaker: 'baya',
        text: 'Fire, защищай нижнюю башню.',
      }),
      signal: request.signal,
    });
    expect(artifact).toEqual({
      bytes: validWavBytes(),
      contentType: 'audio/wav',
      sampleRateHz: 48_000,
    });
    expect(Object.isFrozen(artifact)).toBe(true);
  });

  it('forwards caller cancellation to the one HTTP attempt', async () => {
    const controller = new AbortController();
    const fetch = jest.fn<typeof globalThis.fetch>().mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
          once: true,
        });
      });
    });
    const synthesizeSpeech = createTtsHttpAdapter(defaultOptions, { fetch });
    const pending = synthesizeSpeech({ ...request, signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'INVALID_REQUEST', 'rejected'],
    [413, 'TEXT_TOO_LONG', 'rejected'],
    [422, 'UNSUPPORTED_SPEAKER', 'rejected'],
    [429, 'BUSY', 'busy'],
    [503, 'MODEL_NOT_READY', 'unavailable'],
    [500, 'SYNTHESIS_FAILED', 'failed'],
  ] as const)('maps HTTP %s %s to a bounded synthesis failure', async (status, code, reason) => {
    const fixture = createFixture(errorResponse(status, code));

    await expect(fixture.synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'synthesis',
        timedOut: false,
        reason,
      })
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });

  it('maps the service synthesis deadline to a timed-out synthesis failure', async () => {
    const fixture = createFixture(errorResponse(504, 'SYNTHESIS_TIMEOUT'));

    await expect(fixture.synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'synthesis',
        timedOut: true,
        reason: 'timed_out',
      })
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });

  it('maps a network failure without retrying or exposing the raw error', async () => {
    const fetch = jest.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('getaddrinfo ENOTFOUND tts'));
    const synthesizeSpeech = createTtsHttpAdapter(defaultOptions, { fetch });

    await expect(synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'synthesis',
        timedOut: false,
        reason: 'unavailable',
      })
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing content type', successResponse({ contentType: null })],
    ['unexpected content type', successResponse({ contentType: 'application/json' })],
    ['missing request correlation', successResponse({ requestId: null })],
    ['mismatched request correlation', successResponse({ requestId: 'another-job' })],
    ['missing sample rate', successResponse({ sampleRate: null })],
    ['unexpected sample rate', successResponse({ sampleRate: '24000' })],
    ['invalid RIFF payload', successResponse({ bytes: new Uint8Array([0x00, 0x01, 0x02, 0x03]) })],
  ] as const)('rejects %s as a bounded TTS protocol failure', async (_caseName, response) => {
    const fixture = createFixture(response);

    await expect(fixture.synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'tts_protocol',
        timedOut: false,
        reason: 'protocol',
      })
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a declared WAV response larger than the configured bound before buffering it', async () => {
    const response = successResponse();
    response.headers.set('content-length', String(defaultOptions.maxAudioBytes + 1));
    const fixture = createFixture(response);

    await expect(fixture.synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'tts_protocol',
        timedOut: false,
        reason: 'protocol',
      })
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a streamed WAV response that crosses the configured bound', async () => {
    const fixture = createFixture(
      successResponse({
        bytes: new Uint8Array(defaultOptions.maxAudioBytes + 1),
      })
    );

    await expect(fixture.synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'tts_protocol',
        timedOut: false,
        reason: 'protocol',
      })
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });

  it('never allows callers to raise the fixed four-megabyte service bound', async () => {
    const response = successResponse();
    response.headers.set('content-length', String(4_194_304 + 1));
    const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    const synthesizeSpeech = createTtsHttpAdapter(
      { ...defaultOptions, maxAudioBytes: Number.MAX_SAFE_INTEGER },
      { fetch }
    );

    await expect(synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'tts_protocol',
        timedOut: false,
        reason: 'protocol',
      })
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats an unknown status or malformed error envelope as a protocol failure without retrying', async () => {
    const fixture = createFixture(
      new Response(JSON.stringify({ detail: 'raw upstream detail' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      })
    );

    await expect(fixture.synthesizeSpeech(request)).rejects.toEqual(
      new SpeechSynthesisError({
        stage: 'tts_protocol',
        timedOut: false,
        reason: 'protocol',
      })
    );
    expect(fixture.fetch).toHaveBeenCalledTimes(1);
  });
});

const defaultOptions = Object.freeze({
  baseUrl: 'http://tts:8080',
  maxAudioBytes: 1_024,
});

function createFixture(response: Response) {
  const fetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  const synthesizeSpeech: SynthesizeSpeech = createTtsHttpAdapter(defaultOptions, { fetch });

  return { fetch, synthesizeSpeech };
}

function successResponse(
  options: Readonly<{
    bytes?: Uint8Array;
    contentType?: string | null;
    requestId?: string | null;
    sampleRate?: string | null;
  }> = {}
): Response {
  const headers = new Headers();
  const contentType = options.contentType === undefined ? 'audio/wav' : options.contentType;
  const requestId = options.requestId === undefined ? 'speech-job-01' : options.requestId;
  const sampleRate = options.sampleRate === undefined ? '48000' : options.sampleRate;

  if (contentType !== null) {
    headers.set('content-type', contentType);
  }
  if (requestId !== null) {
    headers.set('x-tts-request-id', requestId);
  }
  if (sampleRate !== null) {
    headers.set('x-tts-sample-rate', sampleRate);
  }

  return new Response(options.bytes ?? validWavBytes(), {
    status: 200,
    headers,
  });
}

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function validWavBytes(): Uint8Array {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, 38, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48_000, true);
  view.setUint32(28, 96_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, 2, true);
  view.setInt16(44, 0, true);
  return bytes;
}

function writeAscii(target: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}
