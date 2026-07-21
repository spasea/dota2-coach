import { describe, expect, it } from '@jest/globals';

import type { NormalizedClientState } from './normalized-client-state.js';
import type { NormalizedMatchFacts, NormalizedPlayerFacts, Team } from './normalized-snapshot.js';
import { advanceMatchSession, evaluateTimelineStatus, type MatchSession } from './match-session.js';

const FRESHNESS_MS = 5_000;

type StateInput = Readonly<{
  clientId?: string;
  receivedAt?: number;
  matchId?: string | null;
  team?: Team | null;
  gameState?: string | null;
  hasMatch?: boolean;
}>;

function createState(input: StateInput = {}): NormalizedClientState {
  const matchId = input.matchId === undefined ? 'match-01' : input.matchId;
  const team = input.team === undefined ? 'radiant' : input.team;
  const gameState = input.gameState === undefined ? 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' : input.gameState;
  const match: NormalizedMatchFacts | null =
    input.hasMatch === false
      ? null
      : {
          matchId,
          gameState,
          gameTime: 120,
          clockTime: 30,
          paused: false,
          radiantScore: 1,
          direScore: 2,
        };
  const player: NormalizedPlayerFacts = {
    team,
    teamSlot: 0,
    gold: null,
    lastHits: null,
    denies: null,
    gpm: null,
    xpm: null,
    goldFromHeroKills: null,
    goldFromCreepKills: null,
    goldFromIncome: null,
    goldFromShared: null,
  };
  const clientId = input.clientId ?? 'client-01';

  return {
    identity: {
      clientId,
      discordUserId: `discord-${clientId}`,
      coachAlias: `Coach ${clientId}`,
      defaultRole: 2,
    },
    receivedAt: input.receivedAt ?? 1_000,
    snapshot: {
      sourceTimestampSeconds: null,
      match,
      player,
      hero: null,
      minimapHeroes: [],
      buildings: [],
      events: [],
    },
  };
}

function createSession(overrides: Partial<MatchSession> = {}): MatchSession {
  return {
    matchId: 'match-01',
    team: 'radiant',
    timelineSourceClientId: 'client-01',
    timelineStatus: 'healthy',
    lastUsableSourceReceivedAt: 1_000,
    sourceObservedPostGame: false,
    ...overrides,
  };
}

