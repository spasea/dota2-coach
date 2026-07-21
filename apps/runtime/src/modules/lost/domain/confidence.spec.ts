import { describe, expect, it } from '@jest/globals';

import { classifyLostConfidence } from './confidence.js';
import { createDecisionSignals, createRankedCandidate, decisionPolicy } from './lost-decision.spec-fixtures.js';

describe('Lost confidence', () => {
  it('keeps exact local low-health RESET high under partial team coverage', () => {
    const signals = createDecisionSignals({
      requesterReadiness: { ...createDecisionSignals().requesterReadiness, health: 'low' },
      unknowns: ['partial_team_coverage'],
    });

    expect(
      classifyLostConfidence({
        candidate: createRankedCandidate('RESET', 70),
        signals,
        policy: decisionPolicy.confidence,
      })
    ).toBe('high');
  });

  it('caps FARM_SAFELY at medium even above the high score floor', () => {
    const signals = createDecisionSignals({
      requesterMapDepth: { zone: 'enemy_base', orientedDepth: 8_000 },
      isolation: { deep: true, isolated: true, missingEnemyCount: 3 },
    });

    expect(
      classifyLostConfidence({
        candidate: createRankedCandidate('FARM_SAFELY', 85),
        signals,
        policy: decisionPolicy.confidence,
      })
    ).toBe('medium');
  });

  it('keeps the conservative FARM_SAFELY base at medium when low mana is the only directional fact', () => {
    const signals = createDecisionSignals({
      requesterReadiness: { ...createDecisionSignals().requesterReadiness, mana: 'low' },
    });

    expect(
      classifyLostConfidence({
        candidate: createRankedCandidate('FARM_SAFELY', 20),
        signals,
        policy: decisionPolicy.confidence,
      })
    ).toBe('medium');
  });

  it('requires direct active pressure and complete feasible-defense evidence for high DEFEND confidence', () => {
    const exactSignals = createDecisionSignals({
      structureRisks: [
        {
          buildingId: 'radiant:tower:3:top',
          structureId: 'radiant:tower:3:top',
          level: 'critical',
          damageActivity: 'active',
          activeDamageEvents: 2,
          recentDamageEvents: 2,
          lastDamageAgeMs: 500,
        },
      ],
      defenses: [
        {
          buildingId: 'radiant:tower:3:top',
          structureId: 'radiant:tower:3:top',
          arrivalClass: 'teleport_available',
          readyDefenders: 3,
          uncertainSupports: 0,
          visibleEnemyLowerBound: 2,
          numericalRisk: 'acceptable',
          response: 'allowed',
        },
      ],
    });
    const uncertainSignals = createDecisionSignals({
      ...exactSignals,
      defenses: exactSignals.defenses.map((defense) => ({ ...defense, uncertainSupports: 1 })),
    });
    const candidate = createRankedCandidate('DEFEND', 95);

    expect(classifyLostConfidence({ candidate, signals: exactSignals, policy: decisionPolicy.confidence })).toBe(
      'high'
    );
    expect(classifyLostConfidence({ candidate, signals: uncertainSignals, policy: decisionPolicy.confidence })).toBe(
      'medium'
    );
  });

  it('requires a connected confirmed cluster for high-confidence REGROUP', () => {
    const commonSignals = {
      requesterMapDepth: { zone: 'enemy_half', orientedDepth: 4_000 } as const,
      isolation: { deep: true, isolated: true, missingEnemyCount: 3 },
    };
    const unconnected = createDecisionSignals({
      ...commonSignals,
      selectedTeamCluster: {
        heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle'],
        connectedHeroNames: [],
        center: { x: 0, y: 0 },
        maxPairDistance: 100,
        visibleEnemyLowerBound: 0,
        destinationRisk: 'not_contradicted',
      },
    });
    const connected = createDecisionSignals({
      ...commonSignals,
      selectedTeamCluster: {
        ...unconnected.selectedTeamCluster!,
        connectedHeroNames: ['npc_dota_hero_axe'],
      },
    });
    const candidate = createRankedCandidate('REGROUP', 80);

    expect(classifyLostConfidence({ candidate, signals: unconnected, policy: decisionPolicy.confidence })).toBe(
      'medium'
    );
    expect(classifyLostConfidence({ candidate, signals: connected, policy: decisionPolicy.confidence })).toBe('high');
  });

  it('does not emit a low-confidence directional result below the medium floor', () => {
    const signals = createDecisionSignals({
      requesterReadiness: { ...createDecisionSignals().requesterReadiness, mana: 'low' },
    });

    expect(
      classifyLostConfidence({
        candidate: createRankedCandidate('RESET', 15),
        signals,
        policy: decisionPolicy.confidence,
      })
    ).toBeNull();
  });
});
