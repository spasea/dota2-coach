import type { MonotonicClock } from '../../../platform/time/monotonic-clock.js';
import type { CoachLocale } from '../../../platform/i18n/locale.js';
import type { BuildCoachContext } from '../../match/public.js';
import {
  createRecommendLostAction,
  type LostDecisionMetadata,
  type RecommendLostAction,
} from '../application/recommend-lost-action.js';
import type { LostPolicy } from '../domain/lost-policy.js';
import { createInMemoryLostAdviceStore } from './in-memory-lost-advice-store.js';
import { createLostTranslator } from './create-lost-translator.js';

export type CreateLostRecommendationCapabilityInput = Readonly<{
  buildCoachContext: BuildCoachContext;
  locale: CoachLocale;
  monotonicNow: MonotonicClock;
  policy: LostPolicy;
  recordDecision: (metadata: LostDecisionMetadata) => void;
}>;

export function createLostRecommendationCapability(
  input: CreateLostRecommendationCapabilityInput
): RecommendLostAction {
  return createRecommendLostAction({
    adviceStore: createInMemoryLostAdviceStore(),
    buildCoachContext: input.buildCoachContext,
    monotonicNow: input.monotonicNow,
    policy: input.policy,
    translator: createLostTranslator(input.locale),
    recordDecision: input.recordDecision,
  });
}
