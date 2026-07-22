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

export type DiscordPanelProvisionStage = 'connect' | 'resolve_channel' | 'permissions' | 'create' | 'pin' | 'destroy';

export class DiscordPanelProvisionError extends Error {
  readonly code = 'DISCORD_PANEL_PROVISION_ERROR';
  readonly stage: DiscordPanelProvisionStage;

  constructor(stage: DiscordPanelProvisionStage) {
    super(`Discord panel provisioning failed at ${stage}.`);
    this.name = 'DiscordPanelProvisionError';
    this.stage = stage;
  }
}

export type DiscordPanelValidationReason =
  | 'connection_unavailable'
  | 'channel_unavailable'
  | 'missing_permissions'
  | 'message_unavailable'
  | 'wrong_location'
  | 'wrong_author'
  | 'not_pinned'
  | 'panel_mismatch';

export class DiscordPanelValidationError extends Error {
  readonly code = 'DISCORD_PANEL_VALIDATION_ERROR';
  readonly reason: DiscordPanelValidationReason;

  constructor(reason: DiscordPanelValidationReason) {
    super(`Discord panel validation failed: ${reason}.`);
    this.name = 'DiscordPanelValidationError';
    this.reason = reason;
  }
}

export function createProvisionDiscordPanel(
  gateway: DiscordPanelGateway,
  reportCleanupFailure: () => void
): ProvisionDiscordPanel {
  return async (command) => {
    let result: ProvisionDiscordPanelResult;

    try {
      result = await provisionPanel(gateway, command, reportCleanupFailure);
    } catch (error) {
      await destroyProvisionClientAfterFailure(gateway, reportCleanupFailure);
      throw error;
    }

    await destroyProvisionClientAfterSuccess(gateway);
    return result;
  };
}

export function createValidateDiscordPanel(gateway: DiscordPanelGateway): ValidateDiscordPanel {
  return async (command) => {
    const connection = await safelyValidateConnect(gateway);
    const channel = await safelyResolveValidationChannel(gateway, command);
    assertRequiredPermissions(channel, 'validate');
    const message = await safelyFetchMessage(gateway, channel, command.controlMessageId);

    if (
      message.id !== command.controlMessageId ||
      message.guildId !== command.guildId ||
      message.channelId !== command.textChannelId
    ) {
      throw new DiscordPanelValidationError('wrong_location');
    }

    if (message.authorId !== connection.botUserId) {
      throw new DiscordPanelValidationError('wrong_author');
    }

    if (!message.pinned) {
      throw new DiscordPanelValidationError('not_pinned');
    }

    if (!panelsEqual(message.panel, command.panel)) {
      throw new DiscordPanelValidationError('panel_mismatch');
    }
  };
}

async function provisionPanel(
  gateway: DiscordPanelGateway,
  command: ProvisionDiscordPanelCommand,
  reportCleanupFailure: () => void
): Promise<ProvisionDiscordPanelResult> {
  await safelyProvisionConnect(gateway);
  const channel = await safelyResolveProvisionChannel(gateway, command);
  assertRequiredPermissions(channel, 'provision');
  const message = await safelyCreateMessage(gateway, channel, command.panel);

  try {
    await gateway.pinMessage(channel, message.id);
  } catch {
    await compensateCreatedMessage(gateway, channel, message.id, reportCleanupFailure);
    throw new DiscordPanelProvisionError('pin');
  }

  return Object.freeze({
    guildId: channel.guildId,
    channelId: channel.channelId,
    controlMessageId: message.id,
  });
}

async function destroyProvisionClientAfterSuccess(gateway: DiscordPanelGateway): Promise<void> {
  try {
    await gateway.destroy();
  } catch {
    throw new DiscordPanelProvisionError('destroy');
  }
}

async function destroyProvisionClientAfterFailure(
  gateway: DiscordPanelGateway,
  reportCleanupFailure: () => void
): Promise<void> {
  try {
    await gateway.destroy();
  } catch {
    reportCleanupFailure();
  }
}

async function safelyProvisionConnect(gateway: DiscordPanelGateway): Promise<void> {
  try {
    await gateway.connect();
  } catch {
    throw new DiscordPanelProvisionError('connect');
  }
}

async function safelyResolveProvisionChannel(
  gateway: DiscordPanelGateway,
  command: ProvisionDiscordPanelCommand
): Promise<DiscordPanelChannel> {
  try {
    return await gateway.resolveTextChannel(command.guildId, command.textChannelId);
  } catch {
    throw new DiscordPanelProvisionError('resolve_channel');
  }
}

async function safelyCreateMessage(
  gateway: DiscordPanelGateway,
  channel: DiscordPanelChannel,
  panel: DiscordPanelDefinition
): Promise<Readonly<{ id: string }>> {
  try {
    return await gateway.createMessage(channel, panel);
  } catch {
    throw new DiscordPanelProvisionError('create');
  }
}

async function compensateCreatedMessage(
  gateway: DiscordPanelGateway,
  channel: DiscordPanelChannel,
  messageId: string,
  reportCleanupFailure: () => void
): Promise<void> {
  try {
    await gateway.deleteMessage(channel, messageId);
  } catch {
    reportCleanupFailure();
  }
}

async function safelyValidateConnect(gateway: DiscordPanelGateway): Promise<Readonly<{ botUserId: string }>> {
  try {
    return await gateway.connect();
  } catch {
    throw new DiscordPanelValidationError('connection_unavailable');
  }
}

async function safelyResolveValidationChannel(
  gateway: DiscordPanelGateway,
  command: ValidateDiscordPanelCommand
): Promise<DiscordPanelChannel> {
  try {
    return await gateway.resolveTextChannel(command.guildId, command.textChannelId);
  } catch {
    throw new DiscordPanelValidationError('channel_unavailable');
  }
}

async function safelyFetchMessage(
  gateway: DiscordPanelGateway,
  channel: DiscordPanelChannel,
  messageId: string
): Promise<DiscordPanelMessage> {
  try {
    return await gateway.fetchMessage(channel, messageId);
  } catch {
    throw new DiscordPanelValidationError('message_unavailable');
  }
}

function assertRequiredPermissions(channel: DiscordPanelChannel, mode: 'provision' | 'validate'): void {
  const availablePermissions = new Set(channel.permissions);
  const hasRequiredPermissions = REQUIRED_DISCORD_PANEL_PERMISSIONS.every((permission) =>
    availablePermissions.has(permission)
  );

  if (hasRequiredPermissions) {
    return;
  }

  if (mode === 'provision') {
    throw new DiscordPanelProvisionError('permissions');
  }

  throw new DiscordPanelValidationError('missing_permissions');
}

function panelsEqual(left: DiscordPanelDefinition, right: DiscordPanelDefinition): boolean {
  if (left.content !== right.content || left.rows.length !== right.rows.length) {
    return false;
  }

  return left.rows.every((leftRow, rowIndex) => {
    const rightRow = right.rows[rowIndex];

    if (leftRow.buttons.length !== rightRow?.buttons.length) {
      return false;
    }

    return leftRow.buttons.every((leftButton, buttonIndex) => {
      const rightButton = rightRow.buttons[buttonIndex];

      return buttonsEqual(leftButton, rightButton);
    });
  });
}

function buttonsEqual(
  left: DiscordPanelDefinition['rows'][number]['buttons'][number],
  right: DiscordPanelDefinition['rows'][number]['buttons'][number] | undefined
): boolean {
  return (
    left.customId === right?.customId &&
    left.label === right.label &&
    left.style === right.style &&
    left.disabled === right.disabled
  );
}
