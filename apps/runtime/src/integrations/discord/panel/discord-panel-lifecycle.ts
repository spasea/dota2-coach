import type { DiscordPanelDefinition } from './discord-panel.js';

export const REQUIRED_DISCORD_PANEL_PERMISSIONS = Object.freeze([
  'view_channel',
  'read_message_history',
  'send_messages',
  'pin_messages',
] as const);

export type DiscordPanelPermission = (typeof REQUIRED_DISCORD_PANEL_PERMISSIONS)[number];

export type DiscordPanelChannel = Readonly<{
  guildId: string;
  channelId: string;
  kind: 'guild_text';
  permissions: readonly DiscordPanelPermission[];
}>;

export type DiscordPanelMessage = Readonly<{
  id: string;
  guildId: string;
  channelId: string;
  authorId: string;
  pinned: boolean;
  panel: DiscordPanelDefinition;
}>;

export type DiscordPanelGateway = Readonly<{
  connect: () => Promise<Readonly<{ botUserId: string }>>;
  resolveTextChannel: (guildId: string, channelId: string) => Promise<DiscordPanelChannel>;
  createMessage: (channel: DiscordPanelChannel, panel: DiscordPanelDefinition) => Promise<Readonly<{ id: string }>>;
  pinMessage: (channel: DiscordPanelChannel, messageId: string) => Promise<void>;
  deleteMessage: (channel: DiscordPanelChannel, messageId: string) => Promise<void>;
  fetchMessage: (channel: DiscordPanelChannel, messageId: string) => Promise<DiscordPanelMessage>;
  destroy: () => Promise<void>;
}>;

export type ProvisionDiscordPanelCommand = Readonly<{
  guildId: string;
  textChannelId: string;
  panel: DiscordPanelDefinition;
}>;

export type ProvisionDiscordPanelResult = Readonly<{
  guildId: string;
  channelId: string;
  controlMessageId: string;
}>;

export type ProvisionDiscordPanel = (command: ProvisionDiscordPanelCommand) => Promise<ProvisionDiscordPanelResult>;

export type ValidateDiscordPanelCommand = Readonly<{
  guildId: string;
  textChannelId: string;
  controlMessageId: string;
  panel: DiscordPanelDefinition;
}>;

export type ValidateDiscordPanel = (command: ValidateDiscordPanelCommand) => Promise<void>;

export function createProvisionDiscordPanel(
  gateway: DiscordPanelGateway,
  reportCleanupFailure: () => void
): ProvisionDiscordPanel {
  void gateway;
  void reportCleanupFailure;
  return () => Promise.reject(new Error('Discord panel provisioning is not implemented.'));
}

export function createValidateDiscordPanel(gateway: DiscordPanelGateway): ValidateDiscordPanel {
  void gateway;
  return () => Promise.reject(new Error('Discord panel validation is not implemented.'));
}
