import type { LostGuardrail, LostUnknown } from '../domain/candidate.js';
import type {
  ConfidentLostCandidate,
  LostConfidence,
  LostOutcomeAction,
  LostScoreTerm,
  LostSelection,
} from '../domain/recommendation.js';
import { lostMessage, type LostMessage } from './lost-translator.js';

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
  unknownCodes: readonly LostUnknown[];
  guardrailCodes: readonly LostGuardrail[];
}>;

export type BuildLostPresentationInput = Readonly<{
  selection: LostSelection;
  coverage: number;
  unknowns: readonly LostUnknown[];
  guardrails: readonly LostGuardrail[];
}>;

export function buildLostPresentation(input: BuildLostPresentationInput): LostPresentation {
  const unknowns = Object.freeze(input.unknowns.map(toUnknownMessage));
  const guardrails = Object.freeze(input.guardrails.map(toGuardrailMessage));

  if (input.selection.status === 'hold') {
    return Object.freeze({
      action: 'HOLD_AND_WAIT',
      confidence: 'high',
      coverage: input.coverage,
      primary: null,
      alternative: null,
      voiceLead: toHoldMessage(input.selection.reason),
      voiceReasons: Object.freeze([]),
      voiceGuardrails: guardrails,
      unknowns,
      guardrails,
      unknownCodes: Object.freeze([...input.unknowns]),
      guardrailCodes: Object.freeze([...input.guardrails]),
    });
  }

  const primary = presentCandidate(input.selection.primary);
  const alternative =
    input.selection.alternative === null ? null : presentCandidate(input.selection.alternative, false);
  const strongestReasons = [...input.selection.primary.reasons]
    .sort((left, right) => right.contribution - left.contribution)
    .slice(0, 2)
    .map(toReasonMessage);

  return Object.freeze({
    action: input.selection.primary.action,
    confidence: input.selection.primary.confidence,
    coverage: input.coverage,
    primary,
    alternative,
    voiceLead: toActionMessage(input.selection.primary),
    voiceReasons: Object.freeze(strongestReasons),
    voiceGuardrails: guardrails,
    unknowns,
    guardrails,
    unknownCodes: Object.freeze([...input.unknowns]),
    guardrailCodes: Object.freeze([...input.guardrails]),
  });
}

function presentCandidate(candidate: ConfidentLostCandidate, includeTarget = true): LostCandidatePresentation {
  return Object.freeze({
    candidate,
    action: toActionMessage(candidate, includeTarget),
    reasons: Object.freeze(candidate.reasons.map(toReasonMessage)),
    penalties: Object.freeze(candidate.penalties.map(toReasonMessage)),
    unknowns: Object.freeze(candidate.unknowns.map(toUnknownMessage)),
    guardrails: Object.freeze(candidate.guardrails.map(toGuardrailMessage)),
  });
}

function toActionMessage(candidate: ConfidentLostCandidate, includeTarget = true): LostMessage {
  const { action, target } = candidate;

  switch (action) {
    case 'RESET':
      return lostMessage('lost.action.reset', undefined);
    case 'DEFEND':
      return includeTarget && target?.kind === 'structure'
        ? lostMessage('lost.action.defend_target', { structureId: target.structureId })
        : lostMessage('lost.action.defend', undefined);
    case 'REGROUP':
      return includeTarget && target?.kind === 'allied_cluster'
        ? lostMessage('lost.action.regroup_target', { heroNames: target.heroNames })
        : lostMessage('lost.action.regroup', undefined);
    case 'FARM_SAFELY':
      return lostMessage('lost.action.farm_safely', undefined);
  }
}

function toReasonMessage(term: LostScoreTerm): LostMessage {
  switch (term.code) {
    case 'requester_low_health':
    case 'requester_low_mana':
    case 'requester_disabled':
    case 'active_structure_damage':
    case 'recent_structure_damage':
    case 'critical_structure':
    case 'requester_already_near_structure':
    case 'requester_can_teleport':
    case 'requester_deep_and_isolated':
    case 'partial_evidence':
      return lostMessage(`lost.reason.${term.code}`, undefined);
    case 'repeated_structure_damage':
      return lostMessage('lost.reason.repeated_structure_damage', { eventCount: term.value });
    case 'requester_would_arrive_outnumbered':
    case 'enemies_missing':
    case 'enemies_visible_elsewhere':
      return lostMessage(`lost.reason.${term.code}`, { enemyCount: term.value });
    case 'allied_defenders_already_present':
      return lostMessage('lost.reason.allied_defenders_already_present', { defenderCount: term.value });
    case 'confirmed_allied_cluster':
      return lostMessage('lost.reason.confirmed_allied_cluster', { allyCount: term.value });
    default:
      return assertNeverReason(term);
  }
}

function toUnknownMessage(unknown: LostUnknown): LostMessage {
  switch (unknown) {
    case 'partial_team_coverage':
    case 'timeline_stale':
    case 'timeline_rebaselining':
    case 'requester_history_unavailable':
    case 'building_history_unavailable':
    case 'enemy_observation_ambiguous':
    case 'requester_readiness_unknown':
    case 'teleport_readiness_unknown':
    case 'structure_position_unknown':
    case 'defender_readiness_partial':
    case 'enemy_count_is_lower_bound':
    case 'safe_destination_unknown':
      return lostMessage(`lost.unknown.${unknown}`, undefined);
  }
}

function toGuardrailMessage(guardrail: LostGuardrail): LostMessage {
  switch (guardrail) {
    case 'avoid_solo_defense':
    case 'do_not_farm_deep':
    case 'retreat_on_enemy_visibility_drop':
    case 'regroup_only_with_confirmed_cluster':
      return lostMessage(`lost.guardrail.${guardrail}`, undefined);
  }
}

function toHoldMessage(reason: Extract<LostSelection, { status: 'hold' }>['reason']): LostMessage {
  switch (reason) {
    case 'requester_dead':
    case 'match_paused':
    case 'insufficient_evidence':
    case 'insufficient_confidence':
      return lostMessage(`lost.hold.${reason}`, undefined);
  }
}

function assertNeverReason(term: never): never {
  throw new Error(`Unsupported Lost score term: ${String(term)}`);
}
