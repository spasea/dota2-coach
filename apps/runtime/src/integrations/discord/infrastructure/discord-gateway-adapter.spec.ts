import { EventEmitter } from 'node:events';

import { describe, expect, it, jest } from '@jest/globals';
import { Events, type Client, type Interaction } from 'discord.js';

import { createDiscordGatewayAdapter } from './discord-gateway-adapter.js';
import type { DiscordInteractionSource } from './discord-interaction-adapter.js';

describe('Discord Gateway event adapter', () => {
  it('waits for ClientReady when login resolves before the client becomes ready', async () => {
    const fixture = createClientFixture({ initiallyReady: false });
    const adapter = createDiscordGatewayAdapter('private-test-token', fixture.dependencies);

    const connection = adapter.connect();
    const stateAfterLogin = await Promise.race([
      connection.then(() => 'connected'),
      Promise.resolve('waiting-for-ready'),
    ]);

    expect(fixture.login).toHaveBeenCalledWith('private-test-token');
    expect(stateAfterLogin).toBe('waiting-for-ready');
    expect(fixture.client.listenerCount(Events.ClientReady)).toBe(1);

    fixture.markReady();

    await expect(connection).resolves.toEqual({ botUserId: '456789012345678901' });
    expect(fixture.client.listenerCount(Events.ClientReady)).toBe(0);
  });

  it('removes the ClientReady listener when login fails', async () => {
    const fixture = createClientFixture({
      initiallyReady: false,
      loginError: new Error('login failed'),
    });
    const adapter = createDiscordGatewayAdapter('private-test-token', fixture.dependencies);

    await expect(adapter.connect()).rejects.toThrow('login failed');
    expect(fixture.client.listenerCount(Events.ClientReady)).toBe(0);
  });

  it('registers one persistent component listener and removes it explicitly', async () => {
    const fixture = createClientFixture();
    const adapter = createDiscordGatewayAdapter('private-test-token', fixture.dependencies);
    const observe = jest.fn<(source: DiscordInteractionSource) => Promise<void>>().mockResolvedValue(undefined);
    const remove = adapter.observeInteractions(observe);
    const interaction = createMessageComponentInteraction();

    fixture.client.emit(Events.InteractionCreate, interaction);
    fixture.client.emit(Events.InteractionCreate, { isMessageComponent: () => false });
    await Promise.resolve();

    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'interaction-01',
        guildId: '123456789012345678',
        channelId: '234567890123456789',
        messageId: '345678901234567890',
        customId: 'coach:v1:action:lost',
      })
    );

    remove();
    fixture.client.emit(Events.InteractionCreate, interaction);
    await Promise.resolve();

    expect(observe).toHaveBeenCalledTimes(1);
  });

  it('contains rejected interaction callbacks at the event-emitter boundary', async () => {
    const fixture = createClientFixture();
    const adapter = createDiscordGatewayAdapter('private-test-token', fixture.dependencies);
    const observe = jest
      .fn<(source: DiscordInteractionSource) => Promise<void>>()
      .mockRejectedValue(new Error('raw callback failure'));

    adapter.observeInteractions(observe);

    expect(() => fixture.client.emit(Events.InteractionCreate, createMessageComponentInteraction())).not.toThrow();
    await Promise.resolve();
  });

  it('maps Gateway lifecycle events to bounded states without logging in or replacing the interaction listener', () => {
    const fixture = createClientFixture();
    const adapter = createDiscordGatewayAdapter('private-test-token', fixture.dependencies);
    const states: string[] = [];
    const removeInteraction = adapter.observeInteractions(() => Promise.resolve());
    const removeStateObserver = adapter.observeGatewayState((state) => states.push(state));

    fixture.client.emit(Events.ShardDisconnect, new Error('raw disconnect'), 0);
    fixture.client.emit(Events.ShardReconnecting, 0);
    fixture.client.emit(Events.ShardResume, 0, 12);

    expect(states).toEqual(['disconnected', 'reconnecting', 'resumed']);
    expect(fixture.login).not.toHaveBeenCalled();
    expect(fixture.client.listenerCount(Events.InteractionCreate)).toBe(1);

    removeStateObserver();
    removeInteraction();
    expect(fixture.client.listenerCount(Events.InteractionCreate)).toBe(0);
    expect(fixture.client.listenerCount(Events.ShardDisconnect)).toBe(0);
    expect(fixture.client.listenerCount(Events.ShardReconnecting)).toBe(0);
    expect(fixture.client.listenerCount(Events.ShardResume)).toBe(0);
  });

  it('contains Gateway observer failures at the event-emitter boundary', () => {
    const fixture = createClientFixture();
    const adapter = createDiscordGatewayAdapter('private-test-token', fixture.dependencies);

    adapter.observeGatewayState(() => {
      throw new Error('raw observer failure');
    });

    expect(() => fixture.client.emit(Events.ShardDisconnect, new Error('raw disconnect'), 0)).not.toThrow();
  });
});

function createClientFixture(options: Readonly<{ initiallyReady?: boolean; loginError?: Error }> = {}) {
  const client = new EventEmitter();
  let ready = options.initiallyReady ?? true;
  const login = jest.fn<(token: string) => Promise<string>>();
  if (options.loginError === undefined) {
    login.mockResolvedValue('private-test-token');
  } else {
    login.mockRejectedValue(options.loginError);
  }
  const destroy = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const discordClient = Object.assign(client, {
    isReady: () => ready,
    login,
    destroy,
    user: { id: '456789012345678901' },
    guilds: { fetch: jest.fn() },
  }) as unknown as Client;

  return {
    client,
    destroy,
    login,
    markReady: () => {
      ready = true;
      client.emit(Events.ClientReady, discordClient);
    },
    dependencies: Object.freeze({ createClient: () => discordClient }),
  };
}

function createMessageComponentInteraction(): Interaction {
  return {
    id: 'interaction-01',
    isMessageComponent: () => true,
    isButton: () => true,
    guildId: '123456789012345678',
    channelId: '234567890123456789',
    message: { id: '345678901234567890' },
    user: { id: '567890123456789012' },
    customId: 'coach:v1:action:lost',
    reply: jest.fn(),
    deferReply: jest.fn(),
    editReply: jest.fn(),
  } as unknown as Interaction;
}
