import express, { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';

import { speechSpeakers, type EnqueueSpeechResult, type SpeechSpeaker } from '../../modules/speech/public.js';
import { HttpError } from '../../platform/http/errors/http-error.js';
import { getRequestContext } from '../../platform/http/middleware/request-context.js';
import { createAuthenticateManualSpeechRequest } from './manual-speech-auth.js';

const manualSpeechBodyLimitBytes = 4_096;
const manualSpeechBodySchema = z
  .object({
    speaker: z.enum(speechSpeakers),
    text: z.string(),
  })
  .strict();

export type EnqueueManualSpeech = (
  input: Readonly<{
    requestId: string;
    source: 'manual';
    speaker: SpeechSpeaker;
    text: string;
  }>
) => EnqueueSpeechResult;

export type ManualSpeechRouterDependencies = Readonly<{
  bearerToken: string;
  maxTextCharacters: number;
  enqueueSpeech: EnqueueManualSpeech;
}>;

export function createManualSpeechRouter(dependencies: ManualSpeechRouterDependencies): Router {
  const router = Router();

  router.post(
    '/internal/speech-jobs',
    createAuthenticateManualSpeechRequest(dependencies.bearerToken),
    express.json({
      limit: manualSpeechBodyLimitBytes,
      strict: true,
      type: 'application/json',
    }),
    (request, response, next) => {
      if (!isStrictManualBody(request.body)) {
        next(new HttpError(400, 'MANUAL_SPEECH_INVALID_BODY'));
        return;
      }

      const parsedBody = manualSpeechBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        next(new HttpError(422, 'MANUAL_SPEECH_INVALID_INPUT'));
        return;
      }

      const text = parsedBody.data.text.trim();

      if (!isValidManualText(text, dependencies.maxTextCharacters)) {
        next(new HttpError(422, 'MANUAL_SPEECH_INVALID_INPUT'));
        return;
      }

      const result = dependencies.enqueueSpeech({
        requestId: getRequestContext(response).requestId,
        source: 'manual',
        speaker: parsedBody.data.speaker,
        text,
      });

      switch (result.status) {
        case 'queued':
          response.status(202).json({ jobId: result.jobId, status: 'queued' });
          return;
        case 'queue_full':
          next(new HttpError(429, 'SPEECH_QUEUE_FULL'));
          return;
        case 'text_only':
        case 'stopped':
          next(new HttpError(503, 'SPEECH_UNAVAILABLE'));
          return;
      }
    }
  );
  router.use(mapManualJsonError);

  return router;
}

function isStrictManualBody(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).every((key) => key === 'speaker' || key === 'text');
}

function isValidManualText(text: string, maxTextCharacters: number): boolean {
  const codePoints = Array.from(text);
  const containsControlCharacter = codePoints.some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0x2028 || codePoint === 0x2029)
    );
  });

  return text.length > 0 && !containsControlCharacter && codePoints.length <= maxTextCharacters;
}

const mapManualJsonError: ErrorRequestHandler = (error, _request, _response, next) => {
  if (
    error instanceof SyntaxError ||
    (error instanceof Error &&
      'type' in error &&
      (error.type === 'entity.parse.failed' || error.type === 'entity.too.large'))
  ) {
    next(new HttpError(400, 'MANUAL_SPEECH_INVALID_BODY'));
    return;
  }

  next(error);
};
