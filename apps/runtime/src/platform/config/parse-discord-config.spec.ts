import { describe, expect, it } from '@jest/globals';

import type { DiscordConfigYamlSources } from './config.types.js';
import { ConfigurationError } from './configuration-error.js';
import { parseDiscordConfig } from './parse-discord-config.js';

const botToken = 'discord.bot.token.must-remain-private';
const enabledConfigYaml = `
schema_version: 1
discord:
  enabled: true
  guild_id: "123456789012345678"
  text_channel_id: "234567890123456789"
  control_message_id: "345678901234567890"
  action_debounce_ms: 5000
`;
const credentialsYaml = `
schema_version: 1
discord:
  bot_token: "${botToken}"
`;

describe('Discord configuration', () => {
  it('parses the minimal disabled document without credentials', () => {
    const configuration = parseDiscordConfig(
      {
        configYaml: 'schema_version: 1\ndiscord:\n  enabled: false',
      },
      { createPanel: false }
    );

    expect(configuration).toEqual({ schemaVersion: 1, enabled: false });
    expect(Object.isFrozen(configuration)).toBe(true);
  });

  it('joins enabled public and private documents for normal mode', () => {
    const configuration = parseDiscordConfig(
      { configYaml: enabledConfigYaml, credentialsYaml },
      { createPanel: false }
    );

    expect(configuration).toEqual({
      schemaVersion: 1,
      enabled: true,
      guildId: '123456789012345678',
      textChannelId: '234567890123456789',
      controlMessageId: '345678901234567890',
      actionDebounceMs: 5000,
      botToken,
    });
    expect(Object.isFrozen(configuration)).toBe(true);
  });

  it('accepts enabled provisioning configuration only without a control message ID', () => {
    const configuration = parseDiscordConfig(
      {
        configYaml: enabledConfigYaml.replace('  control_message_id: "345678901234567890"\n', ''),
        credentialsYaml,
      },
      { createPanel: true }
    );

    expect(configuration).toMatchObject({
      enabled: true,
      controlMessageId: null,
      actionDebounceMs: 5000,
    });
  });

  it.each([
    [
      'extra disabled fields',
      {
        configYaml: 'schema_version: 1\ndiscord:\n  enabled: false\n  guild_id: "123456789012345678"',
      },
      false,
      'discord',
    ],
    [
      'disabled credentials',
      { configYaml: 'schema_version: 1\ndiscord:\n  enabled: false', credentialsYaml },
      false,
      'discord_combined',
    ],
    ['missing enabled credentials', { configYaml: enabledConfigYaml }, false, 'discord_combined'],
    [
      'missing debounce',
      {
        configYaml: enabledConfigYaml.replace('  action_debounce_ms: 5000\n', ''),
        credentialsYaml,
      },
      false,
      'discord',
    ],
    [
      'zero debounce',
      {
        configYaml: enabledConfigYaml.replace('action_debounce_ms: 5000', 'action_debounce_ms: 0'),
        credentialsYaml,
      },
      false,
      'discord',
    ],
    [
      'fractional debounce',
      {
        configYaml: enabledConfigYaml.replace('action_debounce_ms: 5000', 'action_debounce_ms: 5000.5'),
        credentialsYaml,
      },
      false,
      'discord',
    ],
    [
      'invalid guild snowflake',
      {
        configYaml: enabledConfigYaml.replace('123456789012345678', 'not-a-snowflake'),
        credentialsYaml,
      },
      false,
      'discord',
    ],
    [
      'missing normal control message',
      {
        configYaml: enabledConfigYaml.replace('  control_message_id: "345678901234567890"\n', ''),
        credentialsYaml,
      },
      false,
      'discord_combined',
    ],
    [
      'provisioning control message conflict',
      { configYaml: enabledConfigYaml, credentialsYaml },
      true,
      'discord_combined',
    ],
    [
      'unknown public field',
      {
        configYaml: `${enabledConfigYaml}  discover_channels: true\n`,
        credentialsYaml,
      },
      false,
      'discord',
    ],
    [
      'unsupported schema version',
      {
        configYaml: enabledConfigYaml.replace('schema_version: 1', 'schema_version: 2'),
        credentialsYaml,
      },
      false,
      'discord',
    ],
    [
      'blank token',
      {
        configYaml: enabledConfigYaml,
        credentialsYaml: credentialsYaml.replace(botToken, '   '),
      },
      false,
      'discord_credentials',
    ],
    [
      'unknown private field',
      {
        configYaml: enabledConfigYaml,
        credentialsYaml: credentialsYaml.replace(
          `  bot_token: "${botToken}"`,
          `  bot_token: "${botToken}"\n  application_secret: forbidden`
        ),
      },
      false,
      'discord_credentials',
    ],
  ] satisfies readonly [
    string,
    DiscordConfigYamlSources,
    boolean,
    'discord' | 'discord_credentials' | 'discord_combined',
  ][])('rejects %s', (_caseName, sources, createPanel, source) => {
    const error = captureConfigurationError(() => parseDiscordConfig(sources, { createPanel }));

    expect(error).toMatchObject({ source, stage: 'validation' });
  });

  it('reports duplicate public keys as safe syntax errors', () => {
    const error = captureConfigurationError(() =>
      parseDiscordConfig(
        {
          configYaml: enabledConfigYaml.replace('  enabled: true', '  enabled: true\n  enabled: true'),
          credentialsYaml,
        },
        { createPanel: false }
      )
    );

    expect(error).toMatchObject({ source: 'discord', stage: 'syntax' });
  });

  it('reports private YAML syntax errors without exposing the token', () => {
    const error = captureConfigurationError(() =>
      parseDiscordConfig(
        {
          configYaml: enabledConfigYaml,
          credentialsYaml: `schema_version: 1\ndiscord: [${botToken}`,
        },
        { createPanel: false }
      )
    );

    expect(error).toMatchObject({ source: 'discord_credentials', stage: 'syntax' });
    expect(String(error)).not.toContain(botToken);
  });
});

function captureConfigurationError(run: () => unknown): ConfigurationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return error as ConfigurationError;
  }

  throw new Error('Expected Discord configuration parsing to fail.');
}
