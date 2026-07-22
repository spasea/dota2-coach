import { describe, expect, it } from '@jest/globals';

import { ConfigurationError } from './configuration-error.js';
import { loadDiscordConfig } from './load-discord-config.js';

const configPath = '/etc/dota2-coach/discord.yaml';
const credentialsPath = '/run/secrets/dota2-coach/discord-credentials.yaml';
const enabledConfig = `
schema_version: 1
discord:
  enabled: true
  guild_id: "123456789012345678"
  text_channel_id: "234567890123456789"
  control_message_id: "345678901234567890"
  action_debounce_ms: 5000
`;
const credentials = 'schema_version: 1\ndiscord:\n  bot_token: private-token';

describe('Discord configuration loading', () => {
  it('does not load a credentials file when Discord is disabled', async () => {
    const requestedPaths: string[] = [];

    const result = await loadDiscordConfig(
      {
        discordConfigPath: configPath,
        discordCredentialsPath: null,
        discordCreatePanel: false,
      },
      (path) => {
        requestedPaths.push(path);
        return Promise.resolve('schema_version: 1\ndiscord:\n  enabled: false');
      }
    );

    expect(result).toEqual({ schemaVersion: 1, enabled: false });
    expect(requestedPaths).toEqual([configPath]);
  });

  it('rejects a credentials path when Discord is disabled without reading it', async () => {
    const requestedPaths: string[] = [];
    const result = await loadDiscordConfig(
      {
        discordConfigPath: configPath,
        discordCredentialsPath: credentialsPath,
        discordCreatePanel: false,
      },
      (path) => {
        requestedPaths.push(path);
        return Promise.resolve('schema_version: 1\ndiscord:\n  enabled: false');
      }
    ).catch((error: unknown) => error);

    expect(result).toMatchObject({ source: 'discord_combined', stage: 'validation' });
    expect(requestedPaths).toEqual([configPath]);
  });

  it('loads public configuration before enabled credentials', async () => {
    const requestedPaths: string[] = [];
    const documents = new Map([
      [configPath, enabledConfig],
      [credentialsPath, credentials],
    ]);

    const result = await loadDiscordConfig(
      {
        discordConfigPath: configPath,
        discordCredentialsPath: credentialsPath,
        discordCreatePanel: false,
      },
      (path) => {
        requestedPaths.push(path);
        return Promise.resolve(documents.get(path) ?? '');
      }
    );

    expect(result).toMatchObject({ enabled: true, botToken: 'private-token' });
    expect(requestedPaths).toEqual([configPath, credentialsPath]);
  });

  it.each([
    ['discord', configPath],
    ['discord_credentials', credentialsPath],
  ] as const)('reports a safe %s source error', async (source, failingPath) => {
    const rawError = 'private filesystem details';
    const result = await loadDiscordConfig(
      {
        discordConfigPath: configPath,
        discordCredentialsPath: credentialsPath,
        discordCreatePanel: false,
      },
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
