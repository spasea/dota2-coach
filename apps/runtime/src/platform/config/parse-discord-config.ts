import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import type { DiscordConfiguration, DiscordConfigYamlSources } from './config.types.js';
import { ConfigurationError, type ConfigurationSource } from './configuration-error.js';

const snowflakeSchema = z.string().regex(/^\d{17,20}$/);
const disabledDiscordDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    discord: z.object({ enabled: z.literal(false) }).strict(),
  })
  .strict();
const enabledDiscordDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    discord: z
      .object({
        enabled: z.literal(true),
        guild_id: snowflakeSchema,
        text_channel_id: snowflakeSchema,
        control_message_id: snowflakeSchema.optional(),
        action_debounce_ms: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
const discordCredentialsDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    discord: z.object({ bot_token: z.string().trim().min(1) }).strict(),
  })
  .strict();

type ParsedDiscordPublicConfig =
  | Readonly<{ schemaVersion: 1; enabled: false }>
  | Readonly<{
      schemaVersion: 1;
      enabled: true;
      guildId: string;
      textChannelId: string;
      controlMessageId: string | null;
      actionDebounceMs: number;
    }>;

export type ParseDiscordConfigOptions = Readonly<{
  createPanel: boolean;
}>;

export function parseDiscordConfig(
  sources: DiscordConfigYamlSources,
  options: ParseDiscordConfigOptions
): DiscordConfiguration {
  return completeDiscordConfig(parseDiscordPublicConfig(sources.configYaml), sources.credentialsYaml, options);
}

export function parseDiscordPublicConfig(configYaml: string): ParsedDiscordPublicConfig {
  const document = parseDocument(configYaml, 'discord');
  const disabledResult = disabledDiscordDocumentSchema.safeParse(document);

  if (disabledResult.success) {
    return Object.freeze({ schemaVersion: 1, enabled: false });
  }

  const enabledResult = enabledDiscordDocumentSchema.safeParse(document);

  if (!enabledResult.success) {
    throw new ConfigurationError({ source: 'discord', stage: 'validation' });
  }

  return Object.freeze({
    schemaVersion: 1,
    enabled: true,
    guildId: enabledResult.data.discord.guild_id,
    textChannelId: enabledResult.data.discord.text_channel_id,
    controlMessageId: enabledResult.data.discord.control_message_id ?? null,
    actionDebounceMs: enabledResult.data.discord.action_debounce_ms,
  });
}

export function completeDiscordConfig(
  publicConfig: ParsedDiscordPublicConfig,
  credentialsYaml: string | undefined,
  options: ParseDiscordConfigOptions
): DiscordConfiguration {
  if (!publicConfig.enabled) {
    assertDisabledMode(credentialsYaml, options);
    return publicConfig;
  }

  assertEnabledMode(publicConfig, credentialsYaml, options);
  const credentials = parseDiscordCredentials(credentialsYaml);

  return Object.freeze({
    ...publicConfig,
    botToken: credentials.botToken,
  });
}

function assertDisabledMode(credentialsYaml: string | undefined, options: ParseDiscordConfigOptions): void {
  if (credentialsYaml !== undefined || options.createPanel) {
    throw new ConfigurationError({ source: 'discord_combined', stage: 'validation' });
  }
}

function assertEnabledMode(
  publicConfig: Extract<ParsedDiscordPublicConfig, { enabled: true }>,
  credentialsYaml: string | undefined,
  options: ParseDiscordConfigOptions
): asserts credentialsYaml is string {
  const hasControlMessage = publicConfig.controlMessageId !== null;

  if (credentialsYaml === undefined || hasControlMessage === options.createPanel) {
    throw new ConfigurationError({ source: 'discord_combined', stage: 'validation' });
  }
}

function parseDiscordCredentials(credentialsYaml: string): Readonly<{ botToken: string }> {
  const result = discordCredentialsDocumentSchema.safeParse(parseDocument(credentialsYaml, 'discord_credentials'));

  if (!result.success) {
    throw new ConfigurationError({ source: 'discord_credentials', stage: 'validation' });
  }

  return Object.freeze({ botToken: result.data.discord.bot_token });
}

function parseDocument(yaml: string, source: Extract<ConfigurationSource, 'discord' | 'discord_credentials'>): unknown {
  try {
    return parseYaml(yaml);
  } catch {
    throw new ConfigurationError({ source, stage: 'syntax' });
  }
}
