import { describe, expect, it, jest } from '@jest/globals';

import type { DiscordPanelDefinition } from './discord-panel.js';
import {
  createProvisionDiscordPanel,
  createValidateDiscordPanel,
  REQUIRED_DISCORD_PANEL_PERMISSIONS,
  type DiscordPanelGateway,
} from './discord-panel-lifecycle.js';

const guildId = '123456789012345678';
const channelId = '234567890123456789';
const messageId = '345678901234567890';
const botUserId = '456789012345678901';
const panel: DiscordPanelDefinition = Object.freeze({
  content: 'Dota Coach',
  rows: Object.freeze([]),
});
const validationOperations = ['connect', 'resolve_text_channel', 'fetch_message'] as const;

describe('Discord panel lifecycle', () => {
  it('provisions, pins, returns the message ID, and always destroys the one-shot client', async () => {
    const fixture = createGatewayFixture();
    const provision = createProvisionDiscordPanel(fixture.gateway, jest.fn());

    const result = await provision({ guildId, textChannelId: channelId, panel });

    expect(result).toEqual({ guildId, channelId, controlMessageId: messageId });
    expect(Object.isFrozen(result)).toBe(true);
    expect(fixture.operations).toEqual(['connect', 'resolve_text_channel', 'create_message', 'pin_message', 'destroy']);
  });

  it('deletes the newly created message when pinning fails and preserves cleanup', async () => {
    const pinError = new Error('raw pin details');
    const fixture = createGatewayFixture({ pinError });
    const reportCleanupFailure = jest.fn();
    const provision = createProvisionDiscordPanel(fixture.gateway, reportCleanupFailure);

    const result = await provision({ guildId, textChannelId: channelId, panel }).catch((error: unknown) => error);

    expect(result).toMatchObject({ code: 'DISCORD_PANEL_PROVISION_ERROR', stage: 'pin' });
    expect(String(result)).not.toContain(pinError.message);
    expect(fixture.operations).toEqual([
      'connect',
      'resolve_text_channel',
      'create_message',
      'pin_message',
      'delete_message',
      'destroy',
    ]);
    expect(reportCleanupFailure).not.toHaveBeenCalled();
  });

  it('reports failed message compensation and still destroys the one-shot client', async () => {
    const fixture = createGatewayFixture({ pinError: new Error('pin'), deleteError: new Error('delete') });
    const reportCleanupFailure = jest.fn();
    const provision = createProvisionDiscordPanel(fixture.gateway, reportCleanupFailure);

    await expect(provision({ guildId, textChannelId: channelId, panel })).rejects.toBeDefined();

    expect(reportCleanupFailure).toHaveBeenCalledTimes(1);
    expect(fixture.operations.at(-1)).toBe('destroy');
  });

  it('fails before message creation when required provisioning permissions are missing', async () => {
    const fixture = createGatewayFixture({ permissions: [] });
    const provision = createProvisionDiscordPanel(fixture.gateway, jest.fn());

    await expect(provision({ guildId, textChannelId: channelId, panel })).rejects.toMatchObject({
      code: 'DISCORD_PANEL_PROVISION_ERROR',
      stage: 'permissions',
    });
    expect(fixture.operations).toEqual(['connect', 'resolve_text_channel', 'destroy']);
  });

  it('maps one-shot destroy failure without attempting destroy twice', async () => {
    const fixture = createGatewayFixture({ destroyError: new Error('raw destroy details') });
    const provision = createProvisionDiscordPanel(fixture.gateway, jest.fn());

    const result = await provision({ guildId, textChannelId: channelId, panel }).catch((error: unknown) => error);

    expect(result).toMatchObject({ code: 'DISCORD_PANEL_PROVISION_ERROR', stage: 'destroy' });
    expect(String(result)).not.toContain('raw destroy details');
    expect(fixture.operations.filter((operation) => operation === 'destroy')).toHaveLength(1);
  });

  it.each([
    ['connect', { connectError: new Error('connect') }, ['connect', 'destroy']],
    ['channel resolution', { resolveError: new Error('resolve') }, ['connect', 'resolve_text_channel', 'destroy']],
    [
      'message creation',
      { createError: new Error('create') },
      ['connect', 'resolve_text_channel', 'create_message', 'destroy'],
    ],
  ] satisfies readonly (readonly [string, GatewayFixtureOptions, readonly string[]])[])(
    'destroys the one-shot client after %s failure',
    async (_caseName, options, expectedOperations) => {
      const fixture = createGatewayFixture(options);
      const provision = createProvisionDiscordPanel(fixture.gateway, jest.fn());

      await expect(provision({ guildId, textChannelId: channelId, panel })).rejects.toBeDefined();

      expect(fixture.operations).toEqual(expectedOperations);
    }
  );

  it('validates the configured panel without mutating or destroying the normal client', async () => {
    const fixture = createGatewayFixture();
    const validate = createValidateDiscordPanel(fixture.gateway);

    await expect(validate({ guildId, textChannelId: channelId, controlMessageId: messageId, panel })).resolves.toBe(
      undefined
    );

    expect(fixture.operations).toEqual(['connect', 'resolve_text_channel', 'fetch_message']);
  });

  it.each([
    ['missing permissions', { permissions: [] }, 'missing_permissions', ['connect', 'resolve_text_channel']],
    ['different author', { authorId: '567890123456789012' }, 'wrong_author', validationOperations],
    ['different message', { fetchedMessageId: '678901234567890123' }, 'wrong_location', validationOperations],
    ['unpinned message', { pinned: false }, 'not_pinned', validationOperations],
    [
      'different canonical payload',
      { fetchedPanel: Object.freeze({ content: 'old panel', rows: [] }) },
      'panel_mismatch',
      validationOperations,
    ],
  ] satisfies readonly (readonly [string, GatewayFixtureOptions, string, readonly string[]])[])(
    'rejects %s without repairing it',
    async (_caseName, options, reason, expectedOperations) => {
      const fixture = createGatewayFixture(options);
      const validate = createValidateDiscordPanel(fixture.gateway);

      await expect(
        validate({ guildId, textChannelId: channelId, controlMessageId: messageId, panel })
      ).rejects.toMatchObject({ code: 'DISCORD_PANEL_VALIDATION_ERROR', reason });

      expect(fixture.operations).toEqual(expectedOperations);
      expect(fixture.operations).not.toContain('create_message');
      expect(fixture.operations).not.toContain('pin_message');
      expect(fixture.operations).not.toContain('delete_message');
    }
  );
});

