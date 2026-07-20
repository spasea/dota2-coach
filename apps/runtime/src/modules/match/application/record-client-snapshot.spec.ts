import { describe, expect, it, jest } from '@jest/globals';

import type { LatestClientState } from '../domain/latest-client-state.js';
import type { LatestStateStore } from './latest-state-store.js';
import { createRecordClientSnapshot } from './record-client-snapshot.js';

describe('record client snapshot', () => {
  it('records resolved identity, server receive time, and accepted snapshot', () => {
    const save = jest.fn<(state: LatestClientState) => void>();
    const latestStateStore: LatestStateStore = {
      getLatest: () => null,
      save,
    };
    const now = jest.fn(() => new Date('2026-07-20T10:00:00.000Z'));
    const recordClientSnapshot = createRecordClientSnapshot({ latestStateStore, now });
    const identity = {
      clientId: 'client-01',
      discordUserId: '123456789012345678',
      coachAlias: 'Local Player',
      defaultRole: 2 as const,
    };
    const snapshot = { provider: { timestamp: 1_753_002_000 } };

    recordClientSnapshot({ identity, snapshot });

    expect(now).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      identity,
      receivedAt: '2026-07-20T10:00:00.000Z',
      snapshot,
    });
  });
});
