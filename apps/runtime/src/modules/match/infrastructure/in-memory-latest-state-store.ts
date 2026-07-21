import type { LatestStateStore } from '../application/latest-state-store.js';
import type { LatestClientState } from '../domain/latest-client-state.js';

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }

  Object.freeze(value);

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
}

export function createInMemoryLatestStateStore(): LatestStateStore {
  const latestStateByClientId = new Map<string, LatestClientState>();

  return Object.freeze({
    getLatest: (clientId: string) => latestStateByClientId.get(clientId) ?? null,
    save: (state: LatestClientState) => {
      const ownedState = structuredClone(state);
      deepFreeze(ownedState);
      latestStateByClientId.set(ownedState.identity.clientId, ownedState);
    },
  });
}
