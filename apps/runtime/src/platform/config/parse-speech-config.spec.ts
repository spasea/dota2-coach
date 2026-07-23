import { describe, expect, it } from '@jest/globals';

import type { SpeechConfigYamlSources } from './config.types.js';
import { ConfigurationError } from './configuration-error.js';
import { assertSpeechDiscordCompatibility, parseSpeechConfig } from './parse-speech-config.js';

const bearerToken = 'manual.speech.secret.must-remain-private';
const enabledConfigYaml = `
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
const credentialsYaml = `
schema_version: 1
manual_speech:
  bearer_token: "${bearerToken}"
`;

describe('Speech configuration', () => {
  it('parses the minimal disabled document without credentials', () => {
    const configuration = parseSpeechConfig({
      configYaml: 'schema_version: 1\nspeech:\n  enabled: false',
    });

    expect(configuration).toEqual({ schemaVersion: 1, enabled: false });
    expect(Object.isFrozen(configuration)).toBe(true);
  });

  it('joins enabled public and private documents into an immutable configuration', () => {
    const configuration = parseSpeechConfig({
      configYaml: enabledConfigYaml,
      credentialsYaml,
    });

    expect(configuration).toEqual({
      schemaVersion: 1,
      enabled: true,
      voiceChannelId: '123456789012345678',
      ttsBaseUrl: 'http://tts:8080',
      recommendationSpeaker: 'baya',
      jobTtlMs: 20_000,
      ttsTimeoutMs: 7_000,
      voiceReadyTimeoutMs: 3_000,
      playbackTimeoutMs: 15_000,
      consecutiveFailuresBeforeTextOnly: 2,
      recoveryProbeIntervalMs: 5_000,
      queueCapacity: 10,
      manual: {
        enabled: true,
        maxTextCharacters: 300,
        bearerToken,
      },
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(configuration.enabled && Object.isFrozen(configuration.manual)).toBe(true);
  });

  it('allows enabled speech with a disabled manual endpoint and no credentials', () => {
    const configuration = parseSpeechConfig({
      configYaml: enabledConfigYaml
        .replace('    enabled: true', '    enabled: false')
        .replace('    max_text_characters: 300\n', ''),
    });

    expect(configuration).toMatchObject({
      enabled: true,
      recommendationSpeaker: 'baya',
      manual: { enabled: false },
    });
  });

  it.each([
    [
      'fields on the disabled variant',
      {
        configYaml: 'schema_version: 1\nspeech:\n  enabled: false\n  voice_channel_id: "123456789012345678"',
      },
      'speech',
    ],
    [
      'credentials on the disabled variant',
      { configYaml: 'schema_version: 1\nspeech:\n  enabled: false', credentialsYaml },
      'speech_combined',
    ],
    ['missing manual credentials', { configYaml: enabledConfigYaml }, 'speech_combined'],
    [
      'credentials for disabled manual speech',
      {
        configYaml: enabledConfigYaml
          .replace('    enabled: true', '    enabled: false')
          .replace('    max_text_characters: 300\n', ''),
        credentialsYaml,
      },
      'speech_combined',
    ],
    [
      'invalid voice channel snowflake',
      { configYaml: enabledConfigYaml.replace('123456789012345678', 'voice-channel'), credentialsYaml },
      'speech',
    ],
    [
      'external TTS URL',
      { configYaml: enabledConfigYaml.replace('http://tts:8080', 'https://tts.example.com'), credentialsYaml },
      'speech',
    ],
    [
      'TTS URL with a path',
      { configYaml: enabledConfigYaml.replace('http://tts:8080', 'http://tts:8080/v1'), credentialsYaml },
      'speech',
    ],
    [
      'TTS URL with a query',
      {
        configYaml: enabledConfigYaml.replace('http://tts:8080', 'http://tts:8080?model=other'),
        credentialsYaml,
      },
      'speech',
    ],
    [
      'TTS URL with credentials',
      {
        configYaml: enabledConfigYaml.replace('http://tts:8080', 'http://user:password@tts:8080'),
        credentialsYaml,
      },
      'speech',
    ],
    [
      'unsupported recommendation speaker',
      {
        configYaml: enabledConfigYaml.replace('recommendation_speaker: baya', 'recommendation_speaker: random'),
        credentialsYaml,
      },
      'speech',
    ],
    [
      'missing duration',
      { configYaml: enabledConfigYaml.replace('  tts_timeout_ms: 7000\n', ''), credentialsYaml },
      'speech',
    ],
    [
      'zero duration',
      { configYaml: enabledConfigYaml.replace('tts_timeout_ms: 7000', 'tts_timeout_ms: 0'), credentialsYaml },
      'speech',
    ],
    [
      'fractional duration',
      {
        configYaml: enabledConfigYaml.replace('playback_timeout_ms: 15000', 'playback_timeout_ms: 15000.5'),
        credentialsYaml,
      },
      'speech',
    ],
    [
      'zero queue capacity',
      { configYaml: enabledConfigYaml.replace('queue_capacity: 10', 'queue_capacity: 0'), credentialsYaml },
      'speech',
    ],
    [
      'missing queue capacity',
      { configYaml: enabledConfigYaml.replace('  queue_capacity: 10\n', ''), credentialsYaml },
      'speech',
    ],
    [
      'fractional queue capacity',
      { configYaml: enabledConfigYaml.replace('queue_capacity: 10', 'queue_capacity: 10.5'), credentialsYaml },
      'speech',
    ],
    [
      'unsafe queue capacity',
      {
        configYaml: enabledConfigYaml.replace('queue_capacity: 10', 'queue_capacity: 9007199254740992'),
        credentialsYaml,
      },
      'speech',
    ],
    [
      'non-fixed manual text limit',
      {
        configYaml: enabledConfigYaml.replace('max_text_characters: 300', 'max_text_characters: 301'),
        credentialsYaml,
      },
      'speech',
    ],
    ['unknown public field', { configYaml: `${enabledConfigYaml}  retry_count: 3\n`, credentialsYaml }, 'speech'],
    [
      'unsupported public schema',
      { configYaml: enabledConfigYaml.replace('schema_version: 1', 'schema_version: 2'), credentialsYaml },
      'speech',
    ],
    [
      'blank bearer token',
      { configYaml: enabledConfigYaml, credentialsYaml: credentialsYaml.replace(bearerToken, '   ') },
      'speech_credentials',
    ],
    [
      'unknown private field',
      {
        configYaml: enabledConfigYaml,
        credentialsYaml: credentialsYaml.replace(
          `  bearer_token: "${bearerToken}"`,
          `  bearer_token: "${bearerToken}"\n  discord_token: forbidden`
        ),
      },
      'speech_credentials',
    ],
    [
      'unsupported private schema',
      {
        configYaml: enabledConfigYaml,
        credentialsYaml: credentialsYaml.replace('schema_version: 1', 'schema_version: 2'),
      },
      'speech_credentials',
    ],
  ] satisfies readonly [string, SpeechConfigYamlSources, 'speech' | 'speech_credentials' | 'speech_combined'][])(
    'rejects %s',
    (_caseName, sources, source) => {
      const error = captureConfigurationError(() => parseSpeechConfig(sources));

      expect(error).toMatchObject({ source, stage: 'validation' });
    }
  );

  it('reports duplicate public keys as safe syntax errors', () => {
    const error = captureConfigurationError(() =>
      parseSpeechConfig({
        configYaml: enabledConfigYaml.replace('  enabled: true', '  enabled: true\n  enabled: true'),
        credentialsYaml,
      })
    );

    expect(error).toMatchObject({ source: 'speech', stage: 'syntax' });
  });

  it('reports private YAML syntax errors without exposing the token', () => {
    const error = captureConfigurationError(() =>
      parseSpeechConfig({
        configYaml: enabledConfigYaml,
        credentialsYaml: `schema_version: 1\nmanual_speech: [${bearerToken}`,
      })
    );

    expect(error).toMatchObject({ source: 'speech_credentials', stage: 'syntax' });
    expect(String(error)).not.toContain(bearerToken);
  });

  it('reports duplicate private keys without exposing the token', () => {
    const error = captureConfigurationError(() =>
      parseSpeechConfig({
        configYaml: enabledConfigYaml,
        credentialsYaml: credentialsYaml.replace(
          `  bearer_token: "${bearerToken}"`,
          `  bearer_token: "${bearerToken}"\n  bearer_token: "${bearerToken}"`
        ),
      })
    );

    expect(error).toMatchObject({ source: 'speech_credentials', stage: 'syntax' });
    expect(String(error)).not.toContain(bearerToken);
  });

  it('accepts enabled speech only with enabled Discord configuration', () => {
    const speechConfiguration = parseSpeechConfig({
      configYaml: enabledConfigYaml,
      credentialsYaml,
    });
    const enabledDiscordConfiguration = Object.freeze({
      schemaVersion: 1 as const,
      enabled: true as const,
      guildId: '123456789012345678',
      textChannelId: '234567890123456789',
      controlMessageId: '345678901234567890',
      actionDebounceMs: 5_000,
      botToken: 'discord-token',
    });

    expect(() => assertSpeechDiscordCompatibility(speechConfiguration, enabledDiscordConfiguration)).not.toThrow();

    const error = captureConfigurationError(() =>
      assertSpeechDiscordCompatibility(speechConfiguration, Object.freeze({ schemaVersion: 1, enabled: false }))
    );

    expect(error).toMatchObject({
      source: 'speech_combined',
      stage: 'validation',
    });
  });

  it('allows disabled speech independently of Discord state', () => {
    const speechConfiguration = parseSpeechConfig({
      configYaml: 'schema_version: 1\nspeech:\n  enabled: false',
    });

    expect(() =>
      assertSpeechDiscordCompatibility(speechConfiguration, Object.freeze({ schemaVersion: 1, enabled: false }))
    ).not.toThrow();
  });
});

function captureConfigurationError(run: () => unknown): ConfigurationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return error as ConfigurationError;
  }

  throw new Error('Expected Speech configuration parsing to fail.');
}
