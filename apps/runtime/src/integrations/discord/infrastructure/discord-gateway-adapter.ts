import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Interaction,
  type Message,
  type TextChannel,
} from 'discord.js';

import type { DiscordGatewayState, DiscordPublicMessage, PublishDiscordMessage } from '../discord.types.js';
import type { DiscordPanelButton, DiscordPanelDefinition, DiscordPanelRow } from '../panel/discord-panel.js';
import { toDiscordInteractionSource, type DiscordInteractionSource } from './discord-interaction-adapter.js';
import type {
  DiscordPanelChannel,
  DiscordPanelGateway,
  DiscordPanelPermission,
} from '../panel/discord-panel-lifecycle.js';

const permissionFlags: Readonly<Record<DiscordPanelPermission, bigint>> = Object.freeze({
  view_channel: PermissionFlagsBits.ViewChannel,
  read_message_history: PermissionFlagsBits.ReadMessageHistory,
  send_messages: PermissionFlagsBits.SendMessages,
  pin_messages: PermissionFlagsBits.PinMessages,
});

export type DiscordGatewayAdapter = DiscordPanelGateway &
  Readonly<{
    publishMessage: PublishDiscordMessage;
    observeInteractions: (observer: (source: DiscordInteractionSource) => Promise<void>) => () => void;
    observeGatewayState: (observer: (state: DiscordGatewayState) => void) => () => void;
  }>;

export type CreateDiscordGatewayAdapterDependencies = Readonly<{
  createClient: () => Client;
}>;

export type DiscordGatewayMode = 'provisioning' | 'serving';

export const discordGatewayIntents: Readonly<Record<DiscordGatewayMode, readonly GatewayIntentBits[]>> = Object.freeze({
  provisioning: Object.freeze([GatewayIntentBits.Guilds]),
  serving: Object.freeze([GatewayIntentBits.Guilds]),
});

export function createDiscordGatewayAdapter(
  botToken: string,
  dependencies?: CreateDiscordGatewayAdapterDependencies,
  mode: DiscordGatewayMode = 'provisioning'
): DiscordGatewayAdapter {
  const client =
    dependencies?.createClient() ??
    new Client({
      intents: discordGatewayIntents[mode],
    });
  let resolvedChannel: TextChannel | null = null;

  return Object.freeze({
    connect: async () => {
      if (!client.isReady()) {
        let removeReadyListener = () => undefined;
        const readyPromise = new Promise<void>((resolve) => {
          const handleReady = () => resolve();
          client.once(Events.ClientReady, handleReady);
          removeReadyListener = () => {
            client.off(Events.ClientReady, handleReady);
          };
        });

        try {
          await client.login(botToken);

          if (!client.isReady()) {
            await readyPromise;
          }
        } finally {
          removeReadyListener();
        }
      }

      if (!client.isReady()) {
        throw new Error('Discord client did not become ready.');
      }

      return Object.freeze({ botUserId: client.user.id });
    },
    resolveTextChannel: async (guildId, channelId) => {
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (channel?.type !== ChannelType.GuildText) {
        throw new Error('Configured Discord channel is not a guild text channel.');
      }

      const botMember = guild.members.me ?? (await guild.members.fetchMe());
      const permissions = channel.permissionsFor(botMember);
      resolvedChannel = channel;

      return Object.freeze({
        guildId: guild.id,
        channelId: channel.id,
        kind: 'guild_text',
        permissions: Object.freeze(
          (Object.entries(permissionFlags) as readonly (readonly [DiscordPanelPermission, bigint])[])
            .filter(([, flag]) => permissions.has(flag))
            .map(([permission]) => permission)
        ),
      });
    },
    createMessage: async (channel, panel) => {
      const message = await requireResolvedChannel(channel, resolvedChannel).send({
        content: panel.content,
        components: panel.rows.map(toActionRow),
        allowedMentions: { parse: [] },
      });

      return Object.freeze({ id: message.id });
    },
    pinMessage: async (channel, messageId) => {
      await requireResolvedChannel(channel, resolvedChannel).messages.pin(messageId);
    },
    deleteMessage: async (channel, messageId) => {
      await requireResolvedChannel(channel, resolvedChannel).messages.delete(messageId);
    },
    fetchMessage: async (channel, messageId) => {
      const message = await requireResolvedChannel(channel, resolvedChannel).messages.fetch(messageId);
      return toPanelMessage(message);
    },
    publishMessage: async (message) => {
      if (resolvedChannel === null) {
        throw new Error('Discord channel was not resolved by this adapter.');
      }

      await resolvedChannel.send(toDiscordPublicMessageOptions(message));
    },
    observeInteractions: (observer) => {
      const handleInteraction = (interaction: Interaction) => {
        if (!interaction.isMessageComponent()) {
          return;
        }

        try {
          void observer(toDiscordInteractionSource(interaction)).catch(() => undefined);
        } catch {
          return;
        }
      };

      client.on(Events.InteractionCreate, handleInteraction);
      return () => client.off(Events.InteractionCreate, handleInteraction);
    },
    observeGatewayState: (observer) => {
      const handleDisconnect = () => notifyGatewayState(observer, 'disconnected');
      const handleReconnecting = () => notifyGatewayState(observer, 'reconnecting');
      const handleResume = () => notifyGatewayState(observer, 'resumed');

      client.on(Events.ShardDisconnect, handleDisconnect);
      client.on(Events.ShardReconnecting, handleReconnecting);
      client.on(Events.ShardResume, handleResume);

      return () => {
        client.off(Events.ShardDisconnect, handleDisconnect);
        client.off(Events.ShardReconnecting, handleReconnecting);
        client.off(Events.ShardResume, handleResume);
      };
    },
    destroy: async () => {
      resolvedChannel = null;
      await client.destroy();
    },
  });
}

