import { describe, expect, it } from '@jest/globals';

import type { RecommendLostActionResult } from '../../../modules/lost/public.js';
import { createRussianDiscordTranslator } from '../infrastructure/russian-discord-translator.js';
import { discordMessage, type DiscordMessage } from './discord-message.js';
import { createPresentDiscordLostMessage, DISCORD_MESSAGE_CONTENT_LIMIT } from './present-discord-lost-message.js';

const directionalResult: Extract<RecommendLostActionResult, { status: 'recommended' }> = Object.freeze({
  status: 'recommended',
  delivery: Object.freeze({
    audience: Object.freeze({ kind: 'individual', displayName: 'Lich' }),
    effectiveRole: 4,
  }),
  recommendation: Object.freeze({
    action: 'RESET',
    primary: Object.freeze({
      action: 'RESET',
      target: null,
      score: 70,
      reasons: Object.freeze([]),
      penalties: Object.freeze([]),
      blockers: Object.freeze([]),
      unknowns: Object.freeze([]),
      guardrails: Object.freeze([]),
    }),
    alternative: null,
    confidence: 'high',
    coverage: 0.6,
    voiceText: 'Lich, отойди и восстановись.',
    textTitle: 'RESET',
    textBody: 'Лучшее действие: восстановиться.',
    unknowns: Object.freeze([]),
    guardrails: Object.freeze([]),
  }),
});

describe('Discord Lost text presentation', () => {
  it('renders typed delivery facts and detailed Lost text into one mention-safe message', () => {
    const translation = createTranslationHarness();
    const present = createPresentDiscordLostMessage(translation.translate);

    const result = present(directionalResult);

    expect(result).toEqual({
      status: 'ready',
      message: {
        content: ['HEADER', 'RESET', 'METRICS', 'Лучшее действие: восстановиться.'].join('\n'),
        suppressMentions: true,
      },
    });
    expect(translation.messages).toEqual([
      discordMessage('discord.lost.public_header', { displayName: 'Lich', role: 4 }),
      discordMessage('discord.lost.public_metrics', {
        primaryScore: 70,
        confidence: 'high',
        coverageCount: 3,
      }),
    ]);
    expect(result.status === 'ready' && Object.isFrozen(result.message)).toBe(true);
  });

  it('renders HOLD_AND_WAIT without fabricating a score or alternative', () => {
    const translation = createTranslationHarness();
    const present = createPresentDiscordLostMessage(translation.translate);
    const holdResult = Object.freeze({
      ...directionalResult,
      recommendation: Object.freeze({
        ...directionalResult.recommendation,
        action: 'HOLD_AND_WAIT' as const,
        primary: null,
        alternative: null,
        textTitle: 'Подожди',
      }),
    });

    const result = present(holdResult);

    expect(translation.messages).toContainEqual(
      discordMessage('discord.lost.public_metrics', {
        primaryScore: null,
        confidence: 'high',
        coverageCount: 3,
      })
    );
    expect(result.status === 'ready' && result.message.content).not.toContain('Alternative');
  });

  it('fails closed before send when final content exceeds the Discord limit', () => {
    const present = createPresentDiscordLostMessage(createTranslationHarness().translate);
    const oversized = Object.freeze({
      ...directionalResult,
      recommendation: Object.freeze({
        ...directionalResult.recommendation,
        textBody: 'x'.repeat(DISCORD_MESSAGE_CONTENT_LIMIT + 1),
      }),
    });

    expect(present(oversized)).toEqual({ status: 'too_long' });
  });
});

describe('Russian Discord translation catalog', () => {
  it('provides non-empty copy for every typed interaction key', () => {
    const translator = createRussianDiscordTranslator();
    const messages: readonly DiscordMessage[] = [
      discordMessage('discord.panel.content', undefined),
      discordMessage('discord.panel.action.lost', undefined),
      discordMessage('discord.panel.action.buy', undefined),
      discordMessage('discord.role.label', { role: 1 }),
      discordMessage('discord.error.invalid_source', undefined),
      discordMessage('discord.error.identity_unmapped', undefined),
      discordMessage('discord.error.gsi_unavailable', undefined),
      discordMessage('discord.error.match_unavailable', undefined),
      discordMessage('discord.error.match_changed', undefined),
      discordMessage('discord.lost.duplicate', undefined),
      discordMessage('discord.buy.disabled', undefined),
      discordMessage('discord.lost.delivered', undefined),
      discordMessage('discord.lost.unavailable', undefined),
      discordMessage('discord.lost.delivery_failed', undefined),
      discordMessage('discord.lost.public_header', { displayName: 'Lich', role: 4 }),
      discordMessage('discord.lost.public_metrics', {
        primaryScore: 70,
        confidence: 'high',
        coverageCount: 3,
      }),
      discordMessage('discord.role.updated', { role: 5 }),
      discordMessage('discord.error.unexpected', undefined),
    ];

    expect(messages.map(translator).every((copy) => copy.trim().length > 0)).toBe(true);
  });

  it('formats requester, role, score, confidence, and coverage labels', () => {
    const translator = createRussianDiscordTranslator();

    expect(translator(discordMessage('discord.lost.public_header', { displayName: 'Lich', role: 4 }))).toBe(
      'Lich · роль 4 Support'
    );
    expect(
      translator(
        discordMessage('discord.lost.public_metrics', {
          primaryScore: 70,
          confidence: 'high',
          coverageCount: 3,
        })
      )
    ).toBe('Score: 70 · Confidence: high · Coverage: 3/5');
  });
});

function createTranslationHarness() {
  const messages: DiscordMessage[] = [];

  return {
    messages,
    translate: (message: DiscordMessage) => {
      messages.push(message);

      if (message.key === 'discord.lost.public_header') {
        return 'HEADER';
      }
      if (message.key === 'discord.lost.public_metrics') {
        return 'METRICS';
      }

      return message.key;
    },
  };
}
