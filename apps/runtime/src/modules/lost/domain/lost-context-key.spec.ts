import { describe, expect, it } from '@jest/globals';

import { createDecisionSignals } from './lost-decision.spec-fixtures.js';
import { deriveLostContextKey } from './lost-context-key.js';

describe('Lost categorical context key', () => {
  it('ignores exact coordinates, oriented depth, and damage age inside unchanged categories', () => {
    const baseline = pressuredSignals();
    const numericallyChanged = createDecisionSignals({
      ...baseline,
      requesterMapDepth: { ...baseline.requesterMapDepth, orientedDepth: 5_500 },
      structureRisks: baseline.structureRisks.map((risk) => ({ ...risk, lastDamageAgeMs: 2_000 })),
      selectedTeamCluster: {
        ...baseline.selectedTeamCluster!,
        center: { x: 500, y: 750 },
        maxPairDistance: 300,
      },
    });

    expect(deriveLostContextKey(numericallyChanged)).toBe(deriveLostContextKey(baseline));
  });

  it.each([
    [
      'readiness collapse',
      createDecisionSignals({
        ...pressuredSignals(),
        requesterReadiness: { ...pressuredSignals().requesterReadiness, health: 'low' },
      }),
    ],
    [
      'unsafe defense',
      createDecisionSignals({
        ...pressuredSignals(),
        defenses: pressuredSignals().defenses.map((defense) => ({
          ...defense,
          numericalRisk: 'outnumbered' as const,
          response: 'blocked' as const,
        })),
      }),
    ],
    [
      'visibility change',
      createDecisionSignals({
        ...pressuredSignals(),
        isolation: { ...pressuredSignals().isolation, missingEnemyCount: 2 },
      }),
    ],
    [
      'cluster identity change',
      createDecisionSignals({
        ...pressuredSignals(),
        selectedTeamCluster: {
          ...pressuredSignals().selectedTeamCluster!,
          heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_oracle'],
        },
      }),
    ],
  ])('changes for a material %s', (_caseName, changed) => {
    expect(deriveLostContextKey(changed)).not.toBe(deriveLostContextKey(pressuredSignals()));
  });

  it('contains no coordinates or exact health values', () => {
    const key = deriveLostContextKey(pressuredSignals());

    expect(key).not.toContain('4859');
    expect(key).not.toContain('-6379');
    expect(key).not.toContain('500');
  });

  it('is independent of structure and defense collection order', () => {
    const baseline = pressuredSignals();
    const additional = createDecisionSignals({
      ...baseline,
      structureRisks: [
        ...baseline.structureRisks,
        {
          buildingId: 'radiant:tower:3:mid',
          structureId: 'radiant:tower:3:mid',
          level: 'pressured',
          damageActivity: 'recent',
          activeDamageEvents: 0,
          recentDamageEvents: 1,
          lastDamageAgeMs: 8_000,
        },
      ],
      defenses: [
        ...baseline.defenses,
        {
          buildingId: 'radiant:tower:3:mid',
          structureId: 'radiant:tower:3:mid',
          arrivalClass: 'already_near',
          readyDefenders: 2,
          uncertainSupports: 0,
          visibleEnemyLowerBound: 1,
          numericalRisk: 'acceptable',
          response: 'allowed',
        },
      ],
    });
    const reversed = createDecisionSignals({
      ...additional,
      structureRisks: [...additional.structureRisks].reverse(),
      defenses: [...additional.defenses].reverse(),
    });

    expect(deriveLostContextKey(reversed)).toBe(deriveLostContextKey(additional));
  });
});

function pressuredSignals() {
  return createDecisionSignals({
    requesterMapDepth: { zone: 'enemy_half', orientedDepth: 5_000 },
    structureRisks: [
      {
        buildingId: 'radiant:tower:2:top',
        structureId: 'radiant:tower:2:top',
        level: 'critical',
        damageActivity: 'active',
        activeDamageEvents: 2,
        recentDamageEvents: 2,
        lastDamageAgeMs: 500,
      },
    ],
    defenses: [
      {
        buildingId: 'radiant:tower:2:top',
        structureId: 'radiant:tower:2:top',
        arrivalClass: 'teleport_available',
        readyDefenders: 2,
        uncertainSupports: 0,
        visibleEnemyLowerBound: 1,
        numericalRisk: 'acceptable',
        response: 'allowed',
      },
    ],
    selectedTeamCluster: {
      heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle'],
      connectedHeroNames: ['npc_dota_hero_axe'],
      center: { x: 100, y: 200 },
      maxPairDistance: 100,
      visibleEnemyLowerBound: 0,
      destinationRisk: 'not_contradicted',
    },
    isolation: { deep: true, isolated: true, missingEnemyCount: 1 },
  });
}
