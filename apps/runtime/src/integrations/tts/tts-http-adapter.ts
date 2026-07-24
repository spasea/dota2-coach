import {
  SpeechSynthesisError,
  type SpeechSynthesisFailureReason,
  type SynthesizeSpeech,
} from '../../modules/speech/public.js';

export type TtsHttpAdapterOptions = Readonly<{
  baseUrl: string;
  maxAudioBytes: number;
}>;

export type TtsHttpAdapterDependencies = Readonly<{
  fetch: typeof globalThis.fetch;
}>;

export type ProbeTtsReadiness = (signal: AbortSignal) => Promise<'ready' | 'unavailable'>;

const maxTtsAudioBytes = 4_194_304;

export function createTtsHttpAdapter(
  options: TtsHttpAdapterOptions,
  dependencies: TtsHttpAdapterDependencies
): SynthesizeSpeech {
  const maxAudioBytes = Math.min(options.maxAudioBytes, maxTtsAudioBytes);

  return async (input) => {
    try {
      const response = await dependencies.fetch(`${options.baseUrl}/v1/speech`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: input.requestId,
          speaker: input.speaker,
          text: input.text,
        }),
        signal: input.signal,
      });

      if (response.status !== 200) {
        throw await mapErrorResponse(response, maxAudioBytes);
      }
      validateSuccessHeaders(response, input.requestId, maxAudioBytes);
      const bytes = await readBoundedBody(response, maxAudioBytes);
      if (!isCanonicalWav(bytes)) {
        throw protocolError();
      }

      return Object.freeze({
        bytes,
        contentType: 'audio/wav' as const,
        sampleRateHz: 48_000 as const,
      });
    } catch (error) {
      if (error instanceof SpeechSynthesisError || isAbortError(error)) {
        throw error;
      }
      throw new SpeechSynthesisError({
        stage: 'synthesis',
        timedOut: false,
        reason: 'unavailable',
      });
    }
  };
}

export function createTtsReadinessProbe(
  options: Pick<TtsHttpAdapterOptions, 'baseUrl'>,
  dependencies: TtsHttpAdapterDependencies
): ProbeTtsReadiness {
  return async (signal) => {
    try {
      const response = await dependencies.fetch(`${options.baseUrl}/ready`, {
        method: 'GET',
        signal,
      });

      if (response.status !== 200) {
        return 'unavailable';
      }

      const body = await readBoundedBody(response, 4_096);
      const document: unknown = JSON.parse(new TextDecoder().decode(body));
      if (
        typeof document !== 'object' ||
        document === null ||
        !('status' in document) ||
        document.status !== 'ready' ||
        !('model' in document) ||
        typeof document.model !== 'string' ||
        !('device' in document) ||
        typeof document.device !== 'string'
      ) {
        return 'unavailable';
      }

      return 'ready';
    } catch {
      return 'unavailable';
    }
  };
}

const errorMappings = new Map<string, Readonly<{ reason: SpeechSynthesisFailureReason; timedOut: boolean }>>([
  ['400:INVALID_REQUEST', { reason: 'rejected', timedOut: false }],
  ['413:TEXT_TOO_LONG', { reason: 'rejected', timedOut: false }],
  ['422:UNSUPPORTED_SPEAKER', { reason: 'rejected', timedOut: false }],
  ['429:BUSY', { reason: 'busy', timedOut: false }],
  ['503:MODEL_NOT_READY', { reason: 'unavailable', timedOut: false }],
  ['504:SYNTHESIS_TIMEOUT', { reason: 'timed_out', timedOut: true }],
  ['500:SYNTHESIS_FAILED', { reason: 'failed', timedOut: false }],
]);

async function mapErrorResponse(response: Response, maxBytes: number): Promise<SpeechSynthesisError> {
  let document: unknown;
  try {
    const body = await readBoundedBody(response, maxBytes);
    document = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return protocolError();
  }

  const code = readErrorCode(document);
  if (code === undefined) {
    return protocolError();
  }
  const mapping = errorMappings.get(`${response.status}:${code}`);
  if (mapping === undefined) {
    return protocolError();
  }
  return new SpeechSynthesisError({
    stage: 'synthesis',
    timedOut: mapping.timedOut,
    reason: mapping.reason,
  });
}

function readErrorCode(document: unknown): string | undefined {
  if (typeof document !== 'object' || document === null || !('error' in document)) {
    return undefined;
  }
  const error = document.error;
  if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string') {
    return undefined;
  }
  return error.code;
}

function validateSuccessHeaders(response: Response, requestId: string, maxBytes: number): void {
  if (
    response.headers.get('content-type') !== 'audio/wav' ||
    response.headers.get('x-tts-request-id') !== requestId ||
    response.headers.get('x-tts-sample-rate') !== '48000'
  ) {
    throw protocolError();
  }

  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw protocolError();
    }
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body === null) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      const value: unknown = chunk.value;
      if (!(value instanceof Uint8Array)) {
        throw protocolError();
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw protocolError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isCanonicalWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (
    view.getUint32(4, true) === bytes.byteLength - 8 &&
    ascii(bytes, 12, 4) === 'fmt ' &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 48_000 &&
    view.getUint32(28, true) === 96_000 &&
    view.getUint16(32, true) === 2 &&
    view.getUint16(34, true) === 16 &&
    ascii(bytes, 36, 4) === 'data' &&
    view.getUint32(40, true) === bytes.byteLength - 44
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function protocolError(): SpeechSynthesisError {
  return new SpeechSynthesisError({
    stage: 'tts_protocol',
    timedOut: false,
    reason: 'protocol',
  });
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError';
}
