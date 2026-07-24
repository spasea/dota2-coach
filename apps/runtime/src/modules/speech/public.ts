export type {
  CreateSpeechCoordinatorDependencies,
  EnqueueSpeech,
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
  SpeechSynthesisFailureReason,
  SynthesizeSpeech,
  VoiceOutput,
} from './application/speech-ports.js';
export { SpeechSynthesisError } from './application/speech-ports.js';
export type { CreateSpeechRecoveryDependencies, ProbeSpeechDependency } from './application/speech-recovery.js';
export { createRecoverSpeechDelivery } from './application/speech-recovery.js';
export type { SpeechAudioArtifact, SpeechJob, SpeechJobStatus, SpeechSource } from './domain/speech-job.js';
export { speechSpeakers } from './domain/speech-speaker.js';
export type { SpeechSpeaker } from './domain/speech-speaker.js';
