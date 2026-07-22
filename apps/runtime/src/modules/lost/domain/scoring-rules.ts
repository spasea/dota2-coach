import type { LostAction } from './candidate.js';
import type { DefenseFeasibilitySignal, LostSignals, StructureRiskSignal } from './derive-lost-signals.js';
import type { LostScoringPolicy } from './lost-policy.js';
import type { LostActionTarget, LostReasonCode, LostReasonValueByCode, LostScoreTerm } from './recommendation.js';

export type LostActionScore = Readonly<{
  terms: readonly LostScoreTerm[];
  target: LostActionTarget | null;
}>;

type ActionScorer = (signals: LostSignals, policy: LostScoringPolicy) => LostActionScore;
type OptionalScoreTerm = LostScoreTerm | null;

type DefensePressure = Readonly<{
  risk: StructureRiskSignal;
  defense: DefenseFeasibilitySignal | undefined;
}>;

const structureRiskLevelPriority = Object.freeze({ stable: 0, pressured: 1, critical: 2 });
const noScoreTerms: readonly LostScoreTerm[] = Object.freeze([]);
const actionScorers: Readonly<Record<LostAction, ActionScorer>> = Object.freeze({
  RESET: scoreReset,
  DEFEND: scoreDefend,
  REGROUP: scoreRegroup,
  FARM_SAFELY: scoreFarmSafely,
});

export function scoreLostAction(action: LostAction, signals: LostSignals, policy: LostScoringPolicy): LostActionScore {
  return actionScorers[action](signals, policy);
}

function scoreReset(signals: LostSignals, policy: LostScoringPolicy): LostActionScore {
  return createActionScore(
    appliedTerms([
      scoreTermWhen(
        signals.requesterReadiness.health === 'low',
        'requester_low_health',
        true,
        policy.contributions.RESET.requesterLowHealth
      ),
      scoreTermWhen(
        signals.requesterReadiness.mana === 'low',
        'requester_low_mana',
        true,
        policy.contributions.RESET.requesterLowMana
      ),
      scoreTermWhen(
        signals.requesterReadiness.disabled === true,
        'requester_disabled',
        true,
        policy.contributions.RESET.requesterDisabled
      ),
    ])
  );
}

function scoreDefend(signals: LostSignals, policy: LostScoringPolicy): LostActionScore {
  const pressure = selectDefensePressure(signals);

  if (pressure === null) {
    return createActionScore(noScoreTerms);
  }

  const { risk, defense } = pressure;
  const target = createStructureTarget(risk.structureId);
  const structureTerms = appliedTerms([
    scoreTermWhen(
      risk.damageActivity === 'active',
      'active_structure_damage',
      risk.activeDamageEvents,
      policy.contributions.DEFEND.activeStructureDamage
    ),
    scoreTermWhen(
      risk.damageActivity === 'recent',
      'recent_structure_damage',
      risk.recentDamageEvents,
      policy.contributions.DEFEND.recentStructureDamage
    ),
    scoreTermWhen(
      risk.activeDamageEvents > 1,
      'repeated_structure_damage',
      risk.activeDamageEvents,
      policy.contributions.DEFEND.repeatedStructureDamage
    ),
    scoreTermWhen(
      risk.level === 'critical',
      'critical_structure',
      risk.structureId,
      policy.contributions.DEFEND.criticalStructure
    ),
  ]);

  if (defense === undefined) {
    return createActionScore(
      appliedTerms([
        ...structureTerms,
        scoreTermWhen(
          signals.unknowns.length > 0,
          'partial_evidence',
          signals.unknowns.length,
          policy.contributions.DEFEND.partialEvidence
        ),
      ]),
      target
    );
  }

  const requesterIncluded = isRequesterIncludedAsDefender(defense, signals);
  const alliedDefenderCount = Math.max(0, defense.readyDefenders - Number(requesterIncluded));
  const partialEvidenceCount = signals.unknowns.length + defense.uncertainSupports;

  return createActionScore(
    appliedTerms([
      ...structureTerms,
      scoreTermWhen(
        defense.arrivalClass === 'already_near',
        'requester_already_near_structure',
        true,
        policy.contributions.DEFEND.requesterAlreadyNearStructure
      ),
      scoreTermWhen(
        defense.arrivalClass === 'teleport_available',
        'requester_can_teleport',
        true,
        policy.contributions.DEFEND.requesterCanTeleport
      ),
      scoreTermWhen(
        alliedDefenderCount > 0,
        'allied_defenders_already_present',
        alliedDefenderCount,
        policy.contributions.DEFEND.alliedDefendersAlreadyPresent
      ),
      scoreTermWhen(
        defense.numericalRisk === 'outnumbered',
        'requester_would_arrive_outnumbered',
        defense.visibleEnemyLowerBound,
        policy.contributions.DEFEND.requesterWouldArriveOutnumbered
      ),
      scoreTermWhen(
        partialEvidenceCount > 0,
        'partial_evidence',
        partialEvidenceCount,
        policy.contributions.DEFEND.partialEvidence
      ),
    ]),
    target
  );
}

