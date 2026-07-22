import { describe, expect, it } from '@jest/globals';

import { createLostContext } from '../domain/lost-domain.spec-fixtures.js';
import { decisionPolicy } from '../domain/lost-decision.spec-fixtures.js';
import type { LostPolicy } from '../domain/lost-policy.js';
import { createRecommendLostAction, type RecommendLostActionDependencies } from './recommend-lost-action.js';

const policy: LostPolicy = {
  schemaVersion: 1,
  mapDepth: { centerHalfWidth: 1_200, baseBoundary: 7_700 },
  proximity: { structureRadius: 1_600, teamClusterRadius: 1_200, minimumClusterSize: 2 },
  structureRisk: { criticalHealthPercent: 25, pressuredHealthPercent: 60, repeatedActiveDamageEvents: 2 },
  readiness: { lowHealthPercent: 25, lowManaPercent: 20 },
  ...decisionPolicy,
};

describe('Lost Discord delivery contract', () => {
  it('returns the immutable audience and effective role from the scored context', () => {
    const context = createLostContext({ requester: { healthPercent: 18 } });
    const harness = createHarness(context);

    const result = harness.recommend({
      discordUserId: context.requester.identity.discordUserId,
      expectedMatchId: context.matchId,
    });

    expect(result).toMatchObject({
      status: 'recommended',
      delivery: {
        audience: { kind: 'individual', displayName: context.requester.identity.coachAlias },
        effectiveRole: context.effectiveRole,
      },
    });
    expect(result.status === 'recommended' && Object.isFrozen(result.delivery)).toBe(true);
    expect(result.status === 'recommended' && Object.isFrozen(result.delivery.audience)).toBe(true);
  });

  it('fails closed before scoring and advice mutation when the match changed after preflight', () => {
    const context = createLostContext({ requester: { healthPercent: 18 } });
    const harness = createHarness(context);

    expect(
      harness.recommend({
        discordUserId: context.requester.identity.discordUserId,
        expectedMatchId: 'previous-match',
      })
    ).toEqual({ status: 'unavailable', reason: 'match_changed' });
    expect(harness.savedAdvice).toEqual([]);
    expect(harness.recordedDecisions).toEqual([]);
  });
});

function createHarness(context: ReturnType<typeof createLostContext>) {
  const savedAdvice: unknown[] = [];
  const recordedDecisions: unknown[] = [];
  const dependencies: RecommendLostActionDependencies = {
    adviceStore: {
      get: () => null,
      save: (advice) => savedAdvice.push(advice),
    },
    buildCoachContext: () => Object.freeze({ status: 'ready', context }),
    monotonicNow: () => 20_000,
    policy,
    translator: (message) => `[${message.key}]`,
    recordDecision: (decision) => recordedDecisions.push(decision),
  };

  return {
    recommend: createRecommendLostAction(dependencies),
    savedAdvice,
    recordedDecisions,
  };
}
