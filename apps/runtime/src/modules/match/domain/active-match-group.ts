import type { MatchSession } from './match-session.js';
import type { NormalizedClientState } from './normalized-client-state.js';

export type ActiveMatchGroup = Readonly<{
  clients: readonly NormalizedClientState[];
  coverage: number;
  sharedState: NormalizedClientState | null;
}>;

export type SelectActiveMatchGroupInput = Readonly<{
  session: MatchSession;
  latestStates: readonly NormalizedClientState[];
  now: number;
  freshnessMs: number;
}>;

export function selectActiveMatchGroup(input: SelectActiveMatchGroupInput): ActiveMatchGroup {
  if (!Number.isFinite(input.freshnessMs) || input.freshnessMs <= 0) {
    throw new RangeError('Freshness must be a positive finite number.');
  }

  const matchingClients: NormalizedClientState[] = [];

  for (const state of input.latestStates) {
    const age = input.now - state.receivedAt;

    if (!Number.isFinite(age) || age < 0) {
      throw new RangeError('Client state age must be a non-negative finite number.');
    }

    if (age >= input.freshnessMs) {
      continue;
    }

    const matchId = state.snapshot.match?.matchId;
    const team = state.snapshot.player?.team;

    if (matchId !== input.session.matchId || team !== input.session.team) {
      continue;
    }

    matchingClients.push(state);
  }

  matchingClients.sort((left, right) => {
    if (left.identity.clientId === right.identity.clientId) {
      return 0;
    }

    return left.identity.clientId < right.identity.clientId ? -1 : 1;
  });

  let sharedState: NormalizedClientState | null = null;

  for (const state of matchingClients) {
    if (sharedState === null || state.receivedAt > sharedState.receivedAt) {
      sharedState = state;
    }
  }

  return Object.freeze({
    clients: Object.freeze(matchingClients),
    coverage: Math.min(matchingClients.length / 5, 1),
    sharedState,
  });
}
