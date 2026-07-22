export type DiscordProcessSettings = Readonly<{
  discordConfigPath: string;
  discordCredentialsPath: string | null;
  discordCreatePanel: boolean;
}>;

export function parseDiscordProcessSettings(
  environment: Readonly<Record<string, string | undefined>>
): DiscordProcessSettings {
  void environment;
  throw new Error('Discord process settings are not implemented.');
}