describe('match session lifecycle', () => {
  it('waits for a usable match/team pair, then creates a baseline with a sticky source', () => {
    const withoutPair = advanceMatchSession({
      currentSession: null,
      state: createState({ matchId: null, team: null }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(withoutPair).toEqual({
      session: null,
      timelineUpdate: 'none',
      resetPreviousSession: false,
    });

    const firstValidState = createState({ clientId: 'client-02', receivedAt: 1_500, team: 'dire' });
    const created = advanceMatchSession({
      currentSession: null,
      state: firstValidState,
      freshnessMs: FRESHNESS_MS,
    });

    expect(created).toEqual({
      session: {
        matchId: 'match-01',
        team: 'dire',
        timelineSourceClientId: 'client-02',
        timelineStatus: 'rebaselining',
        lastUsableSourceReceivedAt: 1_500,
        sourceObservedPostGame: false,
      },
      timelineUpdate: 'baseline',
      resetPreviousSession: false,
    });
  });

  it('keeps same-session and foreign non-source updates away from the shared timeline', () => {
    const session = createSession();

    const sameSessionDecision = advanceMatchSession({
      currentSession: session,
      state: createState({ clientId: 'client-02', receivedAt: 2_000 }),
      freshnessMs: FRESHNESS_MS,
    });
    const foreignDecision = advanceMatchSession({
      currentSession: session,
      state: createState({ clientId: 'client-03', receivedAt: 2_000, matchId: 'match-02' }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(sameSessionDecision).toEqual({
      session,
      timelineUpdate: 'none',
      resetPreviousSession: false,
    });
    expect(foreignDecision).toEqual({
      session,
      timelineUpdate: 'none',
      resetPreviousSession: false,
    });
  });

  it('allows only the source to roll the session and requests a complete old-session reset', () => {
    const session = createSession();
    const nonSourceDecision = advanceMatchSession({
      currentSession: session,
      state: createState({ clientId: 'client-02', receivedAt: 2_000, matchId: 'match-02', team: 'dire' }),
      freshnessMs: FRESHNESS_MS,
    });
    const sourceDecision = advanceMatchSession({
      currentSession: session,
      state: createState({ clientId: 'client-01', receivedAt: 2_500, matchId: 'match-02', team: 'dire' }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(nonSourceDecision.session).toBe(session);
    expect(sourceDecision).toEqual({
      session: {
        matchId: 'match-02',
        team: 'dire',
        timelineSourceClientId: 'client-01',
        timelineStatus: 'rebaselining',
        lastUsableSourceReceivedAt: 2_500,
        sourceObservedPostGame: false,
      },
      timelineUpdate: 'baseline',
      resetPreviousSession: true,
    });
  });

  it('does not reset or refresh continuity on one incomplete source snapshot', () => {
    const session = createSession();
    const decision = advanceMatchSession({
      currentSession: session,
      state: createState({ clientId: 'client-01', receivedAt: 2_000, hasMatch: false }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(decision).toEqual({
      session,
      timelineUpdate: 'none',
      resetPreviousSession: false,
    });
  });

  it('ends the session only when a missing source match follows an observed post-game state', () => {
    const postGameDecision = advanceMatchSession({
      currentSession: createSession(),
      state: createState({
        clientId: 'client-01',
        receivedAt: 2_000,
        gameState: 'DOTA_GAMERULES_STATE_POST_GAME',
      }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(postGameDecision.session?.sourceObservedPostGame).toBe(true);

    const ended = advanceMatchSession({
      currentSession: createSession({ sourceObservedPostGame: true, lastUsableSourceReceivedAt: 2_000 }),
      state: createState({ clientId: 'client-01', receivedAt: 2_500, hasMatch: false }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(ended).toEqual({
      session: null,
      timelineUpdate: 'none',
      resetPreviousSession: true,
    });
  });
});

describe('sticky source timeline', () => {
  it('becomes healthy on the second consecutive usable source snapshot', () => {
    const session = createSession({ timelineStatus: 'rebaselining' });
    const decision = advanceMatchSession({
      currentSession: session,
      state: createState({ clientId: 'client-01', receivedAt: 2_000 }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(decision).toEqual({
      session: {
        ...session,
        timelineStatus: 'healthy',
        lastUsableSourceReceivedAt: 2_000,
      },
      timelineUpdate: 'delta',
      resetPreviousSession: false,
    });
  });

  it('is fresh below the boundary, stale at it, and rejects a negative age', () => {
    const session = createSession();

    expect(evaluateTimelineStatus({ session, now: 5_999, freshnessMs: FRESHNESS_MS })).toBe('healthy');
    expect(evaluateTimelineStatus({ session, now: 6_000, freshnessMs: FRESHNESS_MS })).toBe('stale');
    expect(() => evaluateTimelineStatus({ session, now: 999, freshnessMs: FRESHNESS_MS })).toThrow(RangeError);
  });

  it('rebaselines the returning source without producing a gap delta', () => {
    const staleSession = createSession({ timelineStatus: 'stale' });
    const decision = advanceMatchSession({
      currentSession: staleSession,
      state: createState({ clientId: 'client-01', receivedAt: 6_000 }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(decision).toEqual({
      session: {
        ...staleSession,
        timelineStatus: 'rebaselining',
        lastUsableSourceReceivedAt: 6_000,
      },
      timelineUpdate: 'baseline',
      resetPreviousSession: false,
    });
  });

  it('restores health only after the next consecutive source snapshot', () => {
    const rebaselinedSession = createSession({
      timelineStatus: 'rebaselining',
      lastUsableSourceReceivedAt: 6_000,
    });
    const decision = advanceMatchSession({
      currentSession: rebaselinedSession,
      state: createState({ clientId: 'client-01', receivedAt: 7_000 }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(decision.timelineUpdate).toBe('delta');
    expect(decision.session?.timelineStatus).toBe('healthy');
  });

  it('marks a stale source on non-source ingest without automatic failover', () => {
    const session = createSession();
    const decision = advanceMatchSession({
      currentSession: session,
      state: createState({ clientId: 'client-02', receivedAt: 6_000 }),
      freshnessMs: FRESHNESS_MS,
    });

    expect(decision).toEqual({
      session: {
        ...session,
        timelineStatus: 'stale',
      },
      timelineUpdate: 'none',
      resetPreviousSession: false,
    });
    expect(decision.session?.timelineSourceClientId).toBe('client-01');
  });
});
