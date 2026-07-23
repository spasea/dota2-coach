export type PublicErrorCode =
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNAUTHORIZED'
  | 'INVALID_SNAPSHOT'
  | 'MANUAL_SPEECH_UNAUTHORIZED'
  | 'MANUAL_SPEECH_INVALID_BODY'
  | 'MANUAL_SPEECH_INVALID_INPUT'
  | 'SPEECH_QUEUE_FULL'
  | 'SPEECH_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export class HttpError extends Error {
  readonly status: number;
  readonly code: PublicErrorCode;

  constructor(status: number, code: PublicErrorCode) {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}
