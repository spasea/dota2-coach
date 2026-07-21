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

const POST_GAME_STATE = 'DOTA_GAMERULES_STATE_POST_GAME';

function decision(
  session: MatchSession | null,
  timelineUpdate: TimelineUpdate,
  resetPreviousSession: boolean
): MatchSessionDecision {
  return Object.freeze({ session, timelineUpdate, resetPreviousSession });
}

function createBaselineSession(
  matchId: string,
  team: Team,
  timelineSourceClientId: string,
  receivedAt: number,
  sourceObservedPostGame: boolean
): MatchSession {
  return Object.freeze({
    matchId,
    team,
    timelineSourceClientId,
    timelineStatus: 'rebaselining',
    lastUsableSourceReceivedAt: receivedAt,
    sourceObservedPostGame,
  });
}

export function advanceMatchSession(input: AdvanceMatchSessionInput): MatchSessionDecision {
  const match = input.state.snapshot.match;
  const matchId = match?.matchId;
  const team = input.state.snapshot.player?.team;
  const hasUsablePair = matchId !== null && matchId !== undefined && matchId.trim().length > 0 && team != null;
  const sourceObservedPostGame = match?.gameState === POST_GAME_STATE;

  if (input.currentSession === null) {
    if (!hasUsablePair) {
      return decision(null, 'none', false);
    }

    return decision(
      createBaselineSession(
        matchId,
        team,
        input.state.identity.clientId,
        input.state.receivedAt,
        sourceObservedPostGame
      ),
      'baseline',
      false
    );
  }

  const currentSession = input.currentSession;
  const timelineStatus = evaluateTimelineStatus({
    session: currentSession,
    now: input.state.receivedAt,
    freshnessMs: input.freshnessMs,
  });
  const sessionAtReceiveTime =
    timelineStatus === currentSession.timelineStatus
      ? currentSession
      : Object.freeze({ ...currentSession, timelineStatus });
  const isTimelineSource = input.state.identity.clientId === currentSession.timelineSourceClientId;

  if (!isTimelineSource) {
    return decision(sessionAtReceiveTime, 'none', false);
  }

  if (!hasUsablePair) {
    if (currentSession.sourceObservedPostGame && match === null) {
      return decision(null, 'none', true);
    }

    return decision(sessionAtReceiveTime, 'none', false);
  }

  const isCurrentSession = matchId === currentSession.matchId && team === currentSession.team;

  if (!isCurrentSession) {
    return decision(
      createBaselineSession(
        matchId,
        team,
        currentSession.timelineSourceClientId,
        input.state.receivedAt,
        sourceObservedPostGame
      ),
      'baseline',
      true
    );
  }

  if (timelineStatus === 'stale') {
    return decision(
      createBaselineSession(
        currentSession.matchId,
        currentSession.team,
        currentSession.timelineSourceClientId,
        input.state.receivedAt,
        currentSession.sourceObservedPostGame || sourceObservedPostGame
      ),
      'baseline',
      false
    );
  }

  return decision(
    Object.freeze({
      ...currentSession,
      timelineStatus: 'healthy',
      lastUsableSourceReceivedAt: input.state.receivedAt,
      sourceObservedPostGame: currentSession.sourceObservedPostGame || sourceObservedPostGame,
    }),
    'delta',
    false
  );
}

export function evaluateTimelineStatus(input: EvaluateTimelineStatusInput): TimelineStatus {
  if (!Number.isFinite(input.freshnessMs) || input.freshnessMs <= 0) {
    throw new RangeError('Freshness must be a positive finite number.');
  }

  const age = input.now - input.session.lastUsableSourceReceivedAt;

  if (!Number.isFinite(age) || age < 0) {
    throw new RangeError('Timeline age must be a non-negative finite number.');
  }

  if (age >= input.freshnessMs) {
    return 'stale';
  }

  return input.session.timelineStatus;
}
