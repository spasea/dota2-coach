import type { Client, GatewayIntentBits } from 'discord.js';

import type { DiscordGatewayAdapter } from './discord-gateway-adapter.js';
import type { DiscordVoiceAdapter } from './discord-voice-adapter.js';

export type DiscordServingAdapters = Readonly<{
  gateway: DiscordGatewayAdapter;
  voice: DiscordVoiceAdapter;
}>;

export type CreateDiscordServingAdaptersDependencies = Readonly<{
  createClient: (intents: readonly GatewayIntentBits[]) => Client;
  createGateway: (botToken: string, client: Client) => DiscordGatewayAdapter;
  createVoice: (client: Client) => DiscordVoiceAdapter;
}>;

export function createDiscordServingAdapters(
  botToken: string,
  dependencies: CreateDiscordServingAdaptersDependencies
): DiscordServingAdapters {
  void botToken;
  void dependencies;
  throw new Error('Discord serving adapters are not implemented.');
}
