import type { LostConfidencePolicy } from './lost-policy.js';
import type { LostSignals } from './derive-lost-signals.js';
import type { LostConfidence, RankedLostCandidate } from './recommendation.js';

export type ClassifyLostConfidenceInput = Readonly<{
  candidate: RankedLostCandidate;
  signals: LostSignals;
  policy: LostConfidencePolicy;
}>;

export function classifyLostConfidence(input: ClassifyLostConfidenceInput): LostConfidence | null {
  if (input.candidate.score < input.policy.mediumScoreFloor) {
    return null;
  }
  if (input.candidate.action === 'FARM_SAFELY') {
    return 'medium';
  }
  if (input.candidate.score < input.policy.highScoreFloor) {
    return 'medium';
  }

  return hasHighConfidenceEvidence(input) ? 'high' : 'medium';
}

function hasHighConfidenceEvidence(input: ClassifyLostConfidenceInput): boolean {
  switch (input.candidate.action) {
    case 'RESET':
      return input.signals.requesterReadiness.health === 'low' || input.signals.requesterReadiness.disabled === true;
    case 'DEFEND':
      return hasExactDefenseEvidence(input.signals);
    case 'REGROUP':
      return hasExactRegroupEvidence(input.signals);
    case 'FARM_SAFELY':
      return false;
  }
}

function hasExactDefenseEvidence(signals: LostSignals): boolean {
  if (signals.unknowns.includes('enemy_observation_ambiguous')) {
    return false;
  }

  return signals.structureRisks.some((risk) => {
    if (risk.damageActivity !== 'active') {
      return false;
    }

    return signals.defenses.some(
      (defense) =>
        defense.structureId === risk.structureId &&
        (defense.arrivalClass === 'already_near' || defense.arrivalClass === 'teleport_available') &&
        defense.numericalRisk === 'acceptable' &&
        defense.uncertainSupports === 0 &&
        defense.response === 'allowed'
    );
  });
}

function hasExactRegroupEvidence(signals: LostSignals): boolean {
  const cluster = signals.selectedTeamCluster;

  return (
    signals.isolation.deep === true &&
    signals.isolation.isolated === true &&
    cluster !== null &&
    cluster.connectedHeroNames.length > 0 &&
    cluster.destinationRisk === 'not_contradicted'
  );
}
