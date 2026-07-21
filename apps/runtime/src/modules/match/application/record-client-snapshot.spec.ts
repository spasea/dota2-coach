import { describe, expect, it, jest } from '@jest/globals';

import type { NormalizedClientState } from '../domain/normalized-client-state.js';
import type { NormalizedClientSnapshot } from '../domain/normalized-snapshot.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';
import { createRecordClientSnapshot } from './record-client-snapshot.js';

describe('record client snapshot', () => {
  it('records resolved identity, server receive time, and accepted snapshot', () => {
    const save = jest.fn<(state: NormalizedClientState) => void>();
    const latestStateStore: NormalizedLatestStateStore = {
      getLatest: () => null,
      save,
    };
    const monotonicNow = jest.fn(() => 12_345);
    const recordClientSnapshot = createRecordClientSnapshot({ latestStateStore, monotonicNow });
    const identity = {
      clientId: 'client-01',
      discordUserId: '123456789012345678',
      coachAlias: 'Local Player',
      defaultRole: 2 as const,
    };
    const snapshot: NormalizedClientSnapshot = {
      sourceTimestampSeconds: 1_753_002_000,
      match: null,
      player: null,
      hero: null,
      minimapHeroes: [],
      buildings: [],
      events: [],
    };

    recordClientSnapshot({ identity, snapshot });

    expect(monotonicNow).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      identity,
      receivedAt: 12_345,
      snapshot,
    });
  });
});
