import { describe, expect, it } from '@jest/globals';

import { ConfigurationError } from './configuration-error.js';
import { loadSpeechConfig } from './load-speech-config.js';

const configPath = '/etc/dota2-coach/speech.yaml';
const credentialsPath = '/run/secrets/dota2-coach/speech-credentials.yaml';
const enabledConfig = `
schema_version: 1
speech:
  enabled: true
  voice_channel_id: "123456789012345678"
  tts_base_url: "http://tts:8080"
  recommendation_speaker: baya
  job_ttl_ms: 20000
  tts_timeout_ms: 7000
  voice_ready_timeout_ms: 3000
  playback_timeout_ms: 15000
  consecutive_failures_before_text_only: 2
  recovery_probe_interval_ms: 5000
  queue_capacity: 10
  manual:
    enabled: true
    max_text_characters: 300
`;
const credentials = `
schema_version: 1
manual_speech:
  bearer_token: private-manual-speech-token
`;

describe('Speech configuration loading', () => {
  it('does not read credentials when speech is disabled', async () => {
    const requestedPaths: string[] = [];

    const result = await loadSpeechConfig({ speechConfigPath: configPath, speechCredentialsPath: null }, (path) => {
      requestedPaths.push(path);
      return Promise.resolve('schema_version: 1\nspeech:\n  enabled: false');
    });

    expect(result).toEqual({ schemaVersion: 1, enabled: false });
    expect(requestedPaths).toEqual([configPath]);
  });

  it('does not read credentials when manual speech is disabled', async () => {
    const requestedPaths: string[] = [];
    const manualDisabled = enabledConfig
      .replace('    enabled: true', '    enabled: false')
      .replace('    max_text_characters: 300\n', '');

    const result = await loadSpeechConfig({ speechConfigPath: configPath, speechCredentialsPath: null }, (path) => {
      requestedPaths.push(path);
      return Promise.resolve(manualDisabled);
    });

    expect(result).toMatchObject({ enabled: true, manual: { enabled: false } });
    expect(requestedPaths).toEqual([configPath]);
  });

  it('rejects a credentials path for disabled speech without reading it', async () => {
    const requestedPaths: string[] = [];
    const result = await loadSpeechConfig(
      { speechConfigPath: configPath, speechCredentialsPath: credentialsPath },
      (path) => {
        requestedPaths.push(path);
        return Promise.resolve('schema_version: 1\nspeech:\n  enabled: false');
      }
    ).catch((error: unknown) => error);

    expect(result).toMatchObject({ source: 'speech_combined', stage: 'validation' });
    expect(requestedPaths).toEqual([configPath]);
  });

  it('loads public configuration before credentials required by manual speech', async () => {
    const requestedPaths: string[] = [];
    const documents = new Map([
      [configPath, enabledConfig],
      [credentialsPath, credentials],
    ]);

    const result = await loadSpeechConfig(
      { speechConfigPath: configPath, speechCredentialsPath: credentialsPath },
      (path) => {
        requestedPaths.push(path);
        return Promise.resolve(documents.get(path) ?? '');
      }
    );

    expect(result).toMatchObject({
      enabled: true,
      manual: { enabled: true, bearerToken: 'private-manual-speech-token' },
    });
    expect(requestedPaths).toEqual([configPath, credentialsPath]);
  });

  it.each([
    ['speech', configPath],
    ['speech_credentials', credentialsPath],
  ] as const)('reports a safe %s source error', async (source, failingPath) => {
    const rawError = 'private filesystem details';
    const result = await loadSpeechConfig(
      { speechConfigPath: configPath, speechCredentialsPath: credentialsPath },
      (path) => {
        if (path === failingPath) {
          return Promise.reject(new Error(rawError));
        }

        return Promise.resolve(path === configPath ? enabledConfig : credentials);
      }
    ).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(ConfigurationError);
    expect(result).toMatchObject({ source, stage: 'source' });
    expect(String(result)).not.toContain(rawError);
    expect(String(result)).not.toContain(failingPath);
  });
});
