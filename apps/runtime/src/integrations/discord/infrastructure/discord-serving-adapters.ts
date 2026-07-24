import { Client, GatewayIntentBits } from 'discord.js';

import { createDiscordGatewayAdapter, type DiscordGatewayAdapter } from './discord-gateway-adapter.js';
import {
  createDiscordVoiceAdapter,
  createDiscordVoiceAdapterDependencies,
  type DiscordVoiceAdapter,
  type DiscordVoiceAdapterOptions,
} from './discord-voice-adapter.js';

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
  const client = dependencies.createClient([GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]);

  return Object.freeze({
    gateway: dependencies.createGateway(botToken, client),
    voice: dependencies.createVoice(client),
  });
}

export function createProductionDiscordServingAdapters(
  botToken: string,
  voiceOptions: DiscordVoiceAdapterOptions
): DiscordServingAdapters {
  return createDiscordServingAdapters(botToken, {
    createClient: (intents) => new Client({ intents }),
    createGateway: (currentBotToken, client) =>
      createDiscordGatewayAdapter(currentBotToken, { createClient: () => client }, 'serving'),
    createVoice: (client) => createDiscordVoiceAdapter(voiceOptions, createDiscordVoiceAdapterDependencies(client)),
  });
}
