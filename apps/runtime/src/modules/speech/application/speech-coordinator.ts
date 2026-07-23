import type { SpeechJobStatus, SpeechSource } from '../domain/speech-job.js';
import type { SpeechSpeaker } from '../domain/speech-speaker.js';
import type { RecoverSpeechDelivery, ScheduleSpeechTask, SynthesizeSpeech, VoiceOutput } from './speech-ports.js';

export type EnqueueSpeechInput = Readonly<{
  requestId: string;
  source: SpeechSource;
  speaker: SpeechSpeaker;
  text: string;
}>;

export type EnqueueSpeechResult =
  | Readonly<{ status: 'queued'; jobId: string }>
  | Readonly<{ status: 'queue_full' }>
  | Readonly<{ status: 'text_only' }>
  | Readonly<{ status: 'stopped' }>;

export type SpeechFailureStage =
  'admission' | 'tts_readiness' | 'synthesis' | 'tts_protocol' | 'voice_readiness' | 'playback' | 'cleanup';

export type SpeechEventCode =
  | 'SPEECH_JOB_QUEUED'
  | 'SPEECH_JOB_SYNTHESIZING'
  | 'SPEECH_JOB_PLAYING'
  | 'SPEECH_DELIVERY_COMPLETED'
  | 'SPEECH_DELIVERY_EXPIRED'
  | 'SPEECH_DELIVERY_FAILED'
  | 'SPEECH_DELIVERY_TIMED_OUT'
  | 'SPEECH_CIRCUIT_OPENED'
  | 'SPEECH_CIRCUIT_RECOVERED';

export type SpeechEvent = Readonly<{
  code: SpeechEventCode;
  requestId?: string;
  speechJobId?: string;
  source?: SpeechSource;
  speaker?: SpeechSpeaker;
  status?: SpeechJobStatus | 'expired' | 'skipped_text_only';
  failureStage?: SpeechFailureStage;
  latencyMs?: number;
  queueDepth?: number;
  circuitState?: 'closed' | 'open' | 'recovering';
}>;

export type SpeechCoordinatorOptions = Readonly<{
  jobTtlMs: number;
  ttsTimeoutMs: number;
  voiceReadyTimeoutMs: number;
  playbackTimeoutMs: number;
  consecutiveFailuresBeforeTextOnly: number;
  recoveryProbeIntervalMs: number;
  queueCapacity: number;
}>;

export type CreateSpeechCoordinatorDependencies = Readonly<{
  synthesizeSpeech: SynthesizeSpeech;
  voiceOutput: VoiceOutput;
  recoverSpeechDelivery: RecoverSpeechDelivery;
  monotonicNow: () => number;
  createJobId: () => string;
  scheduleTask: ScheduleSpeechTask;
  recordEvent: (event: SpeechEvent) => void;
}>;

export type SpeechCoordinator = Readonly<{
  start: () => void;
  enqueue: (input: EnqueueSpeechInput) => EnqueueSpeechResult;
  stop: () => Promise<void>;
}>;

export function createSpeechCoordinator(
  options: SpeechCoordinatorOptions,
  dependencies: CreateSpeechCoordinatorDependencies
): SpeechCoordinator {
  void options;
  void dependencies;
  throw new Error('Speech coordinator is not implemented.');
}
