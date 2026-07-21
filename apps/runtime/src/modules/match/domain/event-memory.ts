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

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  const record = value as Readonly<Record<string, unknown>>;
  const properties = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);

  return `{${properties.join(',')}}`;
}

function freezeEvent(event: NormalizedMatchEvent): NormalizedMatchEvent {
  if (event.type === 'generic_event') {
    return Object.freeze({ ...event, data: Object.freeze({ ...event.data }) });
  }

  return Object.freeze({ ...event });
}

export function reduceEventMemory(input: ReduceEventMemoryInput): EventMemory {
  const eventsByFingerprint = new Map(input.memory.map((entry) => [entry.fingerprint, entry]));

  for (const event of input.events) {
    const fingerprint = canonicalize(event);

    if (eventsByFingerprint.has(fingerprint)) {
      continue;
    }

    eventsByFingerprint.set(
      fingerprint,
      Object.freeze({ fingerprint, event: freezeEvent(event), firstReceivedAt: input.receivedAt })
    );
  }

  const memory = [...eventsByFingerprint.values()];
  memory.sort((left, right) => {
    const leftTime = left.event.gameTime ?? Number.POSITIVE_INFINITY;
    const rightTime = right.event.gameTime ?? Number.POSITIVE_INFINITY;

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.fingerprint.localeCompare(right.fingerprint);
  });

  return Object.freeze(memory);
}
