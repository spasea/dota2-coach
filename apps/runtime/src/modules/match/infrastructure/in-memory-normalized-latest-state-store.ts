import type { NormalizedLatestStateStore } from '../application/normalized-latest-state-store.js';

export function createInMemoryNormalizedLatestStateStore(): NormalizedLatestStateStore {
  return Object.freeze({
    getLatest: () => null,
    save: () => undefined,
  });
}
