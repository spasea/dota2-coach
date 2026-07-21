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
  if (input.contextResult.status !== 'ready') {
    return Object.freeze({ status: 'unavailable', reason: input.contextResult.status });
  }

  const context = input.contextResult.context;
  const match = context.sharedSnapshot.match;

  if (match?.gameState !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS') {
    return Object.freeze({ status: 'unavailable', reason: 'game_not_in_progress' });
  }

  if (match.paused === true) {
    return Object.freeze({ status: 'hold', reason: 'match_paused' });
  }

  if (context.requester.snapshot.hero?.alive === false) {
    return Object.freeze({ status: 'hold', reason: 'requester_dead' });
  }

  if (input.signals === null || hasInsufficientEvidence(input.signals)) {
    return Object.freeze({ status: 'hold', reason: 'insufficient_evidence' });
  }

  const defenseEvidence = deriveDefenseCandidateEvidence(input.signals);
  const candidates = Object.freeze([
    createResetCandidate(input.signals),
    createDefendCandidate(input.signals, defenseEvidence),
    createRegroupCandidate(input.signals),
    createFarmSafelyCandidate(input.signals, defenseEvidence),
  ]) satisfies LostCandidateSet;

  return Object.freeze({ status: 'candidates', candidates });
}

function hasInsufficientEvidence(signals: LostSignals): boolean {
  const criticalReadinessUnknown =
    signals.requesterReadiness.health === 'unknown' &&
    signals.requesterReadiness.disabled === null &&
    signals.requesterReadiness.teleportReadiness.status === 'unknown';
  const pressureUnavailable =
    signals.structureRisks.length === 0 &&
    (signals.unknowns.includes('timeline_stale') ||
      signals.unknowns.includes('timeline_rebaselining') ||
      signals.unknowns.includes('building_history_unavailable'));
  const isolationUnknown = signals.isolation.deep === null || signals.isolation.isolated === null;
  const clusterUnavailable = signals.selectedTeamCluster === null;

  return criticalReadinessUnknown && pressureUnavailable && isolationUnknown && clusterUnavailable;
}

function createResetCandidate(signals: LostSignals): LostCandidateSafety {
  const readinessKnown =
    signals.requesterReadiness.health !== 'unknown' ||
    signals.requesterReadiness.mana !== 'unknown' ||
    signals.requesterReadiness.disabled !== null;

  return createCandidate({
    action: 'RESET',
    eligible: readinessKnown,
    blockers: readinessKnown ? [] : ['critical_evidence_unknown'],
    unknowns: signals.unknowns,
  });
}

type DefenseCandidateEvidence = Readonly<{
  hasUrgentStructure: boolean;
  hasUrgentDefense: boolean;
  hasReachableDefense: boolean;
  hasFeasibleDefense: boolean;
  hasBlockedDefense: boolean;
  hasBlockedUrgentDefense: boolean;
  hasStrongPenalty: boolean;
  hasLastStand: boolean;
  hasUncertainSupport: boolean;
}>;

function deriveDefenseCandidateEvidence(signals: LostSignals): DefenseCandidateEvidence {
  const urgentStructureIds = new Set<string>();

  for (const risk of signals.structureRisks) {
    if (risk.damageActivity === 'active' || risk.damageActivity === 'recent') {
      urgentStructureIds.add(risk.structureId);
    }
  }

  let hasUrgentDefense = false;
  let hasReachableDefense = false;
  let hasFeasibleDefense = false;
  let hasBlockedDefense = false;
  let hasBlockedUrgentDefense = false;
  let hasStrongPenalty = false;
  let hasLastStand = false;
  let hasUncertainSupport = false;

  for (const defense of signals.defenses) {
    const blocked = defense.response === 'blocked';
    hasBlockedDefense ||= blocked;

    if (!urgentStructureIds.has(defense.structureId)) {
      continue;
    }

    const reachable = defense.arrivalClass === 'already_near' || defense.arrivalClass === 'teleport_available';
    hasUrgentDefense = true;
    hasReachableDefense ||= reachable;
    hasFeasibleDefense ||= reachable && !blocked;
    hasBlockedUrgentDefense ||= blocked;
    hasStrongPenalty ||= defense.response === 'strong_penalty';
    hasLastStand ||= defense.response === 'last_stand';
    hasUncertainSupport ||= defense.uncertainSupports > 0;
  }

  return Object.freeze({
    hasUrgentStructure: urgentStructureIds.size > 0,
    hasUrgentDefense,
    hasReachableDefense,
    hasFeasibleDefense,
    hasBlockedDefense,
    hasBlockedUrgentDefense,
    hasStrongPenalty,
    hasLastStand,
    hasUncertainSupport,
  });
}

