import type { SpeechAudioArtifact } from '../domain/speech-job.js';
import type { SpeechSpeaker } from '../domain/speech-speaker.js';

export type SpeechSynthesisFailureReason = 'rejected' | 'busy' | 'unavailable' | 'timed_out' | 'failed' | 'protocol';

export class SpeechSynthesisError extends Error {
  readonly stage: 'synthesis' | 'tts_protocol';
  readonly timedOut: boolean;
  readonly reason: SpeechSynthesisFailureReason;

  constructor(
    input: Readonly<{ stage: 'synthesis' | 'tts_protocol'; timedOut: boolean; reason: SpeechSynthesisFailureReason }>
  ) {
    super(input.reason);
    this.name = 'SpeechSynthesisError';
    this.stage = input.stage;
    this.timedOut = input.timedOut;
    this.reason = input.reason;
    Object.freeze(this);
  }
}

export type SynthesizeSpeech = (
  input: Readonly<{
    requestId: string;
    speaker: SpeechSpeaker;
    text: string;
    signal: AbortSignal;
  }>
) => Promise<SpeechAudioArtifact>;

export type VoiceOutput = Readonly<{
  waitUntilReady: (signal: AbortSignal) => Promise<void>;
  play: (
    input: Readonly<{
      artifact: SpeechAudioArtifact;
      signal: AbortSignal;
    }>
  ) => Promise<void>;
  stop: () => Promise<void>;
}>;

export type RecoverSpeechDelivery = (signal: AbortSignal) => Promise<'ready' | 'unavailable'>;

export type ScheduleSpeechTask = (delayMs: number, task: () => void) => () => void;
