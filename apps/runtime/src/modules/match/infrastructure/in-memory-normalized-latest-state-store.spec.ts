import { describe, expect, it } from '@jest/globals';

import type { NormalizedClientState } from '../domain/normalized-client-state.js';
import type { NormalizedClientSnapshot } from '../domain/normalized-snapshot.js';
import { createInMemoryNormalizedLatestStateStore } from './in-memory-normalized-latest-state-store.js';

const emptySnapshot: NormalizedClientSnapshot = {
  sourceTimestampSeconds: null,
  match: null,
  player: null,
  hero: null,
  minimapHeroes: [],
  buildings: [],
  events: [],
};

function createState(clientId: string, discordUserId: string, receivedAt: number): NormalizedClientState {
  return {
    identity: {
      clientId,
      discordUserId,
      coachAlias: `${clientId} coach`,
      defaultRole: 2,
    },
    receivedAt,
    snapshot: emptySnapshot,
  };
}

describe('in-memory normalized latest client state', () => {
  it('replaces state per client while keeping clients isolated', () => {
    const store = createInMemoryNormalizedLatestStateStore();
    const firstClientInitial = createState('client-01', 'discord-user-01', 1_000);
    const firstClientLatest = createState('client-01', 'discord-user-01', 2_000);
    const secondClient = createState('client-02', 'discord-user-02', 1_500);

    store.save(firstClientInitial);
    store.save(secondClient);
    store.save(firstClientLatest);

    expect(store.getLatest('client-01')).toEqual(firstClientLatest);
    expect(store.getLatest('client-02')).toEqual(secondClient);
  });

  it('owns an immutable copy instead of caller state', () => {
    const store = createInMemoryNormalizedLatestStateStore();
    const callerOwnedState = createState('client-01', 'discord-user-01', 1_000);

    store.save(callerOwnedState);

    const storedState = store.getLatest('client-01');

    expect(storedState).toEqual(callerOwnedState);
    expect(storedState).not.toBe(callerOwnedState);
    expect(Object.isFrozen(storedState)).toBe(true);
    expect(Object.isFrozen(storedState?.snapshot)).toBe(true);
    expect(Object.isFrozen(storedState?.snapshot.events)).toBe(true);
  });
});
