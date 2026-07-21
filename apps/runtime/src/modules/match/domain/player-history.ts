import type { NormalizedClientState } from './normalized-client-state.js';
import type { Position } from './normalized-snapshot.js';

export type PlayerTemporalSample = Readonly<{
  receivedAt: number;
  gameTime: number;
  position: Position;
  alive: boolean;
  healthPercent: number;
  manaPercent: number;
  level: number;
  xp: number;
  gold: number;
  lastHits: number;
  denies: number;
  gpm: number;
  xpm: number;
  goldFromHeroKills: number;
  goldFromCreepKills: number;
  goldFromIncome: number;
  goldFromShared: number;
}>;

export type PlayerHistory = Readonly<{
  clientId: string;
  lastUsableReceivedAt: number;
  samples: readonly PlayerTemporalSample[];
}>;

export type PlayerHistoryMemory = readonly PlayerHistory[];

export type ReducePlayerHistoryInput = Readonly<{
  memory: PlayerHistoryMemory;
  state: NormalizedClientState;
  freshnessMs: number;
  retentionMs: number;
}>;

export function reducePlayerHistory(input: ReducePlayerHistoryInput): PlayerHistoryMemory {
  return input.memory;
}
