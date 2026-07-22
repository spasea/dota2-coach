import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ConfigurationError } from '../../../platform/config/configuration-error.js';
import type { LostPolicy, LostScoringPolicy } from '../domain/lost-policy.js';

const positiveContribution = z.number().int().positive();
const negativeContribution = z.number().int().negative();

const scoringSchema = z
  .object({
    action_bases: z
      .object({
        RESET: z.number().int().nonnegative(),
        DEFEND: z.number().int().nonnegative(),
        REGROUP: z.number().int().nonnegative(),
        FARM_SAFELY: z.number().int().nonnegative(),
      })
      .strict(),
    contributions: z
      .object({
        RESET: z
          .object({
            requester_low_health: positiveContribution,
            requester_low_mana: positiveContribution,
            requester_disabled: positiveContribution,
          })
          .strict(),
        DEFEND: z
          .object({
            active_structure_damage: positiveContribution,
            recent_structure_damage: positiveContribution,
            repeated_structure_damage: positiveContribution,
            critical_structure: positiveContribution,
            requester_already_near_structure: positiveContribution,
            requester_can_teleport: positiveContribution,
            allied_defenders_already_present: positiveContribution,
            requester_would_arrive_outnumbered: negativeContribution,
            partial_evidence: negativeContribution,
          })
          .strict(),
        REGROUP: z
          .object({
            requester_deep_and_isolated: positiveContribution,
            enemies_missing: positiveContribution,
            confirmed_allied_cluster: positiveContribution,
            partial_evidence: negativeContribution,
          })
          .strict(),
        FARM_SAFELY: z
          .object({
            requester_would_arrive_outnumbered: positiveContribution,
            requester_deep_and_isolated: positiveContribution,
            enemies_missing: positiveContribution,
            enemies_visible_elsewhere: positiveContribution,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

const confidenceSchema = z
  .object({
    medium_score_floor: z.number().int().nonnegative(),
    high_score_floor: z.number().int().positive(),
    alternative_score_gap: z.number().int().nonnegative(),
  })
  .strict()
  .refine((confidence) => confidence.medium_score_floor < confidence.high_score_floor);

const stabilitySchema = z
  .object({
    hysteresis_ms: z.number().int().positive(),
    previous_action_bonus: z.number().int().positive(),
  })
  .strict();

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
    readiness: z
      .object({
        low_health_percent: z.number().finite().gt(0).lt(100),
        low_mana_percent: z.number().finite().gt(0).lt(100),
      })
      .strict(),
    scoring: scoringSchema,
    confidence: confidenceSchema,
    stability: stabilitySchema,
  })
  .strict()
  .refine((policy) => policy.stability.previous_action_bonus < policy.confidence.alternative_score_gap);

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

  return mapLostPolicy(result.data);
}

function mapLostPolicy(document: z.infer<typeof lostPolicyDocumentSchema>): LostPolicy {
  return Object.freeze({
    schemaVersion: document.schema_version,
    mapDepth: Object.freeze({
      centerHalfWidth: document.map_depth.center_half_width,
      baseBoundary: document.map_depth.base_boundary,
    }),
    proximity: Object.freeze({
      structureRadius: document.proximity.structure_radius,
      teamClusterRadius: document.proximity.team_cluster_radius,
      minimumClusterSize: document.proximity.minimum_cluster_size,
    }),
    structureRisk: Object.freeze({
      criticalHealthPercent: document.structure_risk.critical_health_percent,
      pressuredHealthPercent: document.structure_risk.pressured_health_percent,
      repeatedActiveDamageEvents: document.structure_risk.repeated_active_damage_events,
    }),
    readiness: Object.freeze({
      lowHealthPercent: document.readiness.low_health_percent,
      lowManaPercent: document.readiness.low_mana_percent,
    }),
    scoring: mapScoringPolicy(document.scoring),
    confidence: Object.freeze({
      mediumScoreFloor: document.confidence.medium_score_floor,
      highScoreFloor: document.confidence.high_score_floor,
      alternativeScoreGap: document.confidence.alternative_score_gap,
    }),
    stability: Object.freeze({
      hysteresisMs: document.stability.hysteresis_ms,
      previousActionBonus: document.stability.previous_action_bonus,
    }),
  });
}

function mapScoringPolicy(scoring: z.infer<typeof scoringSchema>): LostScoringPolicy {
  return Object.freeze({
    actionBases: Object.freeze({
      RESET: scoring.action_bases.RESET,
      DEFEND: scoring.action_bases.DEFEND,
      REGROUP: scoring.action_bases.REGROUP,
      FARM_SAFELY: scoring.action_bases.FARM_SAFELY,
    }),
    contributions: Object.freeze({
      RESET: Object.freeze({
        requesterLowHealth: scoring.contributions.RESET.requester_low_health,
        requesterLowMana: scoring.contributions.RESET.requester_low_mana,
        requesterDisabled: scoring.contributions.RESET.requester_disabled,
      }),
      DEFEND: Object.freeze({
        activeStructureDamage: scoring.contributions.DEFEND.active_structure_damage,
        recentStructureDamage: scoring.contributions.DEFEND.recent_structure_damage,
        repeatedStructureDamage: scoring.contributions.DEFEND.repeated_structure_damage,
        criticalStructure: scoring.contributions.DEFEND.critical_structure,
        requesterAlreadyNearStructure: scoring.contributions.DEFEND.requester_already_near_structure,
        requesterCanTeleport: scoring.contributions.DEFEND.requester_can_teleport,
        alliedDefendersAlreadyPresent: scoring.contributions.DEFEND.allied_defenders_already_present,
        requesterWouldArriveOutnumbered: scoring.contributions.DEFEND.requester_would_arrive_outnumbered,
        partialEvidence: scoring.contributions.DEFEND.partial_evidence,
      }),
      REGROUP: Object.freeze({
        requesterDeepAndIsolated: scoring.contributions.REGROUP.requester_deep_and_isolated,
        enemiesMissing: scoring.contributions.REGROUP.enemies_missing,
        confirmedAlliedCluster: scoring.contributions.REGROUP.confirmed_allied_cluster,
        partialEvidence: scoring.contributions.REGROUP.partial_evidence,
      }),
      FARM_SAFELY: Object.freeze({
        requesterWouldArriveOutnumbered: scoring.contributions.FARM_SAFELY.requester_would_arrive_outnumbered,
        requesterDeepAndIsolated: scoring.contributions.FARM_SAFELY.requester_deep_and_isolated,
        enemiesMissing: scoring.contributions.FARM_SAFELY.enemies_missing,
        enemiesVisibleElsewhere: scoring.contributions.FARM_SAFELY.enemies_visible_elsewhere,
      }),
    }),
  });
}
