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
  if (input.timelineUpdate === 'none' || input.facts === null) {
    return input.memory;
  }

  const latest = Object.freeze({ ...input.facts });
  const previous = input.memory.latest;

  if (input.timelineUpdate === 'baseline' || previous === null) {
    return Object.freeze({ latest, transitions: input.memory.transitions });
  }

  const changed =
    previous.gameState !== latest.gameState ||
    previous.radiantScore !== latest.radiantScore ||
    previous.direScore !== latest.direScore;

  if (!changed) {
    return Object.freeze({ latest, transitions: input.memory.transitions });
  }

  const transition: MapTransition = Object.freeze({
    observedAt: input.receivedAt,
    gameTime: latest.gameTime,
    previousGameState: previous.gameState,
    currentGameState: latest.gameState,
    previousRadiantScore: previous.radiantScore,
    currentRadiantScore: latest.radiantScore,
    previousDireScore: previous.direScore,
    currentDireScore: latest.direScore,
  });

  return Object.freeze({
    latest,
    transitions: Object.freeze([...input.memory.transitions, transition]),
  });
}
