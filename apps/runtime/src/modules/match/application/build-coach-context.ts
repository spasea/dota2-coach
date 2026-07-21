import { readBuildingPressure, type BuildingWindowPolicy } from '../domain/building-memory.js';
import type {
  BuildCoachContextResult,
  EnemyTemporalFeature,
  MatchContextUnknown,
  TemporalEventFeature,
} from '../domain/context.js';
import { selectActiveMatchGroup } from '../domain/active-match-group.js';
import { evaluateTimelineStatus } from '../domain/match-session.js';
import { createActiveRequesterResolver, type ActiveRequesterDependencies } from './resolve-active-requester.js';

export type BuildCoachContextQuery = Readonly<{
  discordUserId: string;
}>;

export type BuildCoachContext = (query: BuildCoachContextQuery) => BuildCoachContextResult;

type BuildCoachContextDependencies = ActiveRequesterDependencies &
  Readonly<{
    buildingWindows: BuildingWindowPolicy;
  }>;

export function createBuildCoachContext(dependencies: BuildCoachContextDependencies): BuildCoachContext {
  const resolveActiveRequester = createActiveRequesterResolver(dependencies);

  return (query) => {
    const requesterResult = resolveActiveRequester(query.discordUserId);

    if (requesterResult.status !== 'ready') {
      return requesterResult;
    }

    const { requester, activeState, now } = requesterResult;

    const timelineStatus = evaluateTimelineStatus({
      session: activeState.session,
      now,
      freshnessMs: dependencies.freshnessMs,
    });
    const group = selectActiveMatchGroup({
      session: activeState.session,
      latestStates: dependencies.latestStateStore.getAll(),
      now,
      freshnessMs: dependencies.freshnessMs,
    });

    if (group.sharedState === null) {
      return Object.freeze({ status: 'outside_active_session' });
    }

    const requesterHistory = activeState.memory.playerHistories.find(
      (history) => history.clientId === requester.identity.clientId
    );
    const hasRequesterHistory = requesterHistory !== undefined && requesterHistory.samples.length >= 2;
    const requesterHistoryFeature =
      requesterHistory === undefined || requesterHistory.samples.length < 2
        ? Object.freeze({ status: 'unavailable' as const, reason: 'requester_history_unavailable' as const })
        : Object.freeze({ status: 'available' as const, value: requesterHistory });
    const buildingPressure = readBuildingPressure({
      memory: activeState.memory.buildings,
      now,
      gameState: group.sharedState.snapshot.match?.gameState ?? null,
      timelineStatus,
      windows: dependencies.buildingWindows,
    });
    const enemyHeroes = Object.freeze(
      activeState.memory.heroes.enemies.map<EnemyTemporalFeature>((enemy) => {
        if (timelineStatus !== 'healthy') {
          return Object.freeze({
            heroName: enemy.heroName,
            currentlyVisible: null,
            lastKnownPosition: enemy.lastKnownPosition,
            lastSeenAgeMs: null,
          });
        }

        const lastSeenAgeMs = now - enemy.lastSeenAt;

        if (!Number.isFinite(lastSeenAgeMs) || lastSeenAgeMs < 0) {
          throw new RangeError('Enemy observation age must be a non-negative finite number.');
        }

        return Object.freeze({
          heroName: enemy.heroName,
          currentlyVisible: enemy.sourceVisible,
          lastKnownPosition: enemy.lastKnownPosition,
          lastSeenAgeMs,
        });
      })
    );
    const events = Object.freeze(
      activeState.memory.events.map<TemporalEventFeature>((entry) =>
        Object.freeze({ event: entry.event, firstReceivedAt: entry.firstReceivedAt })
      )
    );
    const unknowns: MatchContextUnknown[] = [];

    if (group.coverage < 1) {
      unknowns.push('partial_team_coverage');
    }
    if (timelineStatus === 'stale') {
      unknowns.push('timeline_stale');
    }
    if (timelineStatus === 'rebaselining') {
      unknowns.push('timeline_rebaselining');
    }
    if (!hasRequesterHistory) {
      unknowns.push('requester_history_unavailable');
    }
    if (buildingPressure.status === 'unavailable' && buildingPressure.reason === 'building_history_unavailable') {
      unknowns.push('building_history_unavailable');
    }
    if (activeState.memory.heroes.ambiguousEnemyHeroNames.length > 0) {
      unknowns.push('enemy_observation_ambiguous');
    }

    const override = activeState.roleOverrides.find((entry) => entry.clientId === requester.identity.clientId);
    const teammates = Object.freeze(
      group.clients.filter((state) => state.identity.clientId !== requester.identity.clientId)
    );
    const context = Object.freeze({
      requester,
      effectiveRole: override?.role ?? requester.identity.defaultRole,
      teammates,
      coverage: group.coverage,
      matchId: activeState.session.matchId,
      team: activeState.session.team,
      sharedSnapshot: group.sharedState.snapshot,
      alliedRoster: activeState.memory.heroes.alliedRoster,
      enemyRoster: activeState.memory.heroes.enemyRoster,
      temporalFeatures: Object.freeze({
        timelineStatus,
        mapTransitions: activeState.memory.map.transitions,
        enemyHeroes,
        requesterHistory: requesterHistoryFeature,
        playerHistories: activeState.memory.playerHistories,
        buildingPressure,
        events,
      }),
      unknowns: Object.freeze(unknowns),
    });

    return Object.freeze({ status: 'ready', context });
  };
}
