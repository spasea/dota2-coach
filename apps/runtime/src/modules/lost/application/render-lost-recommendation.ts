import type { LostRecommendation } from '../domain/recommendation.js';
import type { LostPresentation } from './build-lost-presentation.js';
import type { LostTranslator } from './lost-translator.js';

export type RenderLostRecommendationInput = Readonly<{
  presentation: LostPresentation;
  translator: LostTranslator;
}>;

export function renderLostRecommendation(input: RenderLostRecommendationInput): LostRecommendation {
  void input;
  throw new Error('Lost recommendation rendering is not implemented.');
}
