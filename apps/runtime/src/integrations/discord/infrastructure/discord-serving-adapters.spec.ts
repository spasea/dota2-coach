import { describe, expect, it, jest } from '@jest/globals';
import { GatewayIntentBits, type Client } from 'discord.js';

import type { DiscordGatewayAdapter } from './discord-gateway-adapter.js';
import {
  createDiscordServingAdapters,
  type CreateDiscordServingAdaptersDependencies,
} from './discord-serving-adapters.js';
import type { DiscordVoiceAdapter } from './discord-voice-adapter.js';

describe('Discord serving adapter composition', () => {
  it('constructs text and voice adapters over one shared serving client', () => {
    const client = Object.freeze({ marker: 'shared-serving-client' }) as unknown as Client;
    const gateway = Object.freeze({ marker: 'gateway' }) as unknown as DiscordGatewayAdapter;
    const voice = Object.freeze({ marker: 'voice' }) as unknown as DiscordVoiceAdapter;
    const createClient = jest.fn<CreateDiscordServingAdaptersDependencies['createClient']>().mockReturnValue(client);
    const createGateway = jest.fn<CreateDiscordServingAdaptersDependencies['createGateway']>().mockReturnValue(gateway);
    const createVoice = jest.fn<CreateDiscordServingAdaptersDependencies['createVoice']>().mockReturnValue(voice);

    const adapters = createDiscordServingAdapters(
      'private-test-token',
      Object.freeze({ createClient, createGateway, createVoice })
    );

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith([GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]);
    expect(createGateway).toHaveBeenCalledWith('private-test-token', client);
    expect(createVoice).toHaveBeenCalledWith(client);
    expect(adapters).toEqual({ gateway, voice });
  });
});
