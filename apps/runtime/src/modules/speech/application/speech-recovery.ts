import type { RecoverSpeechDelivery } from './speech-ports.js';

export type ProbeSpeechDependency = (signal: AbortSignal) => Promise<'ready' | 'unavailable'>;

export type CreateSpeechRecoveryDependencies = Readonly<{
  probeTtsReadiness: ProbeSpeechDependency;
  recoverVoice: ProbeSpeechDependency;
}>;

export function createRecoverSpeechDelivery(dependencies: CreateSpeechRecoveryDependencies): RecoverSpeechDelivery {
  return async (signal) => {
    try {
      if ((await dependencies.probeTtsReadiness(signal)) !== 'ready' || signal.aborted) {
        return 'unavailable';
      }

      return await dependencies.recoverVoice(signal);
    } catch {
      return 'unavailable';
    }
  };
}
