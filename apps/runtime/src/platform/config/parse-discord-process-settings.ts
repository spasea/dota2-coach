import { z } from 'zod';

import { ConfigurationError } from './configuration-error.js';

const discordProcessSettingsSchema = z.object({
  DISCORD_CONFIG_PATH: z.string().trim().min(1),
  DISCORD_CREDENTIALS_PATH: z.string().trim().min(1).optional(),
  DISCORD_CREATE_PANEL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type DiscordProcessSettings = Readonly<{
  discordConfigPath: string;
  discordCredentialsPath: string | null;
  discordCreatePanel: boolean;
}>;

export function parseDiscordProcessSettings(
  environment: Readonly<Record<string, string | undefined>>
): DiscordProcessSettings {
  const result = discordProcessSettingsSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigurationError({ source: 'process', stage: 'validation' });
  }

  return Object.freeze({
    discordConfigPath: result.data.DISCORD_CONFIG_PATH,
    discordCredentialsPath: result.data.DISCORD_CREDENTIALS_PATH ?? null,
    discordCreatePanel: result.data.DISCORD_CREATE_PANEL,
  });
}
