import type { RecommendLostActionResult } from '../../../modules/lost/public.js';
import type { DiscordPublicMessage } from '../discord.types.js';
import { discordMessage, type DiscordTranslator } from './discord-message.js';

export const DISCORD_MESSAGE_CONTENT_LIMIT = 2_000;

export type RecommendedLostActionResult = Extract<RecommendLostActionResult, { status: 'recommended' }>;

export type PresentDiscordLostMessageResult =
  Readonly<{ status: 'ready'; message: DiscordPublicMessage }> | Readonly<{ status: 'too_long' }>;

export type PresentDiscordLostMessage = (result: RecommendedLostActionResult) => PresentDiscordLostMessageResult;

export function createPresentDiscordLostMessage(translator: DiscordTranslator): PresentDiscordLostMessage {
  return (result) => {
    const { delivery, recommendation } = result;
    const header = translator(
      discordMessage('discord.lost.public_header', {
        displayName: delivery.audience.displayName,
        role: delivery.effectiveRole,
      })
    );
    const metrics = translator(
      discordMessage('discord.lost.public_metrics', {
        primaryScore: recommendation.primary?.score ?? null,
        confidence: recommendation.confidence,
        coverageCount: Math.round(recommendation.coverage * 5),
      })
    );
    const content = [header, recommendation.textTitle, metrics, recommendation.textBody].join('\n');

    if (content.length > DISCORD_MESSAGE_CONTENT_LIMIT) {
      return Object.freeze({ status: 'too_long' });
    }

    return Object.freeze({
      status: 'ready',
      message: Object.freeze({ content, suppressMentions: true }),
    });
  };
}
