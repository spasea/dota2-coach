import { describe, expect, it } from '@jest/globals';

import { createDecisionSignals, createSafetyCandidate, decisionPolicy } from './lost-decision.spec-fixtures.js';
import { scoreLostCandidates } from './scoring.js';

describe('Lost candidate scoring', () => {
  it('uses the conservative FARM_SAFELY base without turning low mana into RESET', () => {
    const signals = createDecisionSignals({
      requesterReadiness: {
        ...createDecisionSignals().requesterReadiness,
        mana: 'low',
      },
    });

    const scored = scoreLostCandidates({
      candidates: directionalCandidates(),
      signals,
      policy: decisionPolicy.scoring,
    });

    expect(scored.map(({ action, score }) => ({ action, score }))).toEqual([
      { action: 'RESET', score: 15 },
      { action: 'DEFEND', score: 0 },
      { action: 'REGROUP', score: 0 },
      { action: 'FARM_SAFELY', score: 20 },
    ]);
  });

  it('scores exact local low health independently of partial team coverage', () => {
    const signals = createDecisionSignals({
      requesterReadiness: {
        ...createDecisionSignals().requesterReadiness,
        health: 'low',
      },
      unknowns: ['partial_team_coverage'],
    });

    expect(scoreOf('RESET', signals)).toMatchObject({
      score: 70,
      reasons: [{ code: 'requester_low_health', value: true, contribution: 70 }],
      penalties: [],
    });
  });

  it('keeps recent structure damage distinct from active damage', () => {
    const signals = createDecisionSignals({
      structureRisks: [
        {
          buildingId: 'radiant:tower:2:top',
          structureId: 'radiant:tower:2:top',
          level: 'pressured',
          damageActivity: 'recent',
          activeDamageEvents: 0,
          recentDamageEvents: 1,
          lastDamageAgeMs: 8_000,
        },
      ],
      defenses: [
        {
          buildingId: 'radiant:tower:2:top',
          structureId: 'radiant:tower:2:top',
          arrivalClass: 'teleport_available',
          readyDefenders: 1,
          uncertainSupports: 0,
          visibleEnemyLowerBound: 1,
          numericalRisk: 'acceptable',
          response: 'allowed',
        },
      ],
    });

    expect(scoreOf('DEFEND', signals)).toMatchObject({
      score: 30,
      reasons: [
        { code: 'recent_structure_damage', contribution: 20 },
        { code: 'requester_can_teleport', contribution: 10 },
      ],
    });
  });

  it('scores conservative cross-map farming when an outer defense is blocked', () => {
    const signals = createDecisionSignals({
      requesterMapDepth: { zone: 'enemy_half', orientedDepth: 4_000 },
      structureRisks: [
        {
          buildingId: 'radiant:tower:2:top',
          structureId: 'radiant:tower:2:top',
          level: 'critical',
          damageActivity: 'active',
          activeDamageEvents: 3,
          recentDamageEvents: 3,
          lastDamageAgeMs: 500,
        },
      ],
      defenses: [
        {
          buildingId: 'radiant:tower:2:top',
          structureId: 'radiant:tower:2:top',
          arrivalClass: 'teleport_available',
          readyDefenders: 1,
          uncertainSupports: 0,
          visibleEnemyLowerBound: 3,
          numericalRisk: 'outnumbered',
          response: 'blocked',
        },
      ],
    });

    expect(scoreOf('FARM_SAFELY', signals)).toMatchObject({
      score: 80,
      reasons: [
        { code: 'requester_would_arrive_outnumbered', contribution: 35 },
        { code: 'enemies_visible_elsewhere', contribution: 25 },
      ],
    });
  });

  it('filters blockers before scoring and returns deeply immutable ordered breakdowns', () => {
    const blockedDefend = createSafetyCandidate('DEFEND', {
      eligible: false,
      blockers: ['isolated_outnumbered_outer_defense'],
    });
    const scored = scoreLostCandidates({
      candidates: [blockedDefend, createSafetyCandidate('FARM_SAFELY')],
      signals: createDecisionSignals(),
      policy: decisionPolicy.scoring,
    });

    expect(scored.map((candidate) => candidate.action)).toEqual(['FARM_SAFELY']);
    expectDeepFrozen(scored);
  });
});

function directionalCandidates() {
  return [
    createSafetyCandidate('RESET'),
    createSafetyCandidate('DEFEND'),
    createSafetyCandidate('REGROUP'),
    createSafetyCandidate('FARM_SAFELY'),
  ];
}

function scoreOf(
  action: 'RESET' | 'DEFEND' | 'REGROUP' | 'FARM_SAFELY',
  signals: ReturnType<typeof createDecisionSignals>
) {
  const scored = scoreLostCandidates({ candidates: directionalCandidates(), signals, policy: decisionPolicy.scoring });
  const candidate = scored.find((entry) => entry.action === action);

  expect(candidate).toBeDefined();
  return expect(candidate);
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    return;
  }

  expect(Object.isFrozen(value)).toBe(true);

  for (const nested of Object.values(value)) {
    expectDeepFrozen(nested);
  }
}
