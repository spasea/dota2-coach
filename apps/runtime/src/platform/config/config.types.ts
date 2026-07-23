import type { SpeechSpeaker } from '../../modules/speech/public.js';

export type ClientRole = 1 | 2 | 3 | 4 | 5;

export type TrustedClientIdentity = Readonly<{
  clientId: string;
  discordUserId: string;
  coachAlias: string;
  defaultRole: ClientRole;
}>;

export type TrustedClientRegistry = Readonly<{
  resolveToken: (gsiToken: string) => TrustedClientIdentity | null;
  resolveDiscordUserId: (discordUserId: string) => TrustedClientIdentity | null;
}>;

export type ClientConfigYamlSources = Readonly<{
  clientsYaml: string;
  credentialsYaml: string;
}>;

export type ClientConfigPaths = Readonly<{
  clientConfigPath: string;
  clientCredentialsPath: string;
}>;

export type ReadConfigText = (path: string) => Promise<string>;

export type DiscordConfigYamlSources = Readonly<{
  configYaml: string;
  credentialsYaml?: string;
}>;

export type DiscordConfiguration =
  | Readonly<{
      schemaVersion: 1;
      enabled: false;
    }>
  | Readonly<{
      schemaVersion: 1;
      enabled: true;
      guildId: string;
      textChannelId: string;
      controlMessageId: string | null;
      actionDebounceMs: number;
      botToken: string;
    }>;

export type SpeechConfigYamlSources = Readonly<{
  configYaml: string;
  credentialsYaml?: string;
}>;

type SpeechManualConfiguration =
  | Readonly<{
      enabled: false;
    }>
  | Readonly<{
      enabled: true;
      maxTextCharacters: 300;
      bearerToken: string;
    }>;

export type SpeechConfiguration =
  | Readonly<{
      schemaVersion: 1;
      enabled: false;
    }>
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
      manual: SpeechManualConfiguration;
    }>;
