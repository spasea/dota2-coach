import type { BuildCoachContext, ContextUnavailableStatus } from '../../../modules/match/public.js';
import { discordInteractionNotImplemented } from './discord-interaction-not-implemented.js';

export type DiscordLostActionScope = Readonly<{
  matchId: string;
  clientId: string;
  discordUserId: string;
}>;

export type ResolveDiscordLostActionScopeResult =
  Readonly<{ status: 'ready'; scope: DiscordLostActionScope }> | Readonly<{ status: ContextUnavailableStatus }>;

export type ResolveDiscordLostActionScope = (discordUserId: string) => ResolveDiscordLostActionScopeResult;

export type DiscordLostScopeContext = Readonly<{
  matchId: string;
  requester: Readonly<{
    identity: Readonly<{
      clientId: string;
      discordUserId: string;
    }>;
  }>;
}>;

export function projectDiscordLostActionScope(_context: DiscordLostScopeContext): DiscordLostActionScope {
  void _context;
  return discordInteractionNotImplemented();
}

export function createResolveDiscordLostActionScope(
  _buildCoachContext: BuildCoachContext
): ResolveDiscordLostActionScope {
  void _buildCoachContext;
  return () => discordInteractionNotImplemented();
}