function createDefendCandidate(signals: LostSignals, evidence: DefenseCandidateEvidence): LostCandidateSafety {
  const requesterReady =
    signals.requesterReadiness.alive === true &&
    signals.requesterReadiness.health === 'not_low' &&
    signals.requesterReadiness.disabled === false;
  const blocker = deriveDefendBlocker(evidence, requesterReady);

  return createCandidate({
    action: 'DEFEND',
    eligible: blocker === null,
    blockers: blocker === null ? [] : [blocker],
    risks: deriveDefendRisks(signals, evidence),
    unknowns: deriveDefendUnknowns(signals, evidence),
    guardrails: evidence.hasBlockedUrgentDefense ? ['avoid_solo_defense'] : [],
  });
}

function deriveDefendBlocker(evidence: DefenseCandidateEvidence, requesterReady: boolean): LostBlocker | null {
  if (!evidence.hasUrgentStructure || !evidence.hasUrgentDefense) {
    return 'structure_pressure_unavailable';
  }

  if (!requesterReady || !evidence.hasReachableDefense) {
    return 'requester_not_ready';
  }

  return evidence.hasFeasibleDefense ? null : 'isolated_outnumbered_outer_defense';
}

function deriveDefendRisks(signals: LostSignals, evidence: DefenseCandidateEvidence): readonly LostRisk[] {
  const risks: LostRisk[] = [];

  if (evidence.hasStrongPenalty) {
    risks.push('outnumbered_high_ground_defense');
  }
  if (evidence.hasLastStand) {
    risks.push('dangerous_ancient_last_stand');
  }
  if (evidence.hasUncertainSupport) {
    risks.push('connected_readiness_partial');
  }
  if (signals.unknowns.includes('enemy_observation_ambiguous')) {
    risks.push('enemy_observation_ambiguous');
  }

  return risks;
}

function deriveDefendUnknowns(signals: LostSignals, evidence: DefenseCandidateEvidence): readonly LostUnknown[] {
  const unknowns: LostUnknown[] = [...signals.unknowns];

  if (signals.requesterReadiness.teleportReadiness.status === 'unknown') {
    unknowns.push('teleport_readiness_unknown');
  }
  if (evidence.hasUrgentStructure && !evidence.hasUrgentDefense) {
    unknowns.push('structure_position_unknown');
  }
  if (evidence.hasUncertainSupport) {
    unknowns.push('defender_readiness_partial');
  }

  return unknowns;
}

function createRegroupCandidate(signals: LostSignals): LostCandidateSafety {
  const cluster = signals.selectedTeamCluster;
  const eligible = cluster !== null && cluster.destinationRisk !== 'contradicted';
  const risks: LostRisk[] = [];
  const unknowns: LostUnknown[] = [...signals.unknowns];

  if (cluster !== null) {
    risks.push('enemy_count_is_lower_bound');
    unknowns.push('enemy_count_is_lower_bound');
  }
  if (cluster?.destinationRisk === 'unknown') {
    unknowns.push('safe_destination_unknown');
  }

  return createCandidate({
    action: 'REGROUP',
    eligible,
    blockers: eligible ? [] : ['safe_cluster_unavailable'],
    risks,
    unknowns,
    guardrails: eligible ? [] : ['regroup_only_with_confirmed_cluster'],
  });
}

function createFarmSafelyCandidate(
  signals: LostSignals,
  defenseEvidence: DefenseCandidateEvidence
): LostCandidateSafety {
  const guardrails: LostGuardrail[] = [];

  if (defenseEvidence.hasBlockedDefense) {
    guardrails.push('avoid_solo_defense');
  }
  if (signals.isolation.deep === true && signals.isolation.isolated === true) {
    guardrails.push('do_not_farm_deep');

    if (signals.isolation.missingEnemyCount > 0) {
      guardrails.push('retreat_on_enemy_visibility_drop');
    }
  }

  return createCandidate({
    action: 'FARM_SAFELY',
    eligible: true,
    unknowns: signals.unknowns,
    guardrails,
  });
}

type CreateCandidateInput = Readonly<{
  action: LostAction;
  eligible: boolean;
  blockers?: readonly LostBlocker[];
  risks?: readonly LostRisk[];
  unknowns?: readonly LostUnknown[];
  guardrails?: readonly LostGuardrail[];
}>;

function createCandidate(input: CreateCandidateInput): LostCandidateSafety {
  return Object.freeze({
    action: input.action,
    eligible: input.eligible,
    blockers: Object.freeze(unique(input.blockers ?? [])),
    risks: Object.freeze(unique(input.risks ?? [])),
    unknowns: Object.freeze(unique(input.unknowns ?? [])),
    guardrails: Object.freeze(unique(input.guardrails ?? [])),
  });
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
