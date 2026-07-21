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
  void input;

  return Object.freeze({
    clients: Object.freeze([]),
    coverage: 0,
    sharedState: null,
  });
}
