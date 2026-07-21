import type { NormalizedLatestStateStore } from '../application/normalized-latest-state-store.js';
import type { NormalizedClientState } from '../domain/normalized-client-state.js';

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

export function createInMemoryNormalizedLatestStateStore(): NormalizedLatestStateStore {
  const latestStateByClientId = new Map<string, NormalizedClientState>();

  return Object.freeze({
    getLatest: (clientId: string) => latestStateByClientId.get(clientId) ?? null,
    save: (state: NormalizedClientState) => {
      const ownedState = structuredClone(state);
      deepFreeze(ownedState);
      latestStateByClientId.set(ownedState.identity.clientId, ownedState);
    },
  });
}
