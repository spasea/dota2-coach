import type { MonotonicClock } from '../../../platform/time/monotonic-clock.js';
import { discordInteractionNotImplemented } from './discord-interaction-not-implemented.js';

export type DiscordActionDebounceKey = Readonly<{
  matchId: string;
  discordUserId: string;
  actionType: 'lost';
}>;

export type DiscordActionDebounceResult = Readonly<{ status: 'accepted' | 'duplicate' }>;

export type DiscordActionDebounce = Readonly<{
  tryAccept: (key: DiscordActionDebounceKey) => DiscordActionDebounceResult;
}>;

export type CreateDiscordActionDebounceInput = Readonly<{
  windowMs: number;
  monotonicNow: MonotonicClock;
}>;

export function createDiscordActionDebounce(_input: CreateDiscordActionDebounceInput): DiscordActionDebounce {
  void _input;

  return Object.freeze({
    tryAccept: () => discordInteractionNotImplemented(),
  });
}
