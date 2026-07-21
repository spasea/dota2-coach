import type { NormalizedMatchEvent } from './normalized-snapshot.js';

export type MatchEventMemory = Readonly<{
  fingerprint: string;
  event: NormalizedMatchEvent;
  firstReceivedAt: number;
}>;

export type EventMemory = readonly MatchEventMemory[];

export type ReduceEventMemoryInput = Readonly<{
  memory: EventMemory;
  events: readonly NormalizedMatchEvent[];
  receivedAt: number;
}>;

export function reduceEventMemory(input: ReduceEventMemoryInput): EventMemory {
  return input.memory;
}
