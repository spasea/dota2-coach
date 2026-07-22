import type { MonotonicClock } from '../../../platform/time/monotonic-clock.js';
import type { BuildCoachContext, CoachContext, ContextUnavailableStatus, Team } from '../../match/public.js';
import {
  evaluateCandidateSafety,
  type HoldReason,
  type LostCandidateSafety,
  type LostUnknown,
  type LostUnavailableReason,
} from '../domain/candidate.js';
import { classifyLostConfidence } from '../domain/confidence.js';
import { deriveLostSignals, type LostSignals } from '../domain/derive-lost-signals.js';
import { deriveLostContextKey } from '../domain/lost-context-key.js';
import type { LostPolicy } from '../domain/lost-policy.js';
import type {
  ConfidentLostCandidate,
  LostConfidence,
  LostOutcomeAction,
  LostReasonCode,
  LostRecommendation,
  LostSelection,
  RankedLostCandidate,
} from '../domain/recommendation.js';
import { scoreLostCandidates } from '../domain/scoring.js';
import { selectLostRecommendation } from '../domain/select-recommendation.js';
import { applyLostStability } from '../domain/stability.js';
import { buildLostPresentation } from './build-lost-presentation.js';
import type { LostAdviceStore } from './lost-advice-store.js';
import type { LostRecommendationDelivery } from './lost-recommendation-delivery.js';
import type { LostTranslator } from './lost-translator.js';
import { renderLostRecommendation } from './render-lost-recommendation.js';

export type RecommendLostActionCommand = Readonly<{
  discordUserId: string;
  expectedMatchId?: string;
}>;

export type RecommendLostActionResult =
  | Readonly<{
      status: 'recommended';
      delivery: LostRecommendationDelivery;
      recommendation: LostRecommendation;
    }>
  | Readonly<{
      status: 'unavailable';
      reason: ContextUnavailableStatus | LostUnavailableReason | 'match_changed';
    }>;

export type LostDecisionMetadata = Readonly<{
  clientId: string;
  matchId: string;
  team: Team;
  action: LostOutcomeAction;
  confidence: LostConfidence;
  coverage: number;
  score: number;
  reasonCodes: readonly LostReasonCode[];
  unknowns: readonly LostUnknown[];
  holdReason: HoldReason | 'insufficient_confidence' | null;
}>;

export type RecommendLostAction = (command: RecommendLostActionCommand) => RecommendLostActionResult;

export type RecommendLostActionDependencies = Readonly<{
  adviceStore: LostAdviceStore;
  buildCoachContext: BuildCoachContext;
  monotonicNow: MonotonicClock;
  policy: LostPolicy;
  translator: LostTranslator;
  recordDecision: (metadata: LostDecisionMetadata) => void;
}>;

export function createRecommendLostAction(dependencies: RecommendLostActionDependencies): RecommendLostAction {
  return (command) => {
    const contextResult = dependencies.buildCoachContext(command);

    if (contextResult.status !== 'ready') {
      return Object.freeze({ status: 'unavailable', reason: contextResult.status });
    }

    return recommendForContext(contextResult.context, dependencies);
  };
}

function recommendForContext(
  context: CoachContext,
  dependencies: RecommendLostActionDependencies
): RecommendLostActionResult {
  const signals = deriveLostSignals({ context, policy: dependencies.policy });
  const safety = evaluateCandidateSafety({ contextResult: { status: 'ready', context }, signals });

  if (safety.status === 'unavailable') {
    return Object.freeze({ status: 'unavailable', reason: safety.reason });
  }

  const now = dependencies.monotonicNow();
  const contextKey = deriveLostContextKey(signals);
  const selection =
    safety.status === 'hold'
      ? Object.freeze({ status: 'hold' as const, reason: safety.reason })
      : selectDirectionalRecommendation({
          context,
          signals,
          candidates: safety.candidates,
          contextKey,
          now,
          dependencies,
        });
  const recommendation = renderSelection(context, selection, dependencies.translator);

  rememberAndRecordDecision({ context, contextKey, now, recommendation, selection, dependencies });

  return Object.freeze({
    status: 'recommended',
    delivery: Object.freeze({
      audience: Object.freeze({
        kind: 'individual',
        displayName: context.requester.identity.coachAlias,
      }),
      effectiveRole: context.effectiveRole,
    }),
    recommendation,
  });
}

