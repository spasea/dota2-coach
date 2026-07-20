import { describe, expect, it } from '@jest/globals';

import type { LatestClientState } from '../domain/latest-client-state.js';
import { createInMemoryLatestStateStore } from './in-memory-latest-state-store.js';

function createState(
  clientId: string,
  receivedAt: string,
  snapshot: Readonly<Record<string, unknown>>
): LatestClientState {
  return {
    identity: {
      clientId,
      discordUserId: `${clientId}-discord-user`,
      coachAlias: `${clientId} coach`,
      defaultRole: 2,
    },
    receivedAt,
    snapshot,
  };
}

describe('in-memory latest client state', () => {
  it('replaces the latest snapshot for the same client', () => {
    const store = createInMemoryLatestStateStore();
    const firstState = createState('client-01', '2026-07-20T10:00:00.000Z', { sequence: 1 });
    const latestState = createState('client-01', '2026-07-20T10:00:01.000Z', { sequence: 2 });

    store.save(firstState);
    store.save(latestState);

    expect(store.getLatest('client-01')).toEqual(latestState);
  });

  it('keeps independent latest snapshots for different clients', () => {
    const store = createInMemoryLatestStateStore();
    const firstClientState = createState('client-01', '2026-07-20T10:00:00.000Z', { sequence: 1 });
    const secondClientState = createState('client-02', '2026-07-20T10:00:01.000Z', { sequence: 2 });

    store.save(firstClientState);
    store.save(secondClientState);

    expect(store.getLatest('client-01')).toEqual(firstClientState);
    expect(store.getLatest('client-02')).toEqual(secondClientState);
  });

  it('does not retain mutable snapshot references supplied by callers', () => {
    const store = createInMemoryLatestStateStore();
    const callerOwnedSnapshot = { map: { clockTime: 10 } };

    store.save(createState('client-01', '2026-07-20T10:00:00.000Z', callerOwnedSnapshot));
    callerOwnedSnapshot.map.clockTime = 99;

    const storedState = store.getLatest('client-01');

    expect(storedState?.snapshot).toEqual({ map: { clockTime: 10 } });
    expect(Object.isFrozen(storedState)).toBe(true);
    expect(Object.isFrozen(storedState?.snapshot)).toBe(true);
    expect(Object.isFrozen(storedState?.snapshot.map)).toBe(true);
  });
});
