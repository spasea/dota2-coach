import { describe, expect, it, jest } from '@jest/globals';

import { createInMemoryActiveMatchStore } from '../infrastructure/in-memory-active-match-store.js';
import { createInMemoryNormalizedLatestStateStore } from '../infrastructure/in-memory-normalized-latest-state-store.js';
import { createNormalizedClientState } from '../domain/match-memory.spec-fixtures.js';
import type {
  NormalizedBuildingObservation,
  NormalizedHeroObservation,
  NormalizedMatchEvent,
} from '../domain/normalized-snapshot.js';
import { createRecordClientSnapshot } from './record-client-snapshot.js';

const ally: NormalizedHeroObservation = {
  heroName: 'npc_dota_hero_invoker',
  team: 'radiant',
  position: { x: 100, y: 200 },
  markerKind: 'self',
};
const enemy: NormalizedHeroObservation = {
  heroName: 'npc_dota_hero_axe',
  team: 'dire',
  position: { x: 500, y: 600 },
  markerKind: 'enemy',
};
const building: NormalizedBuildingObservation = {
  buildingId: 'radiant_tower1_mid',
  team: 'radiant',
  health: 1_600,
  maxHealth: 1_800,
};
const event: NormalizedMatchEvent = {
  type: 'roshan_killed',
  gameTime: 120,
  killedByTeam: 'radiant',
  killerPlayerId: 1,
};

describe('record client snapshot memory routing', () => {
  it('accepts all-client facts while protecting source-only temporal reducers', () => {
    const source = createNormalizedClientState({ clientId: 'client-01' });
    const teammate = createNormalizedClientState({ clientId: 'client-02' });
    const activeMatchStore = createInMemoryActiveMatchStore();
    const receivedTimes = [1_000, 1_500, 2_000, 3_000];
    const recordSnapshot = createRecordClientSnapshot({
      activeMatchStore,
      freshnessMs: 5_000,
      latestStateStore: createInMemoryNormalizedLatestStateStore(),
      logLifecycleTransition: jest.fn(),
      monotonicNow: () => receivedTimes.shift() ?? 3_000,
      playerHistoryRetentionMs: 90_000,
    });

    recordSnapshot({
      identity: source.identity,
      snapshot: { ...source.snapshot, minimapHeroes: [ally, enemy], buildings: [building], events: [event] },
    });
    recordSnapshot({
      identity: teammate.identity,
      snapshot: {
        ...teammate.snapshot,
        minimapHeroes: [ally, { ...enemy, position: { x: 700, y: 800 } }],
        buildings: [{ ...building, health: 1_200 }],
        events: [event],
      },
    });

    const afterTeammate = activeMatchStore.getActive();

    expect(afterTeammate?.memory.buildings[0]?.currentHealth).toBe(1_600);
    expect(afterTeammate?.memory.heroes.enemies[0]).toMatchObject({
      lastSeenAt: 1_000,
      lastKnownPosition: { x: 500, y: 600 },
      sourceVisible: true,
    });
    expect(afterTeammate?.memory.playerHistories.map((history) => history.clientId)).toEqual([
      'client-01',
      'client-02',
    ]);
    expect(afterTeammate?.memory.events).toHaveLength(1);

    const sourceDelta = {
      ...source.snapshot,
      minimapHeroes: [ally],
      buildings: [{ ...building, health: 1_300 }],
      events: [event],
    };
    recordSnapshot({ identity: source.identity, snapshot: sourceDelta });
    recordSnapshot({ identity: source.identity, snapshot: sourceDelta });

    const memory = activeMatchStore.getActive()?.memory;

    expect(memory?.heroes.enemies[0]).toMatchObject({ lastSeenAt: 1_000, sourceVisible: false });
    expect(memory?.buildings[0]).toMatchObject({ currentHealth: 1_300, lastDamageAt: 2_000 });
    expect(memory?.buildings[0]?.events).toHaveLength(1);
    expect(memory?.events).toHaveLength(1);
    expect(memory?.playerHistories.find((history) => history.clientId === 'client-01')?.samples).toHaveLength(3);
  });

  it('replaces memory and role overrides together on source rollover', () => {
    const source = createNormalizedClientState({ clientId: 'client-01' });
    const activeMatchStore = createInMemoryActiveMatchStore();
    const receivedTimes = [1_000, 2_000];
    const recordSnapshot = createRecordClientSnapshot({
      activeMatchStore,
      freshnessMs: 5_000,
      latestStateStore: createInMemoryNormalizedLatestStateStore(),
      logLifecycleTransition: jest.fn(),
      monotonicNow: () => receivedTimes.shift() ?? 2_000,
      playerHistoryRetentionMs: 90_000,
    });

    recordSnapshot({ identity: source.identity, snapshot: source.snapshot });

    const initial = activeMatchStore.getActive();

    if (initial === null) {
      throw new Error('Expected the first source snapshot to create an active match.');
    }

    activeMatchStore.replaceActive({
      ...initial,
      roleOverrides: [{ clientId: source.identity.clientId, role: 4 }],
    });
    recordSnapshot({
      identity: source.identity,
      snapshot: {
        ...source.snapshot,
        match: source.snapshot.match && { ...source.snapshot.match, matchId: 'match-02' },
      },
    });

    expect(activeMatchStore.getActive()?.session.matchId).toBe('match-02');
    expect(activeMatchStore.getActive()?.memory.matchId).toBe('match-02');
    expect(activeMatchStore.getActive()?.roleOverrides).toEqual([]);
  });

  it('rebaselines returning source streams without interpreting the freshness gap', () => {
    const source = createNormalizedClientState({ clientId: 'client-01' });
    const activeMatchStore = createInMemoryActiveMatchStore();
    const receivedTimes = [1_000, 6_000];
    const recordSnapshot = createRecordClientSnapshot({
      activeMatchStore,
      freshnessMs: 5_000,
      latestStateStore: createInMemoryNormalizedLatestStateStore(),
      logLifecycleTransition: jest.fn(),
      monotonicNow: () => receivedTimes.shift() ?? 6_000,
      playerHistoryRetentionMs: 90_000,
    });

    recordSnapshot({
      identity: source.identity,
      snapshot: { ...source.snapshot, minimapHeroes: [ally, enemy], buildings: [building] },
    });
    recordSnapshot({
      identity: source.identity,
      snapshot: {
        ...source.snapshot,
        match: source.snapshot.match && { ...source.snapshot.match, radiantScore: 10 },
        minimapHeroes: [ally],
        buildings: [{ ...building, health: 1_000 }],
      },
    });

    const activeState = activeMatchStore.getActive();

    expect(activeState?.session.timelineStatus).toBe('rebaselining');
    expect(activeState?.memory.map.transitions).toEqual([]);
    expect(activeState?.memory.buildings[0]).toMatchObject({ currentHealth: 1_000, events: [] });
    expect(activeState?.memory.heroes.enemies[0]).toMatchObject({
      lastSeenAt: 1_000,
      sourceVisible: true,
    });
    expect(activeState?.memory.playerHistories[0]?.samples).toHaveLength(1);
  });
});
