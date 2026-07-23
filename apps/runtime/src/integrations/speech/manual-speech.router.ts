import type { Router } from 'express';

import type { EnqueueSpeechResult, SpeechSpeaker } from '../../modules/speech/public.js';

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
  void dependencies;
  throw new Error('Manual speech router is not implemented.');
}
