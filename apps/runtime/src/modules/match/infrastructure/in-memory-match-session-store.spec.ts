import { describe, expect, it } from '@jest/globals';

import type { MatchSession } from '../domain/match-session.js';
import { createInMemoryMatchSessionStore } from './in-memory-match-session-store.js';

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

describe('in-memory match session store', () => {
  it('starts empty and owns an immutable copy of the active session', () => {
    const store = createInMemoryMatchSessionStore();
    const callerSession = createSession('match-01');

    expect(store.getActive()).toBeNull();

    store.replaceActive(callerSession);

    expect(store.getActive()).toEqual(callerSession);
    expect(store.getActive()).not.toBe(callerSession);
    expect(Object.isFrozen(store.getActive())).toBe(true);
  });

  it('releases the previous session reference on replace and clear', () => {
    const store = createInMemoryMatchSessionStore();

    store.replaceActive(createSession('match-01'));
    const previousSession = store.getActive();

    store.replaceActive(createSession('match-02'));

    expect(store.getActive()?.matchId).toBe('match-02');
    expect(store.getActive()).not.toBe(previousSession);

    store.replaceActive(null);

    expect(store.getActive()).toBeNull();
  });
});