type SelectDirectionalInput = Readonly<{
  context: CoachContext;
  signals: LostSignals;
  candidates: readonly LostCandidateSafety[];
  contextKey: string;
  now: number;
  dependencies: RecommendLostActionDependencies;
}>;

function selectDirectionalRecommendation(input: SelectDirectionalInput): LostSelection {
  const { context, signals, candidates, contextKey, now, dependencies } = input;
  const scored = scoreLostCandidates({ candidates, signals, policy: dependencies.policy.scoring });
  const stable = applyLostStability({
    candidates: scored,
    previous: dependencies.adviceStore.get(context.requester.identity.clientId),
    matchId: context.matchId,
    team: context.team,
    contextKey,
    now,
    bypass: hasUrgentCriticalDefense(signals),
    policy: dependencies.policy.stability,
  });
  const confident = classifyCandidates(stable, signals, dependencies.policy);

  return selectLostRecommendation({
    candidates: confident,
    policy: dependencies.policy.confidence,
  });
}

function classifyCandidates(
  candidates: readonly RankedLostCandidate[],
  signals: LostSignals,
  policy: LostPolicy
): readonly ConfidentLostCandidate[] {
  const confident: ConfidentLostCandidate[] = [];

  for (const candidate of candidates) {
    const confidence = classifyLostConfidence({
      candidate,
      signals,
      policy: policy.confidence,
    });

    if (confidence !== null) {
      confident.push(Object.freeze({ ...candidate, confidence }));
    }
  }

  return Object.freeze(confident);
}

function renderSelection(
  context: CoachContext,
  selection: LostSelection,
  translator: LostTranslator
): LostRecommendation {
  const unknowns = selection.status === 'selected' ? selection.primary.unknowns : context.unknowns;
  const guardrails = selection.status === 'selected' ? selection.primary.guardrails : [];
  const presentation = buildLostPresentation({
    selection,
    coverage: context.coverage,
    unknowns,
    guardrails,
  });

  return renderLostRecommendation({
    presentation,
    audience: {
      kind: 'individual',
      displayName: context.requester.identity.coachAlias,
    },
    translator,
  });
}

type RememberDecisionInput = Readonly<{
  context: CoachContext;
  contextKey: string;
  now: number;
  recommendation: LostRecommendation;
  selection: LostSelection;
  dependencies: RecommendLostActionDependencies;
}>;

function rememberAndRecordDecision(input: RememberDecisionInput): void {
  const { context, contextKey, now, recommendation, selection, dependencies } = input;
  const score = selection.status === 'selected' ? selection.primary.score : 0;
  const reasonCodes =
    selection.status === 'selected'
      ? Object.freeze(selection.primary.reasons.map((reason) => reason.code))
      : Object.freeze([]);
  const holdReason = selection.status === 'hold' ? selection.reason : null;

  dependencies.adviceStore.save(
    Object.freeze({
      clientId: context.requester.identity.clientId,
      matchId: context.matchId,
      team: context.team,
      action: recommendation.action,
      score,
      contextKey,
      createdAt: now,
    })
  );
  dependencies.recordDecision(
    Object.freeze({
      clientId: context.requester.identity.clientId,
      matchId: context.matchId,
      team: context.team,
      action: recommendation.action,
      confidence: recommendation.confidence,
      coverage: recommendation.coverage,
      score,
      reasonCodes,
      unknowns: Object.freeze([...recommendation.unknowns]),
      holdReason,
    })
  );
}

function hasUrgentCriticalDefense(signals: LostSignals): boolean {
  return signals.structureRisks.some(
    (risk) =>
      risk.level === 'critical' &&
      risk.damageActivity === 'active' &&
      signals.defenses.some(
        (defense) =>
          defense.structureId === risk.structureId &&
          defense.response !== 'blocked' &&
          (defense.arrivalClass === 'already_near' || defense.arrivalClass === 'teleport_available')
      )
  );
}
