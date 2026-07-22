import type { RecommendLostAction } from '../../../modules/lost/public.js';
import type { Role, SetRequesterRoleOverride } from '../../../modules/match/public.js';
import type { DiscordButtonObservation, DiscordPanelTarget, PublishDiscordMessage } from '../discord.types.js';
import type { DiscordActionDebounce } from './action-debounce.js';
import { rejectDiscordInteractionNotImplemented } from './discord-interaction-not-implemented.js';
import type { DiscordMessage } from './discord-message.js';
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
  recordEvent: (event: DiscordInteractionLogEvent) => void;
}>;

export type HandleDiscordButton = (command: HandleDiscordButtonCommand) => Promise<void>;

export function createHandleDiscordButton(_dependencies: HandleDiscordButtonDependencies): HandleDiscordButton {
  void _dependencies;
  return () => rejectDiscordInteractionNotImplemented();
}
