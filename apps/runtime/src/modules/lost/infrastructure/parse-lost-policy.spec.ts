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
