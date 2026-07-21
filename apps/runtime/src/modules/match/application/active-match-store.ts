import type { ActiveMatchState } from '../domain/match-memory.js';

export type ActiveMatchStore = Readonly<{
  getActive: () => ActiveMatchState | null;
  replaceActive: (state: ActiveMatchState | null) => void;
}>;
