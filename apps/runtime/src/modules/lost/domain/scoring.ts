import type { LostCandidateSafety } from './candidate.js';
import type { LostSignals } from './derive-lost-signals.js';
import type { LostScoringPolicy } from './lost-policy.js';
import type { LostScoreTerm, RankedLostCandidate } from './recommendation.js';
import { scoreLostAction } from './scoring-rules.js';

export type ScoreLostCandidatesInput = Readonly<{
  candidates: readonly LostCandidateSafety[];
  signals: LostSignals;
  policy: LostScoringPolicy;
}>;

export function scoreLostCandidates(input: ScoreLostCandidatesInput): readonly RankedLostCandidate[] {
  const scored = input.candidates
    .filter((candidate) => candidate.eligible)
    .map((candidate) => scoreCandidate(candidate, input.signals, input.policy));

  return Object.freeze(scored);
}

function scoreCandidate(
  candidate: LostCandidateSafety,
  signals: LostSignals,
  policy: LostScoringPolicy
): RankedLostCandidate {
  const reasons: LostScoreTerm[] = [];
  const penalties: LostScoreTerm[] = [];
  let score = policy.actionBases[candidate.action];
  const actionScore = scoreLostAction(candidate.action, signals, policy);

  for (const scoreTerm of actionScore.terms) {
    score += scoreTerm.contribution;

    if (scoreTerm.contribution > 0) {
      reasons.push(scoreTerm);
      continue;
    }
    if (scoreTerm.contribution < 0) {
      penalties.push(scoreTerm);
    }
  }

  return Object.freeze({
    action: candidate.action,
    target: actionScore.target,
    score,
    reasons: Object.freeze(reasons),
    penalties: Object.freeze(penalties),
    blockers: Object.freeze([...candidate.blockers]),
    unknowns: Object.freeze([...candidate.unknowns]),
    guardrails: Object.freeze([...candidate.guardrails]),
  });
}
