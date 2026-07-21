import { describe, expect, it } from '@jest/globals';

import type { LostAdviceMemory } from '../domain/recommendation.js';
import { createInMemoryLostAdviceStore } from './in-memory-lost-advice-store.js';

describe('in-memory Lost advice store', () => {
  it('keeps one latest advice entry per client without cross-client replacement', () => {
    const store = createInMemoryLostAdviceStore();
    const firstInitial = advice({ clientId: 'client-01', score: 40 });
    const firstLatest = advice({ clientId: 'client-01', score: 45, createdAt: 15_000 });
    const second = advice({ clientId: 'client-02', action: 'RESET' });

    store.save(firstInitial);
    store.save(second);
    store.save(firstLatest);

    expect(store.get('client-01')).toEqual(firstLatest);
    expect(store.get('client-02')).toEqual(second);
  });

  it('owns deeply immutable values instead of retaining caller objects', () => {
    const store = createInMemoryLostAdviceStore();
    const callerOwned = advice();

    store.save(callerOwned);

    const stored = store.get('client-01');
    expect(stored).toEqual(callerOwned);
    expect(stored).not.toBe(callerOwned);
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('returns null for a client without previous advice', () => {
    expect(createInMemoryLostAdviceStore().get('unknown-client')).toBeNull();
  });
});

function advice(overrides: Partial<LostAdviceMemory> = {}): LostAdviceMemory {
  return {
    clientId: 'client-01',
    matchId: 'match-01',
    team: 'radiant',
    action: 'FARM_SAFELY',
    score: 40,
    contextKey: 'lost:v1:stable',
    createdAt: 10_000,
    ...overrides,
  };
}
