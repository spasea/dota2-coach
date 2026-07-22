import type { DiscordConfiguration, ReadConfigText } from './config.types.js';
import { ConfigurationError } from './configuration-error.js';
import type { DiscordProcessSettings } from './parse-discord-process-settings.js';
import { completeDiscordConfig, parseDiscordPublicConfig } from './parse-discord-config.js';

export async function loadDiscordConfig(
  settings: DiscordProcessSettings,
  readConfigText: ReadConfigText
): Promise<DiscordConfiguration> {
  const configYaml = await readDiscordSource(settings.discordConfigPath, 'discord', readConfigText);
  const publicConfig = parseDiscordPublicConfig(configYaml);

  if (!publicConfig.enabled) {
    if (settings.discordCredentialsPath !== null) {
      throw new ConfigurationError({ source: 'discord_combined', stage: 'validation' });
    }

    return completeDiscordConfig(publicConfig, undefined, { createPanel: settings.discordCreatePanel });
  }

  if (settings.discordCredentialsPath === null) {
    throw new ConfigurationError({ source: 'discord_combined', stage: 'validation' });
  }

  const credentialsYaml = await readDiscordSource(
    settings.discordCredentialsPath,
    'discord_credentials',
    readConfigText
  );

  return completeDiscordConfig(publicConfig, credentialsYaml, { createPanel: settings.discordCreatePanel });
}

async function readDiscordSource(
  path: string,
  source: 'discord' | 'discord_credentials',
  readConfigText: ReadConfigText
): Promise<string> {
  try {
    return await readConfigText(path);
  } catch {
    throw new ConfigurationError({ source, stage: 'source' });
  }
}
