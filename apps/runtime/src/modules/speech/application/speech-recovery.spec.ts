import { describe, expect, it, jest } from '@jest/globals';

import {
  createRecoverSpeechDelivery,
  type CreateSpeechRecoveryDependencies,
  type ProbeSpeechDependency,
} from './speech-recovery.js';

describe('speech delivery recovery', () => {
  it('becomes ready only after both TTS readiness and Discord voice recovery succeed', async () => {
    const fixture = createRecoveryFixture();
    const signal = new AbortController().signal;

    await expect(fixture.recover(signal)).resolves.toBe('ready');
    expect(fixture.operations).toEqual(['probe_tts_readiness', 'recover_voice']);
    expect(fixture.probeTtsReadiness).toHaveBeenCalledWith(signal);
    expect(fixture.recoverVoice).toHaveBeenCalledWith(signal);
  });

  it('does not touch Discord voice while TTS remains unavailable', async () => {
    const fixture = createRecoveryFixture({ ttsResult: 'unavailable' });

    await expect(fixture.recover(new AbortController().signal)).resolves.toBe('unavailable');
    expect(fixture.operations).toEqual(['probe_tts_readiness']);
  });
});

function createRecoveryFixture(
  options: Readonly<{ ttsResult?: 'ready' | 'unavailable'; voiceResult?: 'ready' | 'unavailable' }> = {}
) {
  const operations: string[] = [];
  const probeTtsReadiness = jest.fn<ProbeSpeechDependency>().mockImplementation(() => {
    operations.push('probe_tts_readiness');
    return Promise.resolve(options.ttsResult ?? 'ready');
  });
  const recoverVoice = jest.fn<ProbeSpeechDependency>().mockImplementation(() => {
    operations.push('recover_voice');
    return Promise.resolve(options.voiceResult ?? 'ready');
  });
  const dependencies: CreateSpeechRecoveryDependencies = Object.freeze({
    probeTtsReadiness,
    recoverVoice,
  });

  return {
    operations,
    probeTtsReadiness,
    recover: createRecoverSpeechDelivery(dependencies),
    recoverVoice,
  };
}
