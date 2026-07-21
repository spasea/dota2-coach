export type LostMapDepthPolicy = Readonly<{
  centerHalfWidth: number;
  baseBoundary: number;
}>;

export type LostProximityPolicy = Readonly<{
  structureRadius: number;
  teamClusterRadius: number;
  minimumClusterSize: number;
}>;

export type LostStructureRiskPolicy = Readonly<{
  criticalHealthPercent: number;
  pressuredHealthPercent: number;
  repeatedActiveDamageEvents: number;
}>;

export type LostReadinessPolicy = Readonly<{
  lowHealthPercent: number;
  lowManaPercent: number;
}>;

export type LostScoringPolicy = Readonly<{
  actionBases: Readonly<{
    RESET: number;
    DEFEND: number;
    REGROUP: number;
    FARM_SAFELY: number;
  }>;
  contributions: Readonly<{
    RESET: Readonly<{
      requesterLowHealth: number;
      requesterLowMana: number;
      requesterDisabled: number;
    }>;
    DEFEND: Readonly<{
      activeStructureDamage: number;
      recentStructureDamage: number;
      repeatedStructureDamage: number;
      criticalStructure: number;
      requesterAlreadyNearStructure: number;
      requesterCanTeleport: number;
      alliedDefendersAlreadyPresent: number;
      requesterWouldArriveOutnumbered: number;
      partialEvidence: number;
    }>;
    REGROUP: Readonly<{
      requesterDeepAndIsolated: number;
      enemiesMissing: number;
      confirmedAlliedCluster: number;
      partialEvidence: number;
    }>;
    FARM_SAFELY: Readonly<{
      requesterWouldArriveOutnumbered: number;
      requesterDeepAndIsolated: number;
      enemiesMissing: number;
      enemiesVisibleElsewhere: number;
    }>;
  }>;
}>;

export type LostConfidencePolicy = Readonly<{
  mediumScoreFloor: number;
  highScoreFloor: number;
  alternativeScoreGap: number;
}>;

export type LostStabilityPolicy = Readonly<{
  hysteresisMs: number;
  previousActionBonus: number;
}>;

export type LostDecisionPolicy = Readonly<{
  scoring: LostScoringPolicy;
  confidence: LostConfidencePolicy;
  stability: LostStabilityPolicy;
}>;

export type LostPolicy = Readonly<{
  schemaVersion: 1;
  mapDepth: LostMapDepthPolicy;
  proximity: LostProximityPolicy;
  structureRisk: LostStructureRiskPolicy;
  readiness: LostReadinessPolicy;
}>;
