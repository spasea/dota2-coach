import type { NormalizedClientState } from './normalized-client-state.js';
import type { Team } from './normalized-snapshot.js';

export type TimelineStatus = 'rebaselining' | 'healthy' | 'stale';

export type MatchSession = Readonly<{
  matchId: string;
  team: Team;
  timelineSourceClientId: string;
  timelineStatus: TimelineStatus;
  lastUsableSourceReceivedAt: number;
  sourceObservedPostGame: boolean;
}>;

export type TimelineUpdate = 'none' | 'baseline' | 'delta';

export type MatchSessionDecision = Readonly<{
  session: MatchSession | null;
  timelineUpdate: TimelineUpdate;
  resetPreviousSession: boolean;
}>;

export type AdvanceMatchSessionInput = Readonly<{
  currentSession: MatchSession | null;
  state: NormalizedClientState;
  freshnessMs: number;
}>;

export type EvaluateTimelineStatusInput = Readonly<{
  session: MatchSession;
  now: number;
  freshnessMs: number;
}>;

export function advanceMatchSession(input: AdvanceMatchSessionInput): MatchSessionDecision {
  void input.state;
  void input.freshnessMs;

  return Object.freeze({
    session: input.currentSession,
    timelineUpdate: 'none',
    resetPreviousSession: false,
  });
}

export function evaluateTimelineStatus(input: EvaluateTimelineStatusInput): TimelineStatus {
  void input.now;
  void input.freshnessMs;

  return input.session.timelineStatus;
}
