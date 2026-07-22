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
  if (!canApplyPreviousAdvice(input)) {
    return input.candidates;
  }

  const stableCandidates = input.candidates.map((candidate) =>
    candidate.action === input.previous?.action
      ? Object.freeze({ ...candidate, score: candidate.score + input.policy.previousActionBonus })
      : candidate
  );

  return Object.freeze(stableCandidates);
}

function canApplyPreviousAdvice(input: ApplyLostStabilityInput): boolean {
  const previous = input.previous;

  if (previous === null || input.bypass) {
    return false;
  }
  if (previous.matchId !== input.matchId || previous.team !== input.team || previous.contextKey !== input.contextKey) {
    return false;
  }

  const age = input.now - previous.createdAt;

  if (age < 0 || age >= input.policy.hysteresisMs) {
    return false;
  }

  return input.candidates.some((candidate) => candidate.action === previous.action);
}
