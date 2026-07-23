import type { SpeechAudioArtifact } from '../domain/speech-job.js';
import type { SpeechSpeaker } from '../domain/speech-speaker.js';

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
