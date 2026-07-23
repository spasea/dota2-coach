export type {
  CreateSpeechCoordinatorDependencies,
  EnqueueSpeechInput,
  EnqueueSpeechResult,
  SpeechCoordinator,
  SpeechCoordinatorOptions,
  SpeechEvent,
  SpeechEventCode,
  SpeechFailureStage,
} from './application/speech-coordinator.js';
export { createSpeechCoordinator } from './application/speech-coordinator.js';
export type {
  RecoverSpeechDelivery,
  ScheduleSpeechTask,
  SynthesizeSpeech,
  VoiceOutput,
} from './application/speech-ports.js';
export type { SpeechAudioArtifact, SpeechJob, SpeechJobStatus, SpeechSource } from './domain/speech-job.js';
export { speechSpeakers } from './domain/speech-speaker.js';
export type { SpeechSpeaker } from './domain/speech-speaker.js';
