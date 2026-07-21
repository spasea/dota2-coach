import type { NormalizedClientState } from '../domain/normalized-client-state.js';

export type NormalizedLatestStateStore = Readonly<{
  getAll: () => readonly NormalizedClientState[];
  getLatest: (clientId: string) => NormalizedClientState | null;
  save: (state: NormalizedClientState) => void;
}>;
