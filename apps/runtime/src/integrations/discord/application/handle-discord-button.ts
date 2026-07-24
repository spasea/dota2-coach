import type { RecommendLostAction, RecommendLostActionResult } from '../../../modules/lost/public.js';
import type { ContextUnavailableStatus, Role, SetRequesterRoleOverride } from '../../../modules/match/public.js';
import type { EnqueueSpeech } from '../../../modules/speech/public.js';
import type { DiscordButtonObservation, DiscordPanelTarget, PublishDiscordMessage } from '../discord.types.js';
import { parseDiscordPanelAction, type DiscordPanelAction } from '../panel/discord-panel.js';
import type { DiscordActionDebounce } from './action-debounce.js';
import { discordMessage, type DiscordMessage } from './discord-message.js';
import type { PresentDiscordLostMessage } from './present-discord-lost-message.js';
import type { ResolveDiscordLostActionScope } from './resolve-discord-lost-action-scope.js';

export type DiscordInteractionResponder = Readonly<{
  replyEphemeral: (message: DiscordMessage) => Promise<void>;
  deferEphemeral: () => Promise<void>;
  editEphemeral: (message: DiscordMessage) => Promise<void>;
}>;

export type HandleDiscordButtonCommand = Readonly<{
  interaction: DiscordButtonObservation;
  responder: DiscordInteractionResponder;
}>;

export type DiscordInteractionLogCode =
  | 'DISCORD_INTERACTION_REJECTED'
  | 'DISCORD_ACTION_DUPLICATE'
  | 'DISCORD_LOST_UNAVAILABLE'
  | 'DISCORD_LOST_DELIVERED'
  | 'DISCORD_LOST_DELIVERY_FAILED'
  | 'DISCORD_ROLE_UPDATED'
  | 'DISCORD_INTERACTION_FAILED';

export type DiscordInteractionLogEvent = Readonly<{
  requestId: string;
  code: DiscordInteractionLogCode;
  stage: 'validation' | 'preflight' | 'acknowledgement' | 'recommendation' | 'presentation' | 'delivery' | 'role';
  action?: 'lost' | 'buy_disabled' | 'set_role';
  clientId?: string;
  matchId?: string;
  role?: Role;
  deliveryStatus?: 'sent' | 'failed';
}>;

export type HandleDiscordButtonDependencies = Readonly<{
  panelTarget: DiscordPanelTarget;
  debounce: DiscordActionDebounce;
  resolveLostActionScope: ResolveDiscordLostActionScope;
  recommendLostAction: RecommendLostAction;
  setRequesterRoleOverride: SetRequesterRoleOverride;
  presentLostMessage: PresentDiscordLostMessage;
  publishMessage: PublishDiscordMessage;
  enqueueSpeech: EnqueueSpeech;
  recordEvent: (event: DiscordInteractionLogEvent) => void;
}>;

export type HandleDiscordButton = (command: HandleDiscordButtonCommand) => Promise<void>;

type InteractionStage = DiscordInteractionLogEvent['stage'];
type LostUnavailableReason = Extract<RecommendLostActionResult, { status: 'unavailable' }>['reason'];
type AcknowledgementState = 'pending' | 'defer_attempted' | 'deferred' | 'terminal_attempted';

interface InteractionExecution {
  stage: InteractionStage;
  action?: DiscordInteractionLogEvent['action'];
  clientId?: string;
  matchId?: string;
}

type InteractionAcknowledgement = Readonly<{
  reply: (message: DiscordMessage) => Promise<void>;
  defer: () => Promise<void>;
  edit: (message: DiscordMessage) => Promise<void>;
  completeUnexpected: () => Promise<void>;
}>;

type ActionInput = Readonly<{
  interaction: DiscordButtonObservation;
  acknowledgement: InteractionAcknowledgement;
  execution: InteractionExecution;
  dependencies: HandleDiscordButtonDependencies;
}>;

