import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ConfigurationError } from '../../../platform/config/configuration-error.js';
import type { LostPolicy } from '../domain/lost-policy.js';

const lostPolicyDocumentSchema = z
  .object({
    schema_version: z.literal(1),
    map_depth: z
      .object({
        center_half_width: z.number().finite().positive(),
        base_boundary: z.number().finite().positive(),
      })
      .strict()
      .refine((mapDepth) => mapDepth.center_half_width < mapDepth.base_boundary),
    proximity: z
      .object({
        structure_radius: z.number().finite().positive(),
        team_cluster_radius: z.number().finite().positive(),
        minimum_cluster_size: z.number().int().min(2),
      })
      .strict(),
    structure_risk: z
      .object({
        critical_health_percent: z.number().finite().min(0).max(100),
        pressured_health_percent: z.number().finite().min(0).max(100),
        repeated_active_damage_events: z.number().int().positive(),
      })
      .strict()
      .refine((structureRisk) => structureRisk.critical_health_percent < structureRisk.pressured_health_percent),
  })
  .strict();

export function parseLostPolicy(yaml: string): LostPolicy {
  let document: unknown;

  try {
    document = parseYaml(yaml);
  } catch {
    throw new ConfigurationError({ source: 'lost_policy', stage: 'syntax' });
  }

  const result = lostPolicyDocumentSchema.safeParse(document);

  if (!result.success) {
    throw new ConfigurationError({ source: 'lost_policy', stage: 'validation' });
  }

  return Object.freeze({
    schemaVersion: result.data.schema_version,
    mapDepth: Object.freeze({
      centerHalfWidth: result.data.map_depth.center_half_width,
      baseBoundary: result.data.map_depth.base_boundary,
    }),
    proximity: Object.freeze({
      structureRadius: result.data.proximity.structure_radius,
      teamClusterRadius: result.data.proximity.team_cluster_radius,
      minimumClusterSize: result.data.proximity.minimum_cluster_size,
    }),
    structureRisk: Object.freeze({
      criticalHealthPercent: result.data.structure_risk.critical_health_percent,
      pressuredHealthPercent: result.data.structure_risk.pressured_health_percent,
      repeatedActiveDamageEvents: result.data.structure_risk.repeated_active_damage_events,
    }),
  });
}
