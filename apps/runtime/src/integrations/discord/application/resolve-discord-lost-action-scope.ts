import type { BuildCoachContext, ContextUnavailableStatus } from '../../../modules/match/public.js';

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

export function projectDiscordLostActionScope(context: DiscordLostScopeContext): DiscordLostActionScope {
  return Object.freeze({
    matchId: context.matchId,
    clientId: context.requester.identity.clientId,
    discordUserId: context.requester.identity.discordUserId,
  });
}

export function createResolveDiscordLostActionScope(
  buildCoachContext: BuildCoachContext
): ResolveDiscordLostActionScope {
  return (discordUserId) => {
    const contextResult = buildCoachContext({ discordUserId });

    if (contextResult.status !== 'ready') {
      return Object.freeze({ status: contextResult.status });
    }

    return Object.freeze({
      status: 'ready',
      scope: projectDiscordLostActionScope(contextResult.context),
    });
  };
}