type GatewayFixtureOptions = Readonly<{
  connectError?: Error;
  resolveError?: Error;
  createError?: Error;
  pinError?: Error;
  deleteError?: Error;
  destroyError?: Error;
  fetchedPanel?: DiscordPanelDefinition;
  fetchedMessageId?: string;
  permissions?: readonly (typeof REQUIRED_DISCORD_PANEL_PERMISSIONS)[number][];
  authorId?: string;
  pinned?: boolean;
}>;

function createGatewayFixture(options: GatewayFixtureOptions = {}) {
  const operations: string[] = [];
  const channel = Object.freeze({
    guildId,
    channelId,
    kind: 'guild_text' as const,
    permissions: options.permissions ?? REQUIRED_DISCORD_PANEL_PERMISSIONS,
  });

  const gateway: DiscordPanelGateway = Object.freeze({
    connect: () => {
      operations.push('connect');
      return options.connectError === undefined
        ? Promise.resolve(Object.freeze({ botUserId }))
        : Promise.reject(options.connectError);
    },
    resolveTextChannel: () => {
      operations.push('resolve_text_channel');
      return options.resolveError === undefined ? Promise.resolve(channel) : Promise.reject(options.resolveError);
    },
    createMessage: () => {
      operations.push('create_message');
      return options.createError === undefined
        ? Promise.resolve(Object.freeze({ id: messageId }))
        : Promise.reject(options.createError);
    },
    pinMessage: () => {
      operations.push('pin_message');
      return options.pinError === undefined ? Promise.resolve() : Promise.reject(options.pinError);
    },
    deleteMessage: () => {
      operations.push('delete_message');
      return options.deleteError === undefined ? Promise.resolve() : Promise.reject(options.deleteError);
    },
    fetchMessage: () => {
      operations.push('fetch_message');
      return Promise.resolve(
        Object.freeze({
          id: options.fetchedMessageId ?? messageId,
          guildId,
          channelId,
          authorId: options.authorId ?? botUserId,
          pinned: options.pinned ?? true,
          panel: options.fetchedPanel ?? panel,
        })
      );
    },
    destroy: () => {
      operations.push('destroy');
      return options.destroyError === undefined ? Promise.resolve() : Promise.reject(options.destroyError);
    },
  });

  return { gateway, operations };
}
