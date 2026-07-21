import type { Team } from '../../match/public.js';
import type { HoldReason, LostAction, LostBlocker, LostGuardrail, LostUnknown } from './candidate.js';

export type LostOutcomeAction = LostAction | 'HOLD_AND_WAIT';
export type LostConfidence = 'high' | 'medium';

export type LostReasonCode =
  | 'requester_low_health'
  | 'requester_low_mana'
  | 'requester_disabled'
  | 'active_structure_damage'
  | 'recent_structure_damage'
  | 'repeated_structure_damage'
  | 'critical_structure'
  | 'requester_already_near_structure'
  | 'requester_can_teleport'
  | 'requester_would_arrive_outnumbered'
  | 'allied_defenders_already_present'
  | 'requester_deep_and_isolated'
  | 'enemies_missing'
  | 'enemies_visible_elsewhere'
  | 'confirmed_allied_cluster'
  | 'partial_evidence';

export type LostScoreTerm = Readonly<{
  code: LostReasonCode;
  value: number | string | boolean;
  contribution: number;
}>;

export type RankedLostCandidate = Readonly<{
  action: LostAction;
  score: number;
  reasons: readonly LostScoreTerm[];
  penalties: readonly LostScoreTerm[];
  blockers: readonly LostBlocker[];
  unknowns: readonly LostUnknown[];
  guardrails: readonly LostGuardrail[];
}>;

export type ConfidentLostCandidate = RankedLostCandidate &
  Readonly<{
    confidence: LostConfidence;
  }>;

export type ScoredLostCandidate = RankedLostCandidate;

export type LostRecommendation = Readonly<{
  action: LostOutcomeAction;
  primary: ScoredLostCandidate | null;
  alternative: ScoredLostCandidate | null;
  confidence: LostConfidence;
  coverage: number;
  voiceText: string;
  textTitle: string;
  textBody: string;
  unknowns: readonly LostUnknown[];
  guardrails: readonly LostGuardrail[];
}>;

export type LostSelection =
  | Readonly<{ status: 'hold'; reason: HoldReason | 'insufficient_confidence' }>
  | Readonly<{
      status: 'selected';
      primary: ConfidentLostCandidate;
      alternative: ConfidentLostCandidate | null;
    }>;

export type LostAdviceMemory = Readonly<{
  clientId: string;
  matchId: string;
  team: Team;
  action: LostOutcomeAction;
  score: number;
  contextKey: string;
  createdAt: number;
}>;
