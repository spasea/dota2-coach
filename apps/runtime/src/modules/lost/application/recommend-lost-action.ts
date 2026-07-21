import type { MonotonicClock } from '../../../platform/time/monotonic-clock.js';
import type { BuildCoachContext, ContextUnavailableStatus, Team } from '../../match/public.js';
import type { LostUnknown, LostUnavailableReason } from '../domain/candidate.js';
import type { LostDecisionPolicy, LostPolicy } from '../domain/lost-policy.js';
import type {
  LostConfidence,
  LostOutcomeAction,
  LostReasonCode,
  LostRecommendation,
} from '../domain/recommendation.js';
import type { LostAdviceStore } from './lost-advice-store.js';
import type { LostTranslator } from './lost-translator.js';

export type RecommendLostActionCommand = Readonly<{
  discordUserId: string;
}>;

export type RecommendLostActionResult =
  | Readonly<{ status: 'recommended'; recommendation: LostRecommendation }>
  | Readonly<{ status: 'unavailable'; reason: ContextUnavailableStatus | LostUnavailableReason }>;

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
}>;

export type RecommendLostAction = (command: RecommendLostActionCommand) => RecommendLostActionResult;

export type RecommendLostActionDependencies = Readonly<{
  adviceStore: LostAdviceStore;
  buildCoachContext: BuildCoachContext;
  decisionPolicy: LostDecisionPolicy;
  monotonicNow: MonotonicClock;
  signalPolicy: LostPolicy;
  translator: LostTranslator;
  recordDecision: (metadata: LostDecisionMetadata) => void;
}>;

export function createRecommendLostAction(dependencies: RecommendLostActionDependencies): RecommendLostAction {
  void dependencies;

  return () => {
    throw new Error('Lost recommendation use case is not implemented.');
  };
}
