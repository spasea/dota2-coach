import type { LostAction, LostCandidateSafety } from './candidate.js';
import type { LostSignals } from './derive-lost-signals.js';
import type { LostDecisionPolicy } from './lost-policy.js';
import type { ConfidentLostCandidate, LostConfidence, RankedLostCandidate } from './recommendation.js';

export const decisionPolicy: LostDecisionPolicy = deepFreeze({
  scoring: {
    actionBases: {
      RESET: 0,
      DEFEND: 0,
      REGROUP: 0,
      FARM_SAFELY: 20,
    },
    contributions: {
      RESET: {
        requesterLowHealth: 70,
        requesterLowMana: 15,
        requesterDisabled: 45,
      },
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
  confidence: {
    mediumScoreFloor: 20,
    highScoreFloor: 65,
    alternativeScoreGap: 15,
  },
  stability: {
    hysteresisMs: 30_000,
    previousActionBonus: 5,
  },
});

export function createDecisionSignals(overrides: Partial<LostSignals> = {}): LostSignals {
  return deepFreeze({
    requesterMapDepth: { zone: 'own_half', orientedDepth: -2_000 },
    requesterReadiness: {
      alive: true,
      health: 'not_low',
      mana: 'not_low',
      disabled: false,
      teleportReadiness: { status: 'ready' },
      respawnSeconds: 0,
      buybackCost: 1_500,
      buybackCooldown: 0,
    },
    structureRisks: [],
    defenses: [],
    selectedTeamCluster: null,
    isolation: { deep: false, isolated: false, missingEnemyCount: 0 },
    unknowns: [],
    ...overrides,
  });
}

export function createSafetyCandidate(
  action: LostAction,
  overrides: Partial<LostCandidateSafety> = {}
): LostCandidateSafety {
  return deepFreeze({
    action,
    eligible: true,
    blockers: [],
    risks: [],
    unknowns: [],
    guardrails: [],
    ...overrides,
  });
}

export function createRankedCandidate(
  action: LostAction,
  score: number,
  overrides: Partial<RankedLostCandidate> = {}
): RankedLostCandidate {
  return deepFreeze({
    action,
    score,
    reasons: [],
    penalties: [],
    blockers: [],
    unknowns: [],
    guardrails: [],
    ...overrides,
  });
}

export function createConfidentCandidate(
  action: LostAction,
  score: number,
  confidence: LostConfidence = 'medium',
  overrides: Partial<ConfidentLostCandidate> = {}
): ConfidentLostCandidate {
  return deepFreeze({
    ...createRankedCandidate(action, score),
    confidence,
    ...overrides,
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}
