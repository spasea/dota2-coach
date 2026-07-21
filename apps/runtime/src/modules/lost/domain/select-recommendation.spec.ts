import { describe, expect, it } from '@jest/globals';

import { createConfidentCandidate, decisionPolicy } from './lost-decision.spec-fixtures.js';
import { selectLostRecommendation } from './select-recommendation.js';

describe('Lost recommendation selection', () => {
  it('uses explicit safer-action precedence for exact score ties', () => {
    const candidates = [
      createConfidentCandidate('DEFEND', 50),
      createConfidentCandidate('REGROUP', 50),
      createConfidentCandidate('RESET', 50),
      createConfidentCandidate('FARM_SAFELY', 50),
    ];

    expect(selectLostRecommendation({ candidates, policy: decisionPolicy.confidence })).toMatchObject({
      status: 'selected',
      primary: { action: 'FARM_SAFELY' },
      alternative: { action: 'RESET' },
    });
  });

  it('includes an eligible alternative at the exact inclusive score-gap boundary', () => {
    const candidates = [createConfidentCandidate('REGROUP', 80, 'high'), createConfidentCandidate('FARM_SAFELY', 65)];

    expect(selectLostRecommendation({ candidates, policy: decisionPolicy.confidence })).toMatchObject({
      status: 'selected',
      primary: { action: 'REGROUP' },
      alternative: { action: 'FARM_SAFELY' },
    });
  });

  it('omits an alternative outside the configured score gap', () => {
    const candidates = [createConfidentCandidate('RESET', 70, 'high'), createConfidentCandidate('FARM_SAFELY', 54)];

    expect(selectLostRecommendation({ candidates, policy: decisionPolicy.confidence })).toMatchObject({
      status: 'selected',
      primary: { action: 'RESET' },
      alternative: null,
    });
  });

  it('returns HOLD_AND_WAIT semantics when no candidate reaches medium confidence', () => {
    expect(selectLostRecommendation({ candidates: [], policy: decisionPolicy.confidence })).toEqual({
      status: 'hold',
      reason: 'insufficient_confidence',
    });
  });
});
