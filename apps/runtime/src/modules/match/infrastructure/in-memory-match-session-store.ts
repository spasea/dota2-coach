import type { MatchSessionStore } from '../application/match-session-store.js';
import type { MatchSession } from '../domain/match-session.js';

export function createInMemoryMatchSessionStore(): MatchSessionStore {
  let activeSession: MatchSession | null = null;

  return Object.freeze({
    getActive: () => activeSession,
    replaceActive: (session: MatchSession | null) => {
      activeSession = session === null ? null : Object.freeze(structuredClone(session));
    },
  });
}