export function createHandleDiscordButton(dependencies: HandleDiscordButtonDependencies): HandleDiscordButton {
  return async (command) => {
    const execution: InteractionExecution = { stage: 'validation' };
    const acknowledgement = createInteractionAcknowledgement(command.responder);

    try {
      const action = resolvePanelAction(command.interaction, dependencies.panelTarget);

      if (action === null) {
        recordEvent(dependencies, {
          requestId: command.interaction.requestId,
          code: 'DISCORD_INTERACTION_REJECTED',
          stage: 'validation',
        });
        await acknowledgement.reply(discordMessage('discord.error.invalid_source', undefined));
        return;
      }

      execution.action = toLogAction(action);

      switch (action.kind) {
        case 'buy_disabled':
          await acknowledgement.reply(discordMessage('discord.buy.disabled', undefined));
          return;
        case 'request_lost':
          await handleLostAction({
            interaction: command.interaction,
            acknowledgement,
            execution,
            dependencies,
          });
          return;
        case 'set_role':
          await handleRoleAction(
            {
              interaction: command.interaction,
              acknowledgement,
              execution,
              dependencies,
            },
            action.role
          );
      }
    } catch {
      await acknowledgement.completeUnexpected();
      recordEvent(dependencies, {
        requestId: command.interaction.requestId,
        code: 'DISCORD_INTERACTION_FAILED',
        stage: execution.stage,
        ...(execution.action === undefined ? {} : { action: execution.action }),
        ...(execution.clientId === undefined ? {} : { clientId: execution.clientId }),
        ...(execution.matchId === undefined ? {} : { matchId: execution.matchId }),
      });
    }
  };
}

async function handleLostAction(input: ActionInput): Promise<void> {
  const { interaction, acknowledgement, execution, dependencies } = input;
  execution.stage = 'preflight';
  const scopeResult = dependencies.resolveLostActionScope(interaction.discordUserId);

  if (scopeResult.status !== 'ready') {
    recordEvent(dependencies, {
      requestId: interaction.requestId,
      code: 'DISCORD_LOST_UNAVAILABLE',
      stage: 'preflight',
      action: 'lost',
    });
    await acknowledgement.reply(unavailableMessage(scopeResult.status));
    return;
  }

  const { scope } = scopeResult;
  execution.clientId = scope.clientId;
  execution.matchId = scope.matchId;
  const debounceResult = dependencies.debounce.tryAccept({
    matchId: scope.matchId,
    discordUserId: scope.discordUserId,
    actionType: 'lost',
  });

  if (debounceResult.status === 'duplicate') {
    recordEvent(dependencies, {
      requestId: interaction.requestId,
      code: 'DISCORD_ACTION_DUPLICATE',
      stage: 'preflight',
      action: 'lost',
      clientId: scope.clientId,
      matchId: scope.matchId,
    });
    await acknowledgement.reply(discordMessage('discord.lost.duplicate', undefined));
    return;
  }

  execution.stage = 'acknowledgement';
  await acknowledgement.defer();
  execution.stage = 'recommendation';
  const recommendationResult = dependencies.recommendLostAction({
    discordUserId: interaction.discordUserId,
    expectedMatchId: scope.matchId,
  });

  if (recommendationResult.status === 'unavailable') {
    recordEvent(dependencies, {
      requestId: interaction.requestId,
      code: 'DISCORD_LOST_UNAVAILABLE',
      stage: 'recommendation',
      action: 'lost',
      clientId: scope.clientId,
      matchId: scope.matchId,
    });
    await acknowledgement.edit(unavailableMessage(recommendationResult.reason));
    return;
  }

  execution.stage = 'presentation';
  const presentation = dependencies.presentLostMessage(recommendationResult);

  if (presentation.status === 'too_long') {
    recordDeliveryFailure(input, scope.clientId, scope.matchId, 'presentation');
    await acknowledgement.edit(discordMessage('discord.lost.delivery_failed', undefined));
    return;
  }

  execution.stage = 'delivery';

  try {
    await dependencies.publishMessage(presentation.message);
  } catch {
    recordDeliveryFailure(input, scope.clientId, scope.matchId, 'delivery');
    await acknowledgement.edit(discordMessage('discord.lost.delivery_failed', undefined));
    return;
  }

  recordEvent(dependencies, {
    requestId: interaction.requestId,
    code: 'DISCORD_LOST_DELIVERED',
    stage: 'delivery',
    action: 'lost',
    clientId: scope.clientId,
    matchId: scope.matchId,
    deliveryStatus: 'sent',
  });
  await acknowledgement.edit(discordMessage('discord.lost.delivered', undefined));
}

