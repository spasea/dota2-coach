import { discordInteractionNotImplemented } from '../application/discord-interaction-not-implemented.js';
import type { DiscordTranslator } from '../application/discord-message.js';

export function createRussianDiscordTranslator(): DiscordTranslator {
  return () => discordInteractionNotImplemented();
}
