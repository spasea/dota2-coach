import type { LostConfidencePolicy } from './lost-policy.js';
import type { LostSignals } from './derive-lost-signals.js';
import type { LostConfidence, RankedLostCandidate } from './recommendation.js';

export type ClassifyLostConfidenceInput = Readonly<{
  candidate: RankedLostCandidate;
  signals: LostSignals;
  policy: LostConfidencePolicy;
}>;

export function classifyLostConfidence(input: ClassifyLostConfidenceInput): LostConfidence | null {
  void input;
  throw new Error('Lost candidate confidence is not implemented.');
}
