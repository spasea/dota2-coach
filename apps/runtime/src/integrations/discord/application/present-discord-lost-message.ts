import type { RecommendLostActionResult } from '../../../modules/lost/public.js';
import type { DiscordPublicMessage } from '../discord.types.js';
import { discordInteractionNotImplemented } from './discord-interaction-not-implemented.js';
import type { DiscordTranslator } from './discord-message.js';

export const DISCORD_MESSAGE_CONTENT_LIMIT = 2_000;

export type RecommendedLostActionResult = Extract<RecommendLostActionResult, { status: 'recommended' }>;

export type PresentDiscordLostMessageResult =
  Readonly<{ status: 'ready'; message: DiscordPublicMessage }> | Readonly<{ status: 'too_long' }>;

export type PresentDiscordLostMessage = (result: RecommendedLostActionResult) => PresentDiscordLostMessageResult;

export function createPresentDiscordLostMessage(_translator: DiscordTranslator): PresentDiscordLostMessage {
  void _translator;
  return () => discordInteractionNotImplemented();
}
