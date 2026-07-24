import type { RecoverSpeechDelivery } from './speech-ports.js';

export type ProbeSpeechDependency = (signal: AbortSignal) => Promise<'ready' | 'unavailable'>;

export type CreateSpeechRecoveryDependencies = Readonly<{
  probeTtsReadiness: ProbeSpeechDependency;
  recoverVoice: ProbeSpeechDependency;
}>;

export function createRecoverSpeechDelivery(dependencies: CreateSpeechRecoveryDependencies): RecoverSpeechDelivery {
  void dependencies;
  return () => Promise.resolve('unavailable');
}
