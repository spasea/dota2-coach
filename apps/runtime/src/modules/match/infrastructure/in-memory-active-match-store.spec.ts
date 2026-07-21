import { describe, expect, it } from '@jest/globals';

import { createActiveMatchState } from '../domain/match-memory.js';
import type { MatchSession } from '../domain/match-session.js';
import { createInMemoryActiveMatchStore } from './in-memory-active-match-store.js';

function createSession(matchId: string): MatchSession {
  return {
    matchId,
    team: 'radiant',
    timelineSourceClientId: 'client-01',
    timelineStatus: 'rebaselining',
    lastUsableSourceReceivedAt: 1_000,
    sourceObservedPostGame: false,
  };
}

describe('in-memory active match store', () => {
  it('starts empty and owns a deeply immutable copy of the active aggregate', () => {
    const store = createInMemoryActiveMatchStore();
    const callerState = createActiveMatchState(createSession('match-01'));

    expect(store.getActive()).toBeNull();

    store.replaceActive(callerState);

    expect(store.getActive()).toEqual(callerState);
    expect(store.getActive()).not.toBe(callerState);
    expect(Object.isFrozen(store.getActive())).toBe(true);
    expect(Object.isFrozen(store.getActive()?.memory.heroes.enemyRoster)).toBe(true);
  });

  it('releases previous match memory and overrides on replace and clear', () => {
    const store = createInMemoryActiveMatchStore();
    const previous = {
      ...createActiveMatchState(createSession('match-01')),
      roleOverrides: [{ clientId: 'client-01', role: 4 as const }],
    };

    store.replaceActive(previous);
    const previousState = store.getActive();
    store.replaceActive(createActiveMatchState(createSession('match-02')));

    expect(store.getActive()?.session.matchId).toBe('match-02');
    expect(store.getActive()?.roleOverrides).toEqual([]);
    expect(store.getActive()).not.toBe(previousState);

    store.replaceActive(null);

    expect(store.getActive()).toBeNull();
  });
});
