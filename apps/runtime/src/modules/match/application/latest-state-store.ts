import type { LatestClientState } from '../domain/latest-client-state.js';

export type LatestStateStore = Readonly<{
  getLatest: (clientId: string) => LatestClientState | null;
  save: (state: LatestClientState) => void;
}>;