function scoreRegroup(signals: LostSignals, policy: LostScoringPolicy): LostActionScore {
  const selectedCluster = signals.selectedTeamCluster;
  const partialEvidenceCount = signals.unknowns.length + Number(selectedCluster?.destinationRisk === 'unknown');

  return createActionScore(
    appliedTerms([
      scoreTermWhen(
        signals.isolation.deep === true && signals.isolation.isolated === true,
        'requester_deep_and_isolated',
        true,
        policy.contributions.REGROUP.requesterDeepAndIsolated
      ),
      scoreTermWhen(
        signals.isolation.missingEnemyCount > 0,
        'enemies_missing',
        signals.isolation.missingEnemyCount,
        policy.contributions.REGROUP.enemiesMissing
      ),
      scoreTermWhen(
        selectedCluster !== null,
        'confirmed_allied_cluster',
        selectedCluster?.heroNames.length ?? 0,
        policy.contributions.REGROUP.confirmedAlliedCluster
      ),
      scoreTermWhen(
        partialEvidenceCount > 0,
        'partial_evidence',
        partialEvidenceCount,
        policy.contributions.REGROUP.partialEvidence
      ),
    ]),
    selectedCluster === null ? null : createAlliedClusterTarget(selectedCluster.heroNames)
  );
}

function scoreFarmSafely(signals: LostSignals, policy: LostScoringPolicy): LostActionScore {
  const outnumberedDefense = selectMostOutnumberedDefense(signals.defenses);
  const visibleEnemyCount = outnumberedDefense?.visibleEnemyLowerBound ?? 0;

  return createActionScore(
    appliedTerms([
      scoreTermWhen(
        outnumberedDefense !== null,
        'requester_would_arrive_outnumbered',
        visibleEnemyCount,
        policy.contributions.FARM_SAFELY.requesterWouldArriveOutnumbered
      ),
      scoreTermWhen(
        signals.isolation.deep === true && signals.isolation.isolated === true,
        'requester_deep_and_isolated',
        true,
        policy.contributions.FARM_SAFELY.requesterDeepAndIsolated
      ),
      scoreTermWhen(
        signals.isolation.missingEnemyCount > 0,
        'enemies_missing',
        signals.isolation.missingEnemyCount,
        policy.contributions.FARM_SAFELY.enemiesMissing
      ),
      scoreTermWhen(
        outnumberedDefense !== null && isRequesterAcrossMap(signals),
        'enemies_visible_elsewhere',
        visibleEnemyCount,
        policy.contributions.FARM_SAFELY.enemiesVisibleElsewhere
      ),
    ])
  );
}

function createActionScore(terms: readonly LostScoreTerm[], target: LostActionTarget | null = null): LostActionScore {
  return Object.freeze({ terms, target });
}

function createStructureTarget(structureId: string): LostActionTarget {
  return Object.freeze({ kind: 'structure', structureId });
}

function createAlliedClusterTarget(heroNames: readonly string[]): LostActionTarget {
  return Object.freeze({ kind: 'allied_cluster', heroNames: Object.freeze([...heroNames]) });
}

function selectDefensePressure(signals: LostSignals): DefensePressure | null {
  const defensesByStructure = new Map(signals.defenses.map((defense) => [defense.structureId, defense]));
  const pressures = signals.structureRisks
    .filter((risk) => risk.damageActivity === 'active' || risk.damageActivity === 'recent')
    .map((risk) => Object.freeze({ risk, defense: defensesByStructure.get(risk.structureId) }))
    .toSorted(compareDefensePressure);
  const actionablePressure = pressures.find(isActionableDefensePressure);

  return actionablePressure ?? pressures[0] ?? null;
}

function compareDefensePressure(left: DefensePressure, right: DefensePressure): number {
  const activityDifference =
    Number(right.risk.damageActivity === 'active') - Number(left.risk.damageActivity === 'active');

  if (activityDifference !== 0) {
    return activityDifference;
  }

  const levelDifference = structureRiskLevelPriority[right.risk.level] - structureRiskLevelPriority[left.risk.level];

  return levelDifference === 0 ? left.risk.structureId.localeCompare(right.risk.structureId) : levelDifference;
}

function isActionableDefensePressure({ defense }: DefensePressure): boolean {
  if (defense === undefined || defense.response === 'blocked') {
    return false;
  }

  return defense.arrivalClass === 'already_near' || defense.arrivalClass === 'teleport_available';
}

function selectMostOutnumberedDefense(defenses: readonly DefenseFeasibilitySignal[]): DefenseFeasibilitySignal | null {
  let selected: DefenseFeasibilitySignal | null = null;

  for (const defense of defenses) {
    if (defense.numericalRisk !== 'outnumbered') {
      continue;
    }
    if (selected !== null && defense.visibleEnemyLowerBound <= selected.visibleEnemyLowerBound) {
      continue;
    }

    selected = defense;
  }

  return selected;
}

function isRequesterIncludedAsDefender(defense: DefenseFeasibilitySignal, signals: LostSignals): boolean {
  const requesterReady =
    signals.requesterReadiness.alive === true &&
    signals.requesterReadiness.health === 'not_low' &&
    signals.requesterReadiness.disabled === false;
  const requesterCanArrive = defense.arrivalClass === 'already_near' || defense.arrivalClass === 'teleport_available';

  return requesterReady && requesterCanArrive;
}

function isRequesterAcrossMap(signals: LostSignals): boolean {
  return signals.requesterMapDepth.zone === 'enemy_half' || signals.requesterMapDepth.zone === 'enemy_base';
}

function appliedTerms(terms: readonly OptionalScoreTerm[]): readonly LostScoreTerm[] {
  return Object.freeze(terms.filter(isScoreTerm));
}

function isScoreTerm(scoreTerm: OptionalScoreTerm): scoreTerm is LostScoreTerm {
  return scoreTerm !== null;
}

function scoreTermWhen<Code extends LostReasonCode>(
  applies: boolean,
  code: Code,
  value: LostReasonValueByCode[Code],
  contribution: number
): LostScoreTerm<Code> | null {
  return applies ? Object.freeze({ code, value, contribution }) : null;
}
