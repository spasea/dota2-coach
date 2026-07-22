export type DiscordButtonObservation = Readonly<{
  requestId: string;
  componentKind: 'button' | 'unsupported';
  guildId: string | null;
  channelId: string | null;
  messageId: string | null;
  discordUserId: string;
  customId: string | null;
}>;

export type DiscordPanelTarget = Readonly<{
  guildId: string;
  textChannelId: string;
  controlMessageId: string;
}>;

export type DiscordPublicMessage = Readonly<{
  content: string;
  suppressMentions: true;
}>;

export type PublishDiscordMessage = (message: DiscordPublicMessage) => Promise<void>;

export type DiscordGatewayState = 'disconnected' | 'reconnecting' | 'resumed';
