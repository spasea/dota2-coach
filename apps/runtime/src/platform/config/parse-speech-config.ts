import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { speechSpeakers, type SpeechSpeaker } from '../../modules/speech/public.js';
import type { DiscordConfiguration, SpeechConfiguration, SpeechConfigYamlSources } from './config.types.js';
import { ConfigurationError, type ConfigurationSource } from './configuration-error.js';

const snowflakeSchema = z.string().regex(/^\d{17,20}$/);
const positiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ttsBaseUrlSchema = z.string().url().refine(isInternalHttpRootUrl);
const speakerSchema = z.enum(speechSpeakers);
const disabledSpeechDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    speech: z.object({ enabled: z.literal(false) }).strict(),
  })
  .strict();
const enabledSpeechDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    speech: z
      .object({
        enabled: z.literal(true),
        voice_channel_id: snowflakeSchema,
        tts_base_url: ttsBaseUrlSchema,
        recommendation_speaker: speakerSchema,
        job_ttl_ms: positiveSafeIntegerSchema,
        tts_timeout_ms: positiveSafeIntegerSchema,
        voice_ready_timeout_ms: positiveSafeIntegerSchema,
        playback_timeout_ms: positiveSafeIntegerSchema,
        consecutive_failures_before_text_only: positiveSafeIntegerSchema,
        recovery_probe_interval_ms: positiveSafeIntegerSchema,
        queue_capacity: positiveSafeIntegerSchema,
        manual: z.discriminatedUnion('enabled', [
          z.object({ enabled: z.literal(false) }).strict(),
          z
            .object({
              enabled: z.literal(true),
              max_text_characters: z.literal(300),
            })
            .strict(),
        ]),
      })
      .strict(),
  })
  .strict();
const speechCredentialsDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    manual_speech: z
      .object({
        bearer_token: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

export type ParsedSpeechPublicConfig =
  | Readonly<{ schemaVersion: 1; enabled: false }>
  | Readonly<{
      schemaVersion: 1;
      enabled: true;
      voiceChannelId: string;
      ttsBaseUrl: string;
      recommendationSpeaker: SpeechSpeaker;
      jobTtlMs: number;
      ttsTimeoutMs: number;
      voiceReadyTimeoutMs: number;
      playbackTimeoutMs: number;
      consecutiveFailuresBeforeTextOnly: number;
      recoveryProbeIntervalMs: number;
      queueCapacity: number;
      manual: Readonly<{ enabled: false }> | Readonly<{ enabled: true; maxTextCharacters: 300 }>;
    }>;

export function parseSpeechConfig(sources: SpeechConfigYamlSources): SpeechConfiguration {
  return completeSpeechConfig(parseSpeechPublicConfig(sources.configYaml), sources.credentialsYaml);
}

export function parseSpeechPublicConfig(configYaml: string): ParsedSpeechPublicConfig {
  const document = parseDocument(configYaml, 'speech');
  const disabledResult = disabledSpeechDocumentSchema.safeParse(document);

  if (disabledResult.success) {
    return Object.freeze({ schemaVersion: 1, enabled: false });
  }

  const enabledResult = enabledSpeechDocumentSchema.safeParse(document);

  if (!enabledResult.success) {
    throw new ConfigurationError({ source: 'speech', stage: 'validation' });
  }

  const speech = enabledResult.data.speech;
  const manual = speech.manual.enabled
    ? Object.freeze({
        enabled: true as const,
        maxTextCharacters: speech.manual.max_text_characters,
      })
    : Object.freeze({ enabled: false as const });

  return Object.freeze({
    schemaVersion: 1,
    enabled: true,
    voiceChannelId: speech.voice_channel_id,
    ttsBaseUrl: speech.tts_base_url,
    recommendationSpeaker: speech.recommendation_speaker,
    jobTtlMs: speech.job_ttl_ms,
    ttsTimeoutMs: speech.tts_timeout_ms,
    voiceReadyTimeoutMs: speech.voice_ready_timeout_ms,
    playbackTimeoutMs: speech.playback_timeout_ms,
    consecutiveFailuresBeforeTextOnly: speech.consecutive_failures_before_text_only,
    recoveryProbeIntervalMs: speech.recovery_probe_interval_ms,
    queueCapacity: speech.queue_capacity,
    manual,
  });
}

export function completeSpeechConfig(
  publicConfig: ParsedSpeechPublicConfig,
  credentialsYaml: string | undefined
): SpeechConfiguration {
  if (!publicConfig.enabled) {
    assertCredentialsAbsent(credentialsYaml);
    return publicConfig;
  }

  if (!publicConfig.manual.enabled) {
    assertCredentialsAbsent(credentialsYaml);
    return Object.freeze({
      ...publicConfig,
      manual: Object.freeze({ enabled: false }),
    });
  }

  if (credentialsYaml === undefined) {
    throw new ConfigurationError({ source: 'speech_combined', stage: 'validation' });
  }

  const credentials = parseSpeechCredentials(credentialsYaml);

  return Object.freeze({
    ...publicConfig,
    manual: Object.freeze({
      ...publicConfig.manual,
      bearerToken: credentials.bearerToken,
    }),
  });
}

export function assertSpeechDiscordCompatibility(
  speechConfiguration: SpeechConfiguration,
  discordConfiguration: DiscordConfiguration
): void {
  if (speechConfiguration.enabled && !discordConfiguration.enabled) {
    throw new ConfigurationError({ source: 'speech_combined', stage: 'validation' });
  }
}

function assertCredentialsAbsent(credentialsYaml: string | undefined): void {
  if (credentialsYaml !== undefined) {
    throw new ConfigurationError({ source: 'speech_combined', stage: 'validation' });
  }
}

function parseSpeechCredentials(credentialsYaml: string): Readonly<{ bearerToken: string }> {
  const result = speechCredentialsDocumentSchema.safeParse(parseDocument(credentialsYaml, 'speech_credentials'));

  if (!result.success) {
    throw new ConfigurationError({ source: 'speech_credentials', stage: 'validation' });
  }

  return Object.freeze({ bearerToken: result.data.manual_speech.bearer_token });
}

function parseDocument(yaml: string, source: Extract<ConfigurationSource, 'speech' | 'speech_credentials'>): unknown {
  try {
    return parseYaml(yaml);
  } catch {
    throw new ConfigurationError({ source, stage: 'syntax' });
  }
}

function isInternalHttpRootUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'http:' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}
