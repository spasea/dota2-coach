import { describe, expect, it } from '@jest/globals';

import { ConfigurationError } from './configuration-error.js';
import { parseDiscordProcessSettings } from './parse-discord-process-settings.js';

const requiredEnvironment = {
  DISCORD_CONFIG_PATH: '/etc/dota2-coach/discord.yaml',
};

describe('Discord process settings', () => {
  it('uses normal serving mode without requiring a credentials path', () => {
    const settings = parseDiscordProcessSettings(requiredEnvironment);

    expect(settings).toEqual({
      discordConfigPath: requiredEnvironment.DISCORD_CONFIG_PATH,
      discordCredentialsPath: null,
      discordCreatePanel: false,
    });
    expect(Object.isFrozen(settings)).toBe(true);
  });

  it('accepts explicit credentials and provisioning settings', () => {
    const settings = parseDiscordProcessSettings({
      ...requiredEnvironment,
      DISCORD_CREDENTIALS_PATH: '/run/secrets/dota2-coach/discord-credentials.yaml',
      DISCORD_CREATE_PANEL: 'true',
    });

    expect(settings).toEqual({
      discordConfigPath: requiredEnvironment.DISCORD_CONFIG_PATH,
      discordCredentialsPath: '/run/secrets/dota2-coach/discord-credentials.yaml',
      discordCreatePanel: true,
    });
  });

  it.each([
    ['missing public config path', {}],
    ['blank public config path', { DISCORD_CONFIG_PATH: ' ' }],
    ['blank credentials path', { ...requiredEnvironment, DISCORD_CREDENTIALS_PATH: ' ' }],
    ['non-boolean create flag', { ...requiredEnvironment, DISCORD_CREATE_PANEL: 'yes' }],
    ['numeric create flag', { ...requiredEnvironment, DISCORD_CREATE_PANEL: '1' }],
  ])('fails safely for %s', (_caseName, environment) => {
    const result = captureError(() => parseDiscordProcessSettings(environment));

    expect(result).toBeInstanceOf(ConfigurationError);
    expect(result).toMatchObject({ source: 'process', stage: 'validation' });
    expect(String(result)).not.toContain(JSON.stringify(environment));
  });
});

function captureError(run: () => unknown): unknown {
  try {
    return run();
  } catch (error) {
    return error;
  }
}
