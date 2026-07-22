import { describe, expect, it } from '@jest/globals';
import { MessageFlags, type MessageComponentInteraction } from 'discord.js';

import { discordMessage } from '../application/discord-message.js';
import { toDiscordPublicMessageOptions } from './discord-gateway-adapter.js';
import {
  createDiscordButtonCommand,
  dispatchDiscordInteraction,
  toDiscordInteractionSource,
  type DiscordInteractionSource,
} from './discord-interaction-adapter.js';

const guildId = '123456789012345678';
const channelId = '234567890123456789';
const messageId = '345678901234567890';
const discordUserId = '456789012345678901';

describe('Discord interaction adapter', () => {
  it('maps an SDK component into an immutable source with ephemeral mention-safe responses', async () => {
    const payloads: unknown[] = [];
    const interaction = {
      id: 'interaction-01',
      guildId,
      channelId,
      message: { id: messageId },
      user: { id: discordUserId },
      customId: 'coach:v1:action:lost',
      isButton: () => true,
      reply: (payload: unknown) => {
        payloads.push(payload);
        return Promise.resolve();
      },
      deferReply: (payload: unknown) => {
        payloads.push(payload);
        return Promise.resolve();
      },
      editReply: (payload: unknown) => {
        payloads.push(payload);
        return Promise.resolve();
      },
    } as unknown as MessageComponentInteraction;

    const source = toDiscordInteractionSource(interaction);

    expect(source).toMatchObject({
      requestId: 'interaction-01',
      componentKind: 'button',
      guildId,
      channelId,
      messageId,
      discordUserId,
      customId: 'coach:v1:action:lost',
    });
    expect(Object.isFrozen(source)).toBe(true);

    await source.replyEphemeral('reply');
    await source.deferEphemeral();
    await source.editEphemeral('edit');

    expect(payloads).toEqual([
      { content: 'reply', flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } },
      { flags: MessageFlags.Ephemeral },
      { content: 'edit', allowedMentions: { parse: [] } },
    ]);
  });

  it('translates typed messages at the SDK boundary and preserves the local observation', async () => {
    const operations: string[] = [];
    const source = createSource(operations);
    const command = createDiscordButtonCommand(source, (message) => `[${message.key}]`);

    expect(command.interaction).toEqual({
      requestId: 'interaction-01',
      componentKind: 'button',
      guildId,
      channelId,
      messageId,
      discordUserId,
      customId: 'coach:v1:action:lost',
    });
    expect(Object.isFrozen(command)).toBe(true);
    expect(Object.isFrozen(command.interaction)).toBe(true);
    expect(Object.isFrozen(command.responder)).toBe(true);

    await command.responder.replyEphemeral(discordMessage('discord.buy.disabled', undefined));
    await command.responder.deferEphemeral();
    await command.responder.editEphemeral(discordMessage('discord.lost.delivered', undefined));

    expect(operations).toEqual(['reply:[discord.buy.disabled]', 'defer', 'edit:[discord.lost.delivered]']);
  });

  it('contains an unexpected handler rejection at the event callback seam', async () => {
    const reported: string[] = [];

    await expect(
      dispatchDiscordInteraction(
        createSource([]),
        (message) => message.key,
        () => Promise.reject(new Error('raw handler details')),
        () => reported.push('failed')
      )
    ).resolves.toBeUndefined();

    expect(reported).toEqual(['failed']);
  });

  it('builds a public payload that cannot generate mentions', () => {
    const options = toDiscordPublicMessageOptions({
      content: '@everyone safe recommendation',
      suppressMentions: true,
    });

    expect(options).toEqual({
      content: '@everyone safe recommendation',
      allowedMentions: { parse: [] },
    });
    expect(Object.isFrozen(options)).toBe(true);
    expect(Object.isFrozen(options.allowedMentions)).toBe(true);
    expect(Object.isFrozen(options.allowedMentions.parse)).toBe(true);
  });
});

function createSource(operations: string[]): DiscordInteractionSource {
  return Object.freeze({
    requestId: 'interaction-01',
    componentKind: 'button',
    guildId,
    channelId,
    messageId,
    discordUserId,
    customId: 'coach:v1:action:lost',
    replyEphemeral: (content) => {
      operations.push(`reply:${content}`);
      return Promise.resolve();
    },
    deferEphemeral: () => {
      operations.push('defer');
      return Promise.resolve();
    },
    editEphemeral: (content) => {
      operations.push(`edit:${content}`);
      return Promise.resolve();
    },
  });
}
