import type { ActiveMatchStore } from '../application/active-match-store.js';
import type { ActiveMatchState } from '../domain/match-memory.js';

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

export function createInMemoryActiveMatchStore(): ActiveMatchStore {
  let activeState: ActiveMatchState | null = null;

  return Object.freeze({
    getActive: () => activeState,
    replaceActive: (state: ActiveMatchState | null) => {
      if (state === null) {
        activeState = null;
        return;
      }

      const ownedState = structuredClone(state);
      activeState = deepFreeze(ownedState);
    },
  });
}
