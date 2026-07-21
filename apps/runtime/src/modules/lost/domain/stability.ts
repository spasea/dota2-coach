import type { Team } from '../../match/public.js';
import type { LostStabilityPolicy } from './lost-policy.js';
import type { LostAdviceMemory, RankedLostCandidate } from './recommendation.js';

export type ApplyLostStabilityInput = Readonly<{
  candidates: readonly RankedLostCandidate[];
  previous: LostAdviceMemory | null;
  matchId: string;
  team: Team;
  contextKey: string;
  now: number;
  bypass: boolean;
  policy: LostStabilityPolicy;
}>;

export function applyLostStability(input: ApplyLostStabilityInput): readonly RankedLostCandidate[] {
  void input;
  throw new Error('Lost advice stability is not implemented.');
}
