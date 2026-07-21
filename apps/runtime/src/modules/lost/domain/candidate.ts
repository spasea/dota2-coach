import type { BuildCoachContextResult, ContextUnavailableStatus, MatchContextUnknown } from '../../match/public.js';
import type { LostSignals } from './derive-lost-signals.js';

export type LostAction = 'RESET' | 'DEFEND' | 'REGROUP' | 'FARM_SAFELY';
export type HoldReason = 'requester_dead' | 'match_paused' | 'insufficient_evidence';
export type LostUnavailableReason = ContextUnavailableStatus | 'game_not_in_progress';

export type LostBlocker =
  | 'requester_not_ready'
  | 'structure_pressure_unavailable'
  | 'isolated_outnumbered_outer_defense'
  | 'safe_cluster_unavailable'
  | 'deep_farm_unsafe'
  | 'critical_evidence_unknown';

export type LostRisk =
  | 'outnumbered_high_ground_defense'
  | 'dangerous_ancient_last_stand'
  | 'enemy_count_is_lower_bound'
  | 'enemy_observation_ambiguous'
  | 'connected_readiness_partial';

export type LostGuardrail =
  | 'avoid_solo_defense'
  | 'do_not_farm_deep'
  | 'retreat_on_enemy_visibility_drop'
  | 'regroup_only_with_confirmed_cluster';

export type LostUnknown =
  | MatchContextUnknown
  | 'requester_readiness_unknown'
  | 'teleport_readiness_unknown'
  | 'structure_position_unknown'
  | 'defender_readiness_partial'
  | 'enemy_count_is_lower_bound'
  | 'safe_destination_unknown';

export type LostCandidateSafety = Readonly<{
  action: LostAction;
  eligible: boolean;
  blockers: readonly LostBlocker[];
  risks: readonly LostRisk[];
  unknowns: readonly LostUnknown[];
  guardrails: readonly LostGuardrail[];
}>;

export type LostCandidateSet = readonly [
  LostCandidateSafety,
  LostCandidateSafety,
  LostCandidateSafety,
  LostCandidateSafety,
];

export type LostSafetyResult =
  | Readonly<{ status: 'unavailable'; reason: LostUnavailableReason }>
  | Readonly<{ status: 'hold'; reason: HoldReason }>
  | Readonly<{ status: 'candidates'; candidates: LostCandidateSet }>;

export type EvaluateCandidateSafetyInput = Readonly<{
  contextResult: BuildCoachContextResult;
  signals: LostSignals | null;
}>;

export function evaluateCandidateSafety(input: EvaluateCandidateSafetyInput): LostSafetyResult {
  void input;
  throw new Error('Lost candidate safety is not implemented.');
}