function notifyGatewayState(observer: (state: DiscordGatewayState) => void, state: DiscordGatewayState): void {
  try {
    observer(state);
  } catch {
    return;
  }
}

export function toDiscordPublicMessageOptions(message: DiscordPublicMessage) {
  return Object.freeze({
    content: message.content,
    allowedMentions: Object.freeze({ parse: Object.freeze([]) }),
  });
}

function requireResolvedChannel(channel: DiscordPanelChannel, resolvedChannel: TextChannel | null): TextChannel {
  if (resolvedChannel?.guildId !== channel.guildId || resolvedChannel.id !== channel.channelId) {
    throw new Error('Discord channel was not resolved by this adapter.');
  }

  return resolvedChannel;
}

function toActionRow(row: DiscordPanelRow): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(row.buttons.map(toButton));
}

function toButton(button: DiscordPanelButton): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(button.customId)
    .setLabel(button.label)
    .setStyle(toDiscordButtonStyle(button.style))
    .setDisabled(button.disabled);
}

function toDiscordButtonStyle(style: DiscordPanelButton['style']): ButtonStyle {
  switch (style) {
    case 'primary':
      return ButtonStyle.Primary;
    case 'secondary':
      return ButtonStyle.Secondary;
    case 'unsupported':
      throw new Error('Unsupported Discord panel button style.');
  }
}

function toPanelMessage(message: Message<true>) {
  return Object.freeze({
    id: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    authorId: message.author.id,
    pinned: message.pinned,
    panel: freezeObservedPanel({
      content: message.content,
      rows: message.components.map(toObservedRow),
    }),
  });
}

function toObservedRow(component: Message<true>['components'][number]): DiscordPanelRow {
  if (component.type !== ComponentType.ActionRow) {
    return freezeObservedRow([unsupportedButton()]);
  }

  return freezeObservedRow(
    component.components.map((child) => {
      if (child.type !== ComponentType.Button) {
        return unsupportedButton();
      }

      return Object.freeze({
        customId: child.customId ?? '',
        label: child.label ?? '',
        style: toObservedButtonStyle(child.style),
        disabled: child.disabled,
      });
    })
  );
}

function toObservedButtonStyle(style: ButtonStyle): DiscordPanelButton['style'] {
  if (style === ButtonStyle.Primary) {
    return 'primary';
  }

  if (style === ButtonStyle.Secondary) {
    return 'secondary';
  }

  return 'unsupported';
}

function unsupportedButton(): DiscordPanelButton {
  return Object.freeze({ customId: '', label: '', style: 'unsupported', disabled: true });
}

function freezeObservedRow(buttons: readonly DiscordPanelButton[]): DiscordPanelRow {
  return Object.freeze({ buttons: Object.freeze(buttons) });
}

function freezeObservedPanel(panel: DiscordPanelDefinition): DiscordPanelDefinition {
  return Object.freeze({ content: panel.content, rows: Object.freeze(panel.rows) });
}
