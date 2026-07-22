import type { DiscordConfiguration, DiscordConfigYamlSources } from './config.types.js';

export type ParseDiscordConfigOptions = Readonly<{
  createPanel: boolean;
}>;

export function parseDiscordConfig(
  sources: DiscordConfigYamlSources,
  options: ParseDiscordConfigOptions
): DiscordConfiguration {
  void sources;
  void options;
  throw new Error('Discord configuration parsing is not implemented.');
}
