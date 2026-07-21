import { describe, expect, it } from '@jest/globals';

import type { ActiveMatchState } from '../domain/match-memory.js';
import { createActiveMatchState } from '../domain/match-memory.js';
import { createMatchSession, createNormalizedClientState } from '../domain/match-memory.spec-fixtures.js';
import type { NormalizedClientState } from '../domain/normalized-client-state.js';
import type { ActiveMatchStore } from './active-match-store.js';
import { createBuildCoachContext } from './build-coach-context.js';
import type { ClientDirectory } from './client-directory.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';

type BuilderInput = Readonly<{
  activeState?: ActiveMatchState | null;
  configured?: boolean;
  latestStates?: readonly NormalizedClientState[];
  now?: number;
}>;

function createBuilder(input: BuilderInput = {}) {
  const identity = createNormalizedClientState().identity;
  const latestStates = input.latestStates ?? [];
  const clientDirectory: ClientDirectory = {
    resolveDiscordUserId: () => (input.configured === false ? null : identity),
  };
  const latestStateStore: NormalizedLatestStateStore = {
    getAll: () => latestStates,
    getLatest: (clientId) => latestStates.find((state) => state.identity.clientId === clientId) ?? null,
    save: () => undefined,
  };
  const activeMatchStore: ActiveMatchStore = {
    getActive: () => (input.activeState === undefined ? null : input.activeState),
    replaceActive: () => undefined,
  };

  return createBuildCoachContext({
    activeMatchStore,
    buildingWindows: { activeDamageMs: 6_000, recentDamageMs: 15_000, pressureMs: 30_000 },
    clientDirectory,
    freshnessMs: 5_000,
    latestStateStore,
    monotonicNow: () => input.now ?? 6_000,
  });
}

describe('build coach context availability', () => {
  it('returns client_not_found for an unknown Discord identity', () => {
    const buildContext = createBuilder({ configured: false });

    expect(buildContext({ discordUserId: 'unknown' })).toEqual({ status: 'client_not_found' });
  });

  it('distinguishes a configured client without a snapshot', () => {
    const buildContext = createBuilder();

    expect(buildContext({ discordUserId: 'discord-client-01' })).toEqual({ status: 'snapshot_missing' });
  });

  it('rejects the requester at the exact freshness boundary', () => {
    const requester = createNormalizedClientState({ receivedAt: 1_000 });
    const buildContext = createBuilder({ latestStates: [requester], now: 6_000 });

    expect(buildContext({ discordUserId: requester.identity.discordUserId })).toEqual({ status: 'snapshot_stale' });
  });

  it('distinguishes no active match from requester membership failure', () => {
    const requester = createNormalizedClientState({ receivedAt: 5_500 });
    const withoutMatch = createBuilder({ latestStates: [requester], now: 6_000 });

    expect(withoutMatch({ discordUserId: requester.identity.discordUserId })).toEqual({ status: 'match_unavailable' });

    const activeState = createActiveMatchState(createMatchSession());
    const foreignRequester = createNormalizedClientState({ receivedAt: 5_500, matchId: 'match-02' });
    const outsideSession = createBuilder({ activeState, latestStates: [foreignRequester], now: 6_000 });

    expect(outsideSession({ discordUserId: foreignRequester.identity.discordUserId })).toEqual({
      status: 'outside_active_session',
    });
  });
});

describe('ready coach context', () => {
  it('returns a full immutable context with feature availability and deterministic unknowns', () => {
    const requester = createNormalizedClientState({ clientId: 'client-01', receivedAt: 5_000 });
    const teammate = createNormalizedClientState({ clientId: 'client-02', receivedAt: 5_500 });
    const session = createMatchSession({ lastUsableSourceReceivedAt: 5_000 });
    const emptyState = createActiveMatchState(session);
    const activeState: ActiveMatchState = {
      ...emptyState,
      memory: {
        ...emptyState.memory,
        heroes: {
          alliedRoster: ['npc_dota_hero_invoker'],
          enemyRoster: ['npc_dota_hero_axe'],
          enemies: [],
          ambiguousEnemyHeroNames: ['npc_dota_hero_axe'],
        },
      },
      roleOverrides: [{ clientId: 'client-01', role: 4 }],
    };
    const buildContext = createBuilder({
      activeState,
      latestStates: [teammate, requester],
      now: 6_000,
    });

    const result = buildContext({ discordUserId: requester.identity.discordUserId });

    expect(result).toEqual({
      status: 'ready',
      context: {
        requester,
        effectiveRole: 4,
        teammates: [teammate],
        coverage: 0.4,
        matchId: 'match-01',
        team: 'radiant',
        sharedSnapshot: teammate.snapshot,
        alliedRoster: ['npc_dota_hero_invoker'],
        enemyRoster: ['npc_dota_hero_axe'],
        temporalFeatures: {
          timelineStatus: 'healthy',
          mapTransitions: [],
          enemyHeroes: [],
          requesterHistory: {
            status: 'unavailable',
            reason: 'requester_history_unavailable',
          },
          playerHistories: [],
          buildingPressure: {
            status: 'unavailable',
            reason: 'building_history_unavailable',
          },
          events: [],
        },
        unknowns: [
          'partial_team_coverage',
          'requester_history_unavailable',
          'building_history_unavailable',
          'enemy_observation_ambiguous',
        ],
      },
    });

    if (result.status !== 'ready') {
      return;
    }

    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Object.isFrozen(result.context.teammates)).toBe(true);
    expect(Object.isFrozen(result.context.unknowns)).toBe(true);
  });

  it('keeps stale timeline facts explicit without suppressing fresh current context', () => {
    const requester = createNormalizedClientState({ receivedAt: 5_500 });
    const emptyState = createActiveMatchState(createMatchSession({ lastUsableSourceReceivedAt: 1_000 }));
    const activeState: ActiveMatchState = {
      ...emptyState,
      memory: {
        ...emptyState.memory,
        heroes: {
          ...emptyState.memory.heroes,
          enemyRoster: ['npc_dota_hero_axe'],
          enemies: [
            {
              heroName: 'npc_dota_hero_axe',
              firstSeenAt: 1_000,
              lastSeenAt: 1_000,
              lastKnownPosition: { x: 500, y: 600 },
              sourceVisible: true,
            },
          ],
        },
      },
    };
    const buildContext = createBuilder({ activeState, latestStates: [requester], now: 6_000 });

    const result = buildContext({ discordUserId: requester.identity.discordUserId });

    expect(result).toMatchObject({
      status: 'ready',
      context: {
        sharedSnapshot: requester.snapshot,
        temporalFeatures: {
          timelineStatus: 'stale',
          enemyHeroes: [
            {
              heroName: 'npc_dota_hero_axe',
              currentlyVisible: null,
              lastKnownPosition: { x: 500, y: 600 },
              lastSeenAgeMs: null,
            },
          ],
          buildingPressure: { status: 'unavailable', reason: 'timeline_stale' },
        },
        unknowns: ['partial_team_coverage', 'timeline_stale', 'requester_history_unavailable'],
      },
    });
  });
});
