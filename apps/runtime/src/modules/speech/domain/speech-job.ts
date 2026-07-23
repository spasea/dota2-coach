import type { SpeechSpeaker } from './speech-speaker.js';

export type SpeechSource = 'lost' | 'manual';

export type SpeechJobStatus = 'queued' | 'synthesizing' | 'playing' | 'completed' | 'failed' | 'timed_out';

export type SpeechJob = Readonly<{
  id: string;
  requestId: string;
  source: SpeechSource;
  speaker: SpeechSpeaker;
  text: string;
  createdAt: number;
  expiresAt: number;
  status: SpeechJobStatus;
}>;

export type SpeechAudioArtifact = Readonly<{
  bytes: Uint8Array;
  contentType: 'audio/wav';
  sampleRateHz: 48_000;
}>;
