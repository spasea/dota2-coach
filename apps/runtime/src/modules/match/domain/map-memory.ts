import type { TimelineUpdate } from './match-session.js';
import type { NormalizedMatchFacts } from './normalized-snapshot.js';

export type MapTransition = Readonly<{
  observedAt: number;
  gameTime: number | null;
  previousGameState: string | null;
  currentGameState: string | null;
  previousRadiantScore: number | null;
  currentRadiantScore: number | null;
  previousDireScore: number | null;
  currentDireScore: number | null;
}>;

export type MapMemory = Readonly<{
  latest: NormalizedMatchFacts | null;
  transitions: readonly MapTransition[];
}>;

export type ReduceMapMemoryInput = Readonly<{
  memory: MapMemory;
  facts: NormalizedMatchFacts | null;
  receivedAt: number;
  timelineUpdate: TimelineUpdate;
}>;

export function createEmptyMapMemory(): MapMemory {
  return Object.freeze({ latest: null, transitions: Object.freeze([]) });
}

export function reduceMapMemory(input: ReduceMapMemoryInput): MapMemory {
  return input.memory;
}
