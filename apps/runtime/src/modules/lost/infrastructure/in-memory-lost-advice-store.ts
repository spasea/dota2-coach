import type { LostAdviceStore } from '../application/lost-advice-store.js';

export function createInMemoryLostAdviceStore(): LostAdviceStore {
  return Object.freeze({
    get: (clientId) => {
      void clientId;
      throw new Error('Lost advice-memory reads are not implemented.');
    },
    save: (memory) => {
      void memory;
      throw new Error('Lost advice-memory writes are not implemented.');
    },
  });
}
