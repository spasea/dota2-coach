import { describe, expect, it } from '@jest/globals';

import { reduceEventMemory } from './event-memory.js';
import type { NormalizedGenericEvent, NormalizedGenericEventData } from './normalized-snapshot.js';

function createEvent(gameTime: number, data: NormalizedGenericEventData): NormalizedGenericEvent {
  return { type: 'generic_event', gameTime, data };
}

const eventData: NormalizedGenericEventData = {
  eventType: 'hero_kill',
  time: 100,
  value: 1,
  value2: null,
  value3: null,
  playerId1: 1,
  playerId2: 6,
  playerId3: null,
  playerId4: null,
  playerId5: null,
  playerId6: null,
};

describe('event memory', () => {
  it('deduplicates sliding-window and cross-client repeats by canonical normalized facts', () => {
    const event = createEvent(100, eventData);
    const first = reduceEventMemory({ memory: [], events: [event, event], receivedAt: 1_000 });
    const repeated = reduceEventMemory({
      memory: first,
      events: [
        createEvent(100, {
          playerId6: null,
          playerId5: null,
          playerId4: null,
          playerId3: null,
          playerId2: 6,
          playerId1: 1,
          value3: null,
          value2: null,
          value: 1,
          time: 100,
          eventType: 'hero_kill',
        }),
      ],
      receivedAt: 2_000,
    });

    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toMatchObject({ event, firstReceivedAt: 1_000 });
    expect(repeated[0]?.fingerprint).toEqual(expect.any(String));
    expect(repeated[0]?.fingerprint).not.toBe('');
  });

  it('keeps meaningfully different events in deterministic logical-time order', () => {
    const later = createEvent(110, { ...eventData, time: 110, value: 2 });
    const earlier = createEvent(100, eventData);

    const memory = reduceEventMemory({ memory: [], events: [later, earlier], receivedAt: 1_000 });

    expect(memory.map((entry) => entry.event.gameTime)).toEqual([100, 110]);
    expect(memory).toHaveLength(2);
  });
});
