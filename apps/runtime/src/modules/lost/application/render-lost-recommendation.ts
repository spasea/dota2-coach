import type { LostRecommendation } from '../domain/recommendation.js';
import type { LostPresentation } from './build-lost-presentation.js';
import type { LostRecommendationAudience } from './lost-recommendation-delivery.js';
import { lostMessage, type LostMessage, type LostTranslator } from './lost-translator.js';

export type RenderLostRecommendationInput = Readonly<{
  presentation: LostPresentation;
  audience: LostRecommendationAudience;
  translator: LostTranslator;
}>;

export function renderLostRecommendation(input: RenderLostRecommendationInput): LostRecommendation {
  const { audience, presentation, translator } = input;
  const voiceLead = translator(presentation.voiceLead);
  const voiceReasons = presentation.voiceReasons.map(translator);
  const voiceGuardrails = presentation.voiceGuardrails.map(translator);
  const voiceWithReasons =
    voiceReasons.length === 0
      ? voiceLead
      : translator(
          lostMessage('lost.layout.voice_with_reasons', {
            action: voiceLead,
            reasons: voiceReasons.join('; '),
          })
        );
  const voice =
    voiceGuardrails.length === 0
      ? voiceWithReasons
      : translator(
          lostMessage('lost.layout.voice_with_guardrails', {
            voice: voiceWithReasons,
            guardrails: voiceGuardrails.join('; '),
          })
        );
  const voiceText = translator(
    lostMessage('lost.layout.voice_addressed_to_individual', {
      displayName: audience.displayName,
      voice,
    })
  );

  return Object.freeze({
    action: presentation.action,
    primary: presentation.primary?.candidate ?? null,
    alternative: presentation.alternative?.candidate ?? null,
    confidence: presentation.confidence,
    coverage: presentation.coverage,
    voiceText,
    textTitle: translator(lostMessage('lost.layout.title', { action: presentation.action })),
    textBody: renderTextBody(presentation, translator),
    unknowns: presentation.unknownCodes,
    guardrails: presentation.guardrailCodes,
  });
}

function renderTextBody(presentation: LostPresentation, translator: LostTranslator): string {
  const action = translator(presentation.primary?.action ?? presentation.voiceLead);
  const lines = [translator(lostMessage('lost.layout.best_action', { action }))];

  if (presentation.primary !== null) {
    appendSection(lines, 'lost.layout.reason_section', presentation.primary.reasons, translator);
    appendSection(lines, 'lost.layout.penalty_section', presentation.primary.penalties, translator);
  }
  if (presentation.alternative !== null) {
    lines.push(
      translator(
        lostMessage('lost.layout.alternative', {
          action: translator(presentation.alternative.action),
          score: presentation.alternative.candidate.score,
        })
      )
    );
  }

  appendSection(lines, 'lost.layout.unknown_section', presentation.unknowns, translator);
  appendSection(lines, 'lost.layout.guardrail_section', presentation.guardrails, translator);

  return lines.join('\n');
}

function appendSection(
  lines: string[],
  heading:
    | 'lost.layout.reason_section'
    | 'lost.layout.penalty_section'
    | 'lost.layout.unknown_section'
    | 'lost.layout.guardrail_section',
  messages: readonly LostMessage[],
  translator: LostTranslator
): void {
  if (messages.length === 0) {
    return;
  }

  lines.push(translator(lostMessage(heading, undefined)));

  for (const message of messages) {
    lines.push(translator(lostMessage('lost.layout.list_item', { text: translator(message) })));
  }
}
