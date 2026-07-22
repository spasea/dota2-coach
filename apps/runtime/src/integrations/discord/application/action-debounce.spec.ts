import { describe, expect, it } from '@jest/globals';

import { createDiscordActionDebounce, type DiscordActionDebounceKey } from './action-debounce.js';

const baseKey: DiscordActionDebounceKey = Object.freeze({
  matchId: 'match-01',
  discordUserId: '123456789012345678',
  actionType: 'lost',
});

describe('Discord Lost action debounce', () => {
  it('rejects the same key inside the half-open window and accepts the exact boundary', () => {
    let now = 10_000;
    const debounce = createDiscordActionDebounce({ windowMs: 5_000, monotonicNow: () => now });

    expect(debounce.tryAccept(baseKey)).toEqual({ status: 'accepted' });

    now = 14_999;
    expect(debounce.tryAccept(baseKey)).toEqual({ status: 'duplicate' });

    now = 15_000;
    expect(debounce.tryAccept(baseKey)).toEqual({ status: 'accepted' });
  });

  it('separates matches and requesters without a background timer', () => {
    const debounce = createDiscordActionDebounce({ windowMs: 5_000, monotonicNow: () => 10_000 });

    expect(debounce.tryAccept(baseKey)).toEqual({ status: 'accepted' });
    expect(debounce.tryAccept({ ...baseKey, matchId: 'match-02' })).toEqual({ status: 'accepted' });
    expect(debounce.tryAccept({ ...baseKey, discordUserId: '234567890123456789' })).toEqual({
      status: 'accepted',
    });
  });

  it('keeps an accepted entry after downstream work fails', () => {
    const debounce = createDiscordActionDebounce({ windowMs: 5_000, monotonicNow: () => 10_000 });

    expect(debounce.tryAccept(baseKey)).toEqual({ status: 'accepted' });
    expect(debounce.tryAccept(baseKey)).toEqual({ status: 'duplicate' });
  });
});
