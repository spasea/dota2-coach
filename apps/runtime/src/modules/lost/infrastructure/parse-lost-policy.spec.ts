import { describe, expect, it } from '@jest/globals';

import { ConfigurationError } from '../../../platform/config/configuration-error.js';
import { parseLostPolicy } from './parse-lost-policy.js';

const validPolicyYaml = `
schema_version: 1
map_depth:
  center_half_width: 1200
  base_boundary: 7700
proximity:
  structure_radius: 1600
  team_cluster_radius: 1200
  minimum_cluster_size: 2
structure_risk:
  critical_health_percent: 25
  pressured_health_percent: 60
  repeated_active_damage_events: 2
readiness:
  low_health_percent: 25
  low_mana_percent: 20
`;

const decisionPolicyYaml = `${validPolicyYaml}
scoring:
  action_bases:
    RESET: 0
    DEFEND: 0
    REGROUP: 0
    FARM_SAFELY: 20
  contributions:
    RESET:
      requester_low_health: 70
      requester_low_mana: 15
      requester_disabled: 45
    DEFEND:
      active_structure_damage: 40
      recent_structure_damage: 20
      repeated_structure_damage: 15
      critical_structure: 25
      requester_already_near_structure: 15
      requester_can_teleport: 10
      allied_defenders_already_present: 15
      requester_would_arrive_outnumbered: -55
      partial_evidence: -10
    REGROUP:
      requester_deep_and_isolated: 35
      enemies_missing: 15
      confirmed_allied_cluster: 30
      partial_evidence: -10
    FARM_SAFELY:
      requester_would_arrive_outnumbered: 35
      requester_deep_and_isolated: 25
      enemies_missing: 20
      enemies_visible_elsewhere: 25
confidence:
  medium_score_floor: 20
  high_score_floor: 65
  alternative_score_gap: 15
stability:
  hysteresis_ms: 30000
  previous_action_bonus: 5
`;

describe('Lost policy parsing', () => {
  it('parses the complete signal-policy schema into a deeply immutable domain policy', () => {
    const policy = parseLostPolicy(validPolicyYaml);

    expect(policy).toEqual({
      schemaVersion: 1,
      mapDepth: {
        centerHalfWidth: 1_200,
        baseBoundary: 7_700,
      },
      proximity: {
        structureRadius: 1_600,
        teamClusterRadius: 1_200,
        minimumClusterSize: 2,
      },
      structureRisk: {
        criticalHealthPercent: 25,
        pressuredHealthPercent: 60,
        repeatedActiveDamageEvents: 2,
      },
      readiness: {
        lowHealthPercent: 25,
        lowManaPercent: 20,
      },
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.mapDepth)).toBe(true);
    expect(Object.isFrozen(policy.proximity)).toBe(true);
    expect(Object.isFrozen(policy.structureRisk)).toBe(true);
    expect(Object.isFrozen(Reflect.get(policy, 'readiness'))).toBe(true);
  });

  it.each([
    ['YAML syntax', 'schema_version: [', 'syntax'],
    ['semantic validation', 'schema_version: 2', 'validation'],
  ] as const)('reports %s failures without exposing policy content', (_caseName, yaml, stage) => {
    let error: unknown;

    try {
      parseLostPolicy(yaml);
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ source: 'lost_policy', stage });
    expect(String(error)).not.toContain(yaml);
  });

  it.each([
    ['unknown key', `${validPolicyYaml}\nsecret_token: forbidden`],
    ['inverted depth dimensions', validPolicyYaml.replace('base_boundary: 7700', 'base_boundary: 1000')],
    ['non-positive radius', validPolicyYaml.replace('structure_radius: 1600', 'structure_radius: 0')],
    ['cluster size below two', validPolicyYaml.replace('minimum_cluster_size: 2', 'minimum_cluster_size: 1')],
    [
      'unordered health percentages',
      validPolicyYaml.replace('pressured_health_percent: 60', 'pressured_health_percent: 20'),
    ],
    [
      'non-integer repeated damage count',
      validPolicyYaml.replace('repeated_active_damage_events: 2', 'repeated_active_damage_events: 1.5'),
    ],
  ])('rejects %s without exposing policy content', (_caseName, yaml) => {
    let error: unknown;

    try {
      parseLostPolicy(yaml);
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ source: 'lost_policy', stage: 'validation' });
    expect(String(error)).not.toContain(yaml);
  });

  it.each([
    ['missing readiness section', validPolicyYaml.replace(/readiness:[\s\S]*$/, '')],
    ['zero health threshold', validPolicyYaml.replace('low_health_percent: 25', 'low_health_percent: 0')],
    ['100% health threshold', validPolicyYaml.replace('low_health_percent: 25', 'low_health_percent: 100')],
    ['zero mana threshold', validPolicyYaml.replace('low_mana_percent: 20', 'low_mana_percent: 0')],
    ['100% mana threshold', validPolicyYaml.replace('low_mana_percent: 20', 'low_mana_percent: 100')],
    ['unknown readiness key', `${validPolicyYaml}  secret_weight: 1\n`],
  ])('rejects %s for the signal-policy contract', (_caseName, yaml) => {
    expect(() => parseLostPolicy(yaml)).toThrow(
      expect.objectContaining({ source: 'lost_policy', stage: 'validation' })
    );
  });
});

