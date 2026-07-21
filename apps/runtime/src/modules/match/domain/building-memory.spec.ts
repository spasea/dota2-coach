import { describe, expect, it } from '@jest/globals';

import {
  readBuildingPressure,
  reduceBuildingMemory,
  type BuildingMemory,
  type BuildingTemporalState,
} from './building-memory.js';

const building = {
  buildingId: 'radiant_tower1_mid',
  team: 'radiant' as const,
  health: 1_600,
  maxHealth: 1_800,
};

describe('building memory', () => {
  it('baselines the first source frame and stores only later health loss as damage', () => {
    const baseline = reduceBuildingMemory({
      memory: [],
      observations: [building],
      receivedAt: 1_000,
      gameTime: 120,
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      timelineUpdate: 'baseline',
    });

    expect(baseline).toEqual([
      {
        buildingId: building.buildingId,
        currentHealth: 1_600,
        maxHealth: 1_800,
        lastObservedAt: 1_000,
        lastDamageAt: null,
        destroyedAt: null,
        events: [],
      },
    ]);

    const damaged = reduceBuildingMemory({
      memory: baseline,
      observations: [{ ...building, health: 1_300 }],
      receivedAt: 2_000,
      gameTime: 121,
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      timelineUpdate: 'delta',
    });

    expect(damaged[0]).toMatchObject({ currentHealth: 1_300, lastDamageAt: 2_000 });
    expect(damaged[0]?.events).toEqual([
      {
        buildingId: building.buildingId,
        observedAt: 2_000,
        gameTime: 121,
        previousHealth: 1_600,
        currentHealth: 1_300,
        maxHealth: 1_800,
        damage: 300,
        damagePercent: 300 / 1_800,
      },
    ]);
  });

  it('updates the baseline on health increase without creating pressure', () => {
    const memory: BuildingMemory = [createBuildingState()];

    const increased = reduceBuildingMemory({
      memory,
      observations: [{ ...building, health: 1_700 }],
      receivedAt: 2_000,
      gameTime: 121,
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      timelineUpdate: 'delta',
    });

    expect(increased[0]).toMatchObject({ currentHealth: 1_700, lastObservedAt: 2_000, events: [] });
  });

  it('does not treat missing or post-game building sections as destruction', () => {
    const memory: BuildingMemory = [createBuildingState()];

    const afterMissing = reduceBuildingMemory({
      memory,
      observations: [],
      receivedAt: 2_000,
      gameTime: 121,
      gameState: 'DOTA_GAMERULES_STATE_POST_GAME',
      timelineUpdate: 'delta',
    });

    expect(afterMissing).toEqual(memory);
    expect(afterMissing[0]?.destroyedAt).toBeNull();
  });

  it('uses half-open 6/15/30-second damage windows', () => {
    const now = 40_000;
    const state: BuildingTemporalState = {
      ...createBuildingState(),
      currentHealth: 1_500,
      events: [
        createDamageEvent(now - 5_999, 1),
        createDamageEvent(now - 6_000, 2),
        createDamageEvent(now - 14_999, 3),
        createDamageEvent(now - 15_000, 4),
        createDamageEvent(now - 29_999, 5),
        createDamageEvent(now - 30_000, 6),
      ],
    };

    const pressure = readBuildingPressure({
      memory: [state],
      now,
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      timelineStatus: 'healthy',
      windows: { activeDamageMs: 6_000, recentDamageMs: 15_000, pressureMs: 30_000 },
    });

    expect(pressure).toEqual({
      status: 'available',
      value: [
        {
          buildingId: building.buildingId,
          currentHealth: 1_500,
          maxHealth: 1_800,
          activeDamage: 1,
          recentDamage: 6,
          pressureDamage: 15,
        },
      ],
    });
  });

  it('makes current pressure unavailable for stale and rebaselining timelines', () => {
    const memory: BuildingMemory = [createBuildingState()];
    const input = {
      memory,
      now: 2_000,
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      windows: { activeDamageMs: 6_000, recentDamageMs: 15_000, pressureMs: 30_000 },
    };

    expect(readBuildingPressure({ ...input, timelineStatus: 'stale' })).toEqual({
      status: 'unavailable',
      reason: 'timeline_stale',
    });
    expect(readBuildingPressure({ ...input, timelineStatus: 'rebaselining' })).toEqual({
      status: 'unavailable',
      reason: 'timeline_rebaselining',
    });
  });
});

function createBuildingState(): BuildingTemporalState {
  return {
    buildingId: building.buildingId,
    currentHealth: 1_600,
    maxHealth: 1_800,
    lastObservedAt: 1_000,
    lastDamageAt: null,
    destroyedAt: null,
    events: [],
  };
}

function createDamageEvent(observedAt: number, damage: number) {
  return {
    buildingId: building.buildingId,
    observedAt,
    gameTime: 120,
    previousHealth: 1_800,
    currentHealth: 1_800 - damage,
    maxHealth: 1_800,
    damage,
    damagePercent: damage / 1_800,
  };
}
