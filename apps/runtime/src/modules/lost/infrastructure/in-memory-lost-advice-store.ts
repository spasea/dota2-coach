import type { LostAdviceStore } from '../application/lost-advice-store.js';
import type { LostAdviceMemory } from '../domain/recommendation.js';

export function createInMemoryLostAdviceStore(): LostAdviceStore {
  const entries = new Map<string, LostAdviceMemory>();

  return Object.freeze({
    get: (clientId) => entries.get(clientId) ?? null,
    save: (memory) => {
      entries.set(memory.clientId, Object.freeze({ ...memory }));
    },
  });
}
