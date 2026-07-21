import type { LostConfidencePolicy } from './lost-policy.js';
import type { ConfidentLostCandidate, LostSelection } from './recommendation.js';

export type SelectLostRecommendationInput = Readonly<{
  candidates: readonly ConfidentLostCandidate[];
  policy: LostConfidencePolicy;
}>;

export function selectLostRecommendation(input: SelectLostRecommendationInput): LostSelection {
  void input;
  throw new Error('Lost recommendation selection is not implemented.');
}