async function handleRoleAction(input: ActionInput, role: Role): Promise<void> {
  const { interaction, acknowledgement, execution, dependencies } = input;
  execution.stage = 'acknowledgement';
  await acknowledgement.defer();
  execution.stage = 'role';
  const result = dependencies.setRequesterRoleOverride({
    discordUserId: interaction.discordUserId,
    role,
  });

  if (result.status !== 'updated') {
    recordEvent(dependencies, {
      requestId: interaction.requestId,
      code: 'DISCORD_INTERACTION_REJECTED',
      stage: 'role',
      action: 'set_role',
      role,
    });
    await acknowledgement.edit(unavailableMessage(result.status));
    return;
  }

  recordEvent(dependencies, {
    requestId: interaction.requestId,
    code: 'DISCORD_ROLE_UPDATED',
    stage: 'role',
    action: 'set_role',
    role: result.effectiveRole,
  });
  await acknowledgement.edit(discordMessage('discord.role.updated', { role: result.effectiveRole }));
}

function resolvePanelAction(
  interaction: DiscordButtonObservation,
  target: DiscordPanelTarget
): DiscordPanelAction | null {
  const validSource =
    interaction.componentKind === 'button' &&
    interaction.guildId === target.guildId &&
    interaction.channelId === target.textChannelId &&
    interaction.messageId === target.controlMessageId &&
    interaction.customId !== null;

  return validSource ? parseDiscordPanelAction(interaction.customId) : null;
}

function unavailableMessage(reason: ContextUnavailableStatus | LostUnavailableReason): DiscordMessage {
  switch (reason) {
    case 'client_not_found':
      return discordMessage('discord.error.identity_unmapped', undefined);
    case 'snapshot_missing':
    case 'snapshot_stale':
      return discordMessage('discord.error.gsi_unavailable', undefined);
    case 'match_changed':
      return discordMessage('discord.error.match_changed', undefined);
    case 'match_unavailable':
    case 'outside_active_session':
    case 'game_not_in_progress':
      return discordMessage('discord.error.match_unavailable', undefined);
  }
}

function createInteractionAcknowledgement(responder: DiscordInteractionResponder): InteractionAcknowledgement {
  let state: AcknowledgementState = 'pending';

  return Object.freeze({
    reply: async (message) => {
      state = 'terminal_attempted';
      await responder.replyEphemeral(message);
    },
    defer: async () => {
      state = 'defer_attempted';
      await responder.deferEphemeral();
      state = 'deferred';
    },
    edit: async (message) => {
      state = 'terminal_attempted';
      await responder.editEphemeral(message);
    },
    completeUnexpected: async () => {
      try {
        if (state === 'pending') {
          state = 'terminal_attempted';
          await responder.replyEphemeral(discordMessage('discord.error.unexpected', undefined));

          return;
        }

        if (state === 'deferred') {
          state = 'terminal_attempted';
          await responder.editEphemeral(discordMessage('discord.error.unexpected', undefined));
        }
      } catch {
        return;
      }
    },
  });
}

function recordDeliveryFailure(
  input: ActionInput,
  clientId: string,
  matchId: string,
  stage: 'presentation' | 'delivery'
): void {
  recordEvent(input.dependencies, {
    requestId: input.interaction.requestId,
    code: 'DISCORD_LOST_DELIVERY_FAILED',
    stage,
    action: 'lost',
    clientId,
    matchId,
    deliveryStatus: 'failed',
  });
}

function recordEvent(dependencies: HandleDiscordButtonDependencies, event: DiscordInteractionLogEvent): void {
  try {
    dependencies.recordEvent(Object.freeze(event));
  } catch {
    return;
  }
}

function toLogAction(action: DiscordPanelAction): DiscordInteractionLogEvent['action'] {
  switch (action.kind) {
    case 'request_lost':
      return 'lost';
    case 'buy_disabled':
      return 'buy_disabled';
    case 'set_role':
      return 'set_role';
  }
}
