import { describe, expect, it } from '@jest/globals';

import type { MatchSession } from './match-session.js';
import type { NormalizedClientState } from './normalized-client-state.js';
import type { NormalizedHeroObservation, Team } from './normalized-snapshot.js';
import { selectActiveMatchGroup } from './active-match-group.js';

const FRESHNESS_MS = 5_000;

const session: MatchSession = {
  matchId: 'match-01',
  team: 'radiant',
  timelineSourceClientId: 'client-source',
  timelineStatus: 'healthy',
  lastUsableSourceReceivedAt: 1_000,
  sourceObservedPostGame: false,
};

type StateInput = Readonly<{
  clientId: string;
  receivedAt: number;
  matchId?: string;
  team?: Team;
  minimapHeroes?: readonly NormalizedHeroObservation[];
}>;

function createState(input: StateInput): NormalizedClientState {
  return {
    identity: {
      clientId: input.clientId,
      discordUserId: `discord-${input.clientId}`,
      coachAlias: `Coach ${input.clientId}`,
      defaultRole: 2,
    },
    receivedAt: input.receivedAt,
    snapshot: {
      sourceTimestampSeconds: null,
      match: {
        matchId: input.matchId ?? 'match-01',
        gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        gameTime: 120,
        clockTime: 30,
        paused: false,
        radiantScore: 1,
        direScore: 2,
      },
      player: {
        team: input.team ?? 'radiant',
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
      },
      hero: null,
      minimapHeroes: input.minimapHeroes ?? [],
      minimapStructures: [],
      buildings: [],
      events: [],
    },
  };
}

describe('active match group selection', () => {
  it('selects only fresh same-match/same-team clients and derives capped team coverage', () => {
    const source = createState({ clientId: 'client-source', receivedAt: 1_001 });
    const teammate = createState({ clientId: 'client-teammate', receivedAt: 2_000 });
    const staleAtBoundary = createState({ clientId: 'client-stale', receivedAt: 1_000 });
    const foreignMatch = createState({ clientId: 'client-foreign-match', receivedAt: 5_500, matchId: 'match-02' });
    const foreignTeam = createState({ clientId: 'client-foreign-team', receivedAt: 5_500, team: 'dire' });

    const group = selectActiveMatchGroup({
      session,
      latestStates: [foreignTeam, teammate, staleAtBoundary, source, foreignMatch],
      now: 6_000,
      freshnessMs: FRESHNESS_MS,
    });

    expect(group.clients).toEqual([source, teammate]);
    expect(group.coverage).toBe(0.4);
    expect(group.sharedState).toBe(teammate);
  });

  it('uses the lexicographically smaller client id when receive times are equal', () => {
    const clientB = createState({ clientId: 'client-b', receivedAt: 5_000 });
    const clientA = createState({ clientId: 'client-a', receivedAt: 5_000 });

    const group = selectActiveMatchGroup({
      session,
      latestStates: [clientB, clientA],
      now: 5_500,
      freshnessMs: FRESHNESS_MS,
    });

    expect(group.clients).toEqual([clientA, clientB]);
    expect(group.sharedState).toBe(clientA);
  });

  it('caps coverage at one even if more than five matching states are supplied', () => {
    const clients = Array.from({ length: 6 }, (_, index) =>
      createState({ clientId: `client-${String(index + 1).padStart(2, '0')}`, receivedAt: 5_000 + index })
    );

    const group = selectActiveMatchGroup({
      session,
      latestStates: clients,
      now: 6_000,
      freshnessMs: FRESHNESS_MS,
    });

    expect(group.coverage).toBe(1);
  });

  it('uses a fresh teammate for current state while the sticky source is stale', () => {
    const staleSource = createState({ clientId: 'client-source', receivedAt: 1_000 });
    const freshTeammate = createState({ clientId: 'client-teammate', receivedAt: 5_500 });

    const group = selectActiveMatchGroup({
      session,
      latestStates: [staleSource, freshTeammate],
      now: 6_000,
      freshnessMs: FRESHNESS_MS,
    });

    expect(group.clients).toEqual([freshTeammate]);
    expect(group.sharedState).toBe(freshTeammate);
    expect(session.timelineSourceClientId).toBe('client-source');
  });

  it('takes the current minimap from one freshest snapshot without unioning clients', () => {
    const sourceMarker: NormalizedHeroObservation = {
      heroName: 'npc_dota_hero_invoker',
      team: 'radiant',
      position: { x: 100, y: 200 },
      markerKind: 'self',
    };
    const teammateMarkers: readonly NormalizedHeroObservation[] = [
      {
        heroName: 'npc_dota_hero_crystal_maiden',
        team: 'radiant',
        position: { x: 300, y: 400 },
        markerKind: 'standard',
      },
      {
        heroName: 'npc_dota_hero_axe',
        team: 'dire',
        position: { x: 500, y: 600 },
        markerKind: 'enemy',
      },
    ];
    const source = createState({
      clientId: 'client-source',
      receivedAt: 5_000,
      minimapHeroes: [sourceMarker],
    });
    const teammate = createState({
      clientId: 'client-teammate',
      receivedAt: 5_500,
      minimapHeroes: teammateMarkers,
    });

    const group = selectActiveMatchGroup({
      session,
      latestStates: [source, teammate],
      now: 6_000,
      freshnessMs: FRESHNESS_MS,
    });

    expect(group.sharedState).toBe(teammate);
    expect(group.sharedState?.snapshot.minimapHeroes).toEqual(teammateMarkers);
    expect(group.sharedState?.snapshot.minimapHeroes).not.toContainEqual(sourceMarker);
  });

  it('rejects a negative client age instead of clamping fake-clock input', () => {
    const futureState = createState({ clientId: 'client-future', receivedAt: 6_001 });

    expect(() =>
      selectActiveMatchGroup({
        session,
        latestStates: [futureState],
        now: 6_000,
        freshnessMs: FRESHNESS_MS,
      })
    ).toThrow(RangeError);
  });
});
