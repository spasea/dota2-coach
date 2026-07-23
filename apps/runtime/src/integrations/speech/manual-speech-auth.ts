import type { RequestHandler } from 'express';

export function createAuthenticateManualSpeechRequest(bearerToken: string): RequestHandler {
  void bearerToken;
  throw new Error('Manual speech authentication is not implemented.');
}
