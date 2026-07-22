import type { LostConfidencePolicy } from './lost-policy.js';
import type { ConfidentLostCandidate, LostSelection } from './recommendation.js';

export type SelectLostRecommendationInput = Readonly<{
  candidates: readonly ConfidentLostCandidate[];
  policy: LostConfidencePolicy;
}>;

export function selectLostRecommendation(input: SelectLostRecommendationInput): LostSelection {
  if (input.candidates.length === 0) {
    return Object.freeze({ status: 'hold', reason: 'insufficient_confidence' });
  }

  const ranked = [...input.candidates].sort(compareCandidates);
  const primary = ranked[0];

  if (primary === undefined) {
    return Object.freeze({ status: 'hold', reason: 'insufficient_confidence' });
  }

  const next = ranked[1];
  const alternative =
    next !== undefined && primary.score - next.score <= input.policy.alternativeScoreGap ? next : null;

  return Object.freeze({ status: 'selected', primary, alternative });
}

const saferActionPrecedence = Object.freeze({
  FARM_SAFELY: 0,
  RESET: 1,
  REGROUP: 2,
  DEFEND: 3,
});

function compareCandidates(left: ConfidentLostCandidate, right: ConfidentLostCandidate): number {
  const scoreDifference = right.score - left.score;

  return scoreDifference === 0
    ? saferActionPrecedence[left.action] - saferActionPrecedence[right.action]
    : scoreDifference;
}
