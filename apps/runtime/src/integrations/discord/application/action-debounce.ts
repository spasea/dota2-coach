import type { MonotonicClock } from '../../../platform/time/monotonic-clock.js';

const acceptedResult = Object.freeze({ status: 'accepted' as const });
const duplicateResult = Object.freeze({ status: 'duplicate' as const });

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

export function createDiscordActionDebounce(input: CreateDiscordActionDebounceInput): DiscordActionDebounce {
  if (!Number.isFinite(input.windowMs) || input.windowMs <= 0) {
    throw new RangeError('Discord action debounce window must be a positive finite number.');
  }

  const acceptedAtByKey = new Map<string, number>();

  return Object.freeze({
    tryAccept: (key) => {
      const now = input.monotonicNow();

      for (const [storedKey, acceptedAt] of acceptedAtByKey) {
        if (now - acceptedAt >= input.windowMs) {
          acceptedAtByKey.delete(storedKey);
        }
      }

      const serializedKey = JSON.stringify([key.matchId, key.discordUserId, key.actionType]);
      const acceptedAt = acceptedAtByKey.get(serializedKey);

      if (acceptedAt !== undefined && now - acceptedAt >= 0 && now - acceptedAt < input.windowMs) {
        return duplicateResult;
      }

      acceptedAtByKey.set(serializedKey, now);
      return acceptedResult;
    },
  });
}
