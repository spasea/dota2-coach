import type { MatchSession } from '../domain/match-session.js';

export type MatchSessionStore = Readonly<{
  getActive: () => MatchSession | null;
  replaceActive: (session: MatchSession | null) => void;
}>;
