import { describe, expect, it } from '@jest/globals';

import { createLostContext } from '../domain/lost-domain.spec-fixtures.js';
import { decisionPolicy } from '../domain/lost-decision.spec-fixtures.js';
import type { LostPolicy } from '../domain/lost-policy.js';
import type { LostAdviceMemory } from '../domain/recommendation.js';
import type { LostAdviceStore } from './lost-advice-store.js';
import {
  createRecommendLostAction,
  type LostDecisionMetadata,
  type RecommendLostActionDependencies,
} from './recommend-lost-action.js';

const policy: LostPolicy = {
  schemaVersion: 1,
  mapDepth: { centerHalfWidth: 1_200, baseBoundary: 7_700 },
  proximity: { structureRadius: 1_600, teamClusterRadius: 1_200, minimumClusterSize: 2 },
  structureRisk: { criticalHealthPercent: 25, pressuredHealthPercent: 60, repeatedActiveDamageEvents: 2 },
  readiness: { lowHealthPercent: 25, lowManaPercent: 20 },
  ...decisionPolicy,
};

describe('recommend Lost action use case', () => {
  it.each([
    'client_not_found',
    'snapshot_missing',
    'snapshot_stale',
    'match_unavailable',
    'outside_active_session',
  ] as const)('maps %s context availability without creating advice', (status) => {
    const harness = createHarness({ buildCoachContext: () => ({ status }) });

    expect(harness.recommend({ discordUserId: 'discord-user-01' })).toEqual({ status: 'unavailable', reason: status });
    expect(harness.savedAdvice).toEqual([]);
    expect(harness.decisions).toEqual([]);
  });

  it('returns a requester-scoped high-confidence RESET for exact low health', () => {
    const context = createLostContext({
      requester: { healthPercent: 18 },
      unknowns: ['partial_team_coverage'],
    });
    const harness = createHarness({ buildCoachContext: () => ({ status: 'ready', context }) });

    expect(harness.recommend({ discordUserId: context.requester.identity.discordUserId })).toMatchObject({
      status: 'recommended',
      recommendation: {
        action: 'RESET',
        confidence: 'high',
        coverage: context.coverage,
        primary: { action: 'RESET', score: 70 },
      },
    });
    expect(harness.savedAdvice).toEqual([
      expect.objectContaining({
        clientId: context.requester.identity.clientId,
        matchId: context.matchId,
        action: 'RESET',
      }),
    ]);
  });

  it('maps a non-active game to explicit unavailability', () => {
    const context = createLostContext({ gameState: 'DOTA_GAMERULES_STATE_PRE_GAME' });
    const harness = createHarness({ buildCoachContext: () => ({ status: 'ready', context }) });

    expect(harness.recommend({ discordUserId: context.requester.identity.discordUserId })).toEqual({
      status: 'unavailable',
      reason: 'game_not_in_progress',
    });
    expect(harness.savedAdvice).toEqual([]);
  });

  it('maps dead and paused requesters to rendered HOLD_AND_WAIT without scoring alternatives', () => {
    const dead = createLostContext({ requester: { alive: false } });
    const paused = createLostContext({ paused: true });
    const deadHarness = createHarness({ buildCoachContext: () => ({ status: 'ready', context: dead }) });
    const pausedHarness = createHarness({ buildCoachContext: () => ({ status: 'ready', context: paused }) });

    expect(deadHarness.recommend({ discordUserId: dead.requester.identity.discordUserId })).toMatchObject({
      status: 'recommended',
      recommendation: { action: 'HOLD_AND_WAIT', primary: null, alternative: null },
    });
    expect(pausedHarness.recommend({ discordUserId: paused.requester.identity.discordUserId })).toMatchObject({
      status: 'recommended',
      recommendation: { action: 'HOLD_AND_WAIT', primary: null, alternative: null },
    });
    expect(deadHarness.savedAdvice).toEqual([expect.objectContaining({ action: 'HOLD_AND_WAIT', score: 0 })]);
    expect(deadHarness.decisions).toEqual([
      expect.objectContaining({ action: 'HOLD_AND_WAIT', score: 0, holdReason: 'requester_dead', reasonCodes: [] }),
    ]);
    expect(pausedHarness.decisions).toEqual([
      expect.objectContaining({ action: 'HOLD_AND_WAIT', score: 0, holdReason: 'match_paused', reasonCodes: [] }),
    ]);
  });

  it('emits only bounded decision metadata without Discord identity, raw snapshots, positions, or rendered text', () => {
    const context = createLostContext({ requester: { healthPercent: 18 } });
    const harness = createHarness({ buildCoachContext: () => ({ status: 'ready', context }) });

    harness.recommend({ discordUserId: context.requester.identity.discordUserId });

    expect(harness.decisions).toHaveLength(1);
    expect(harness.decisions[0]).toEqual(
      expect.objectContaining({
        clientId: 'client-01',
        matchId: 'match-01',
        team: 'radiant',
        action: 'RESET',
        confidence: 'high',
        reasonCodes: ['requester_low_health'],
        holdReason: null,
      })
    );
    expect(JSON.stringify(harness.decisions[0])).not.toMatch(
      /discord|coachAlias|snapshot|position|voiceText|textBody|inventory|auth/i
    );
  });
});

type HarnessOverrides = Pick<RecommendLostActionDependencies, 'buildCoachContext'>;

function createHarness(overrides: HarnessOverrides) {
  const savedAdvice: LostAdviceMemory[] = [];
  const decisions: LostDecisionMetadata[] = [];
  const adviceStore: LostAdviceStore = {
    get: () => null,
    save: (memory) => savedAdvice.push(memory),
  };
  const recommend = createRecommendLostAction({
    adviceStore,
    buildCoachContext: overrides.buildCoachContext,
    monotonicNow: () => 20_000,
    policy,
    translator: ({ key }) => `[${key}]`,
    recordDecision: (metadata) => decisions.push(metadata),
  });

  return { recommend, savedAdvice, decisions };
}