describe('Lost decision-policy extension', () => {
  it('parses the exact scoring, confidence, and stability contract as deeply immutable values', () => {
    const policy = parseLostPolicy(decisionPolicyYaml);

    expect(policy).toMatchObject({
      scoring: {
        actionBases: { RESET: 0, DEFEND: 0, REGROUP: 0, FARM_SAFELY: 20 },
        contributions: {
          RESET: { requesterLowHealth: 70, requesterLowMana: 15, requesterDisabled: 45 },
          DEFEND: {
            activeStructureDamage: 40,
            recentStructureDamage: 20,
            repeatedStructureDamage: 15,
            criticalStructure: 25,
            requesterAlreadyNearStructure: 15,
            requesterCanTeleport: 10,
            alliedDefendersAlreadyPresent: 15,
            requesterWouldArriveOutnumbered: -55,
            partialEvidence: -10,
          },
          REGROUP: {
            requesterDeepAndIsolated: 35,
            enemiesMissing: 15,
            confirmedAlliedCluster: 30,
            partialEvidence: -10,
          },
          FARM_SAFELY: {
            requesterWouldArriveOutnumbered: 35,
            requesterDeepAndIsolated: 25,
            enemiesMissing: 20,
            enemiesVisibleElsewhere: 25,
          },
        },
      },
      confidence: { mediumScoreFloor: 20, highScoreFloor: 65, alternativeScoreGap: 15 },
      stability: { hysteresisMs: 30_000, previousActionBonus: 5 },
    });
    expect(Object.isFrozen(Reflect.get(policy, 'scoring'))).toBe(true);
    expect(Object.isFrozen(Reflect.get(Reflect.get(policy, 'scoring'), 'contributions'))).toBe(true);
    expect(Object.isFrozen(Reflect.get(policy, 'confidence'))).toBe(true);
    expect(Object.isFrozen(Reflect.get(policy, 'stability'))).toBe(true);
  });

  it.each([
    ['missing scoring', decisionPolicyYaml.replace(/scoring:[\s\S]*?confidence:/, 'confidence:')],
    ['unknown action', decisionPolicyYaml.replace('FARM_SAFELY: 20', 'ESCAPE: 20')],
    ['unknown reason', decisionPolicyYaml.replace('requester_low_health: 70', 'fabricated_reason: 70')],
    ['zero contribution', decisionPolicyYaml.replace('requester_low_health: 70', 'requester_low_health: 0')],
    [
      'wrong contribution sign',
      decisionPolicyYaml.replace('requester_would_arrive_outnumbered: -55', 'requester_would_arrive_outnumbered: 55'),
    ],
    ['unordered confidence floors', decisionPolicyYaml.replace('high_score_floor: 65', 'high_score_floor: 20')],
    ['negative alternative gap', decisionPolicyYaml.replace('alternative_score_gap: 15', 'alternative_score_gap: -1')],
    ['non-positive hysteresis', decisionPolicyYaml.replace('hysteresis_ms: 30000', 'hysteresis_ms: 0')],
    ['bonus not smaller than gap', decisionPolicyYaml.replace('previous_action_bonus: 5', 'previous_action_bonus: 15')],
  ])('rejects %s', (_caseName, yaml) => {
    expect(() => parseLostPolicy(yaml)).toThrow(
      expect.objectContaining({ source: 'lost_policy', stage: 'validation' })
    );
  });
});
