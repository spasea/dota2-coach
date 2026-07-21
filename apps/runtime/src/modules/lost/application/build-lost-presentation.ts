import type { LostGuardrail, LostUnknown } from '../domain/candidate.js';
import type {
  ConfidentLostCandidate,
  LostConfidence,
  LostOutcomeAction,
  LostSelection,
} from '../domain/recommendation.js';
import type { LostMessage } from './lost-translator.js';

export type LostCandidatePresentation = Readonly<{
  candidate: ConfidentLostCandidate;
  action: LostMessage;
  reasons: readonly LostMessage[];
  penalties: readonly LostMessage[];
  unknowns: readonly LostMessage[];
  guardrails: readonly LostMessage[];
}>;

export type LostPresentation = Readonly<{
  action: LostOutcomeAction;
  confidence: LostConfidence;
  coverage: number;
  primary: LostCandidatePresentation | null;
  alternative: LostCandidatePresentation | null;
  voiceLead: LostMessage;
  voiceReasons: readonly LostMessage[];
  voiceGuardrails: readonly LostMessage[];
  unknowns: readonly LostMessage[];
  guardrails: readonly LostMessage[];
}>;

export type BuildLostPresentationInput = Readonly<{
  selection: LostSelection;
  coverage: number;
  unknowns: readonly LostUnknown[];
  guardrails: readonly LostGuardrail[];
}>;

export function buildLostPresentation(input: BuildLostPresentationInput): LostPresentation {
  void input;
  throw new Error('Lost presentation building is not implemented.');
}
