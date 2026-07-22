import { describe, expect, it } from '@jest/globals';

import { createConfidentCandidate } from '../domain/lost-decision.spec-fixtures.js';
import type { LostPresentation } from './build-lost-presentation.js';
import { lostMessage, type LostMessage, type LostTranslator } from './lost-translator.js';
import { renderLostRecommendation } from './render-lost-recommendation.js';

describe('Lost recommendation rendering', () => {
  it('renders a selected presentation through the injected translator', () => {
    const primary = createConfidentCandidate('RESET', 130, 'high');
    const alternative = createConfidentCandidate('FARM_SAFELY', 20);
    const presentation: LostPresentation = {
      action: 'RESET',
      confidence: 'high',
      coverage: 0.4,
      primary: {
        candidate: primary,
        action: lostMessage('lost.action.reset', undefined),
        reasons: [
          lostMessage('lost.reason.requester_low_health', undefined),
          lostMessage('lost.reason.requester_disabled', undefined),
          lostMessage('lost.reason.requester_low_mana', undefined),
        ],
        penalties: [],
        unknowns: [lostMessage('lost.unknown.partial_team_coverage', undefined)],
        guardrails: [],
      },
      alternative: {
        candidate: alternative,
        action: lostMessage('lost.action.farm_safely', undefined),
        reasons: [],
        penalties: [],
        unknowns: [],
        guardrails: [],
      },
      voiceLead: lostMessage('lost.action.reset', undefined),
      voiceReasons: [
        lostMessage('lost.reason.requester_low_health', undefined),
        lostMessage('lost.reason.requester_disabled', undefined),
      ],
      voiceGuardrails: [],
      unknowns: [lostMessage('lost.unknown.partial_team_coverage', undefined)],
      guardrails: [],
      unknownCodes: ['partial_team_coverage'],
      guardrailCodes: [],
    };
    const translatedMessages: LostMessage[] = [];

    const recommendation = renderLostRecommendation({
      presentation,
      translator: createKeyTranslator(translatedMessages),
    });

    expect(recommendation).toMatchObject({
      action: 'RESET',
      confidence: 'high',
      coverage: 0.4,
      primary,
      alternative,
    });
    expect(recommendation.voiceText).toContain('[lost.action.reset]');
    expect(recommendation.voiceText).toContain('[lost.reason.requester_low_health]');
    expect(recommendation.voiceText).toContain('[lost.reason.requester_disabled]');
    expect(recommendation.voiceText).not.toContain('[lost.reason.requester_low_mana]');
    expect(recommendation.textBody).toContain('[lost.reason.requester_low_mana]');
    expect(translatedMessages).toContainEqual({ key: 'lost.layout.title', params: { action: 'RESET' } });
  });

  it('renders HOLD_AND_WAIT without primary or alternative candidates', () => {
    const recommendation = renderLostRecommendation({
      presentation: {
        action: 'HOLD_AND_WAIT',
        primary: null,
        alternative: null,
        confidence: 'high',
        coverage: 0.2,
        voiceLead: lostMessage('lost.hold.insufficient_evidence', undefined),
        voiceReasons: [],
        voiceGuardrails: [],
        unknowns: [],
        guardrails: [],
        unknownCodes: [],
        guardrailCodes: [],
      },
      translator: createKeyTranslator([]),
    });

    expect(recommendation).toMatchObject({
      action: 'HOLD_AND_WAIT',
      primary: null,
      alternative: null,
      confidence: 'high',
    });
    expect(recommendation.voiceText).toContain('[lost.hold.insufficient_evidence]');
  });
});

function createKeyTranslator(translatedMessages: LostMessage[]): LostTranslator {
  return (message) => {
    translatedMessages.push(message);

    const params = message.params === undefined ? '' : JSON.stringify(message.params);

    return `[${message.key}]${params}`;
  };
}
