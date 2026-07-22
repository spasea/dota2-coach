import type { RecommendLostActionResult } from '../../../modules/lost/public.js';
import type { Role } from '../../../modules/match/public.js';

type RecommendedLostActionResult = Extract<RecommendLostActionResult, { status: 'recommended' }>;

export type DiscordTranslationParams = Readonly<{
  'discord.panel.content': undefined;
  'discord.panel.action.lost': undefined;
  'discord.panel.action.buy': undefined;
  'discord.role.label': Readonly<{ role: Role }>;
  'discord.error.invalid_source': undefined;
  'discord.error.identity_unmapped': undefined;
  'discord.error.gsi_unavailable': undefined;
  'discord.error.match_unavailable': undefined;
  'discord.error.match_changed': undefined;
  'discord.lost.duplicate': undefined;
  'discord.buy.disabled': undefined;
  'discord.lost.delivered': undefined;
  'discord.lost.unavailable': undefined;
  'discord.lost.delivery_failed': undefined;
  'discord.lost.public_header': Readonly<{
    displayName: string;
    role: Role;
  }>;
  'discord.lost.public_metrics': Readonly<{
    primaryScore: number | null;
    confidence: RecommendedLostActionResult['recommendation']['confidence'];
    coverageCount: number;
  }>;
  'discord.role.updated': Readonly<{ role: Role }>;
  'discord.error.unexpected': undefined;
}>;

export type DiscordTranslationKey = keyof DiscordTranslationParams;

export type DiscordMessage<Key extends DiscordTranslationKey = DiscordTranslationKey> = {
  [MessageKey in Key]: Readonly<{
    key: MessageKey;
    params: DiscordTranslationParams[MessageKey];
  }>;
}[Key];

export type DiscordTranslator = (message: DiscordMessage) => string;

export type DiscordTranslationCatalog = Readonly<{
  [Key in DiscordTranslationKey]: (params: DiscordTranslationParams[Key]) => string;
}>;

export function discordMessage<Key extends DiscordTranslationKey>(
  key: Key,
  params: DiscordTranslationParams[Key]
): DiscordMessage<Key> {
  return Object.freeze({ key, params });
}
