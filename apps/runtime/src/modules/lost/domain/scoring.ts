import type { LostCandidateSafety } from './candidate.js';
import type { LostSignals } from './derive-lost-signals.js';
import type { LostScoringPolicy } from './lost-policy.js';
import type { RankedLostCandidate } from './recommendation.js';

export type ScoreLostCandidatesInput = Readonly<{
  candidates: readonly LostCandidateSafety[];
  signals: LostSignals;
  policy: LostScoringPolicy;
}>;

export function scoreLostCandidates(input: ScoreLostCandidatesInput): readonly RankedLostCandidate[] {
  void input;
  throw new Error('Lost candidate scoring is not implemented.');
}
