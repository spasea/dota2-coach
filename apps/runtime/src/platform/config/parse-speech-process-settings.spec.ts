import { describe, expect, it } from '@jest/globals';

import { ConfigurationError } from './configuration-error.js';
import { parseSpeechProcessSettings } from './parse-speech-process-settings.js';

const requiredEnvironment = {
  SPEECH_CONFIG_PATH: '/etc/dota2-coach/speech.yaml',
};

describe('Speech process settings', () => {
  it('requires only the public speech configuration path', () => {
    const settings = parseSpeechProcessSettings(requiredEnvironment);

    expect(settings).toEqual({
      speechConfigPath: requiredEnvironment.SPEECH_CONFIG_PATH,
      speechCredentialsPath: null,
    });
    expect(Object.isFrozen(settings)).toBe(true);
  });

  it('accepts the separate optional credentials path', () => {
    expect(
      parseSpeechProcessSettings({
        ...requiredEnvironment,
        SPEECH_CREDENTIALS_PATH: '/run/secrets/dota2-coach/speech-credentials.yaml',
      })
    ).toEqual({
      speechConfigPath: requiredEnvironment.SPEECH_CONFIG_PATH,
      speechCredentialsPath: '/run/secrets/dota2-coach/speech-credentials.yaml',
    });
  });

  it.each([
    ['missing public path', {}],
    ['blank public path', { SPEECH_CONFIG_PATH: ' ' }],
    ['blank credentials path', { ...requiredEnvironment, SPEECH_CREDENTIALS_PATH: ' ' }],
  ])('fails safely for %s', (_caseName, environment) => {
    const error = captureError(() => parseSpeechProcessSettings(environment));

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ source: 'process', stage: 'validation' });
    expect(String(error)).not.toContain(JSON.stringify(environment));
  });
});

function captureError(run: () => unknown): unknown {
  try {
    return run();
  } catch (error) {
    return error;
  }
}
