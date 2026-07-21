import { describe, expect, it } from '@jest/globals';

import { createNormalizedClientState } from './match-memory.spec-fixtures.js';
import { reducePlayerHistory, type PlayerHistory, type PlayerTemporalSample } from './player-history.js';

function createSample(receivedAt: number): PlayerTemporalSample {
  return {
    receivedAt,
    gameTime: 120,
    position: { x: 100, y: 200 },
    alive: true,
    healthPercent: 75,
    manaPercent: 60,
    level: 10,
    xp: 5_000,
    gold: 1_500,
    lastHits: 50,
    denies: 5,
    gpm: 500,
    xpm: 600,
    goldFromHeroKills: 300,
    goldFromCreepKills: 1_000,
    goldFromIncome: 500,
    goldFromShared: 100,
  };
}

describe('player history', () => {
  it('stores a real-field-only baseline sample for each client', () => {
    const state = createNormalizedClientState({ clientId: 'client-01', receivedAt: 1_000 });

    const memory = reducePlayerHistory({
      memory: [],
      state,
      freshnessMs: 5_000,
      retentionMs: 90_000,
    });

    expect(memory).toEqual([
      {
        clientId: 'client-01',
        lastUsableReceivedAt: 1_000,
        samples: [createSample(1_000)],
      },
    ]);
  });

  it('does not fabricate a temporal sample when one required field is absent', () => {
    const completeState = createNormalizedClientState();
    const partialState = {
      ...completeState,
      snapshot: {
        ...completeState.snapshot,
        player: completeState.snapshot.player && {
          ...completeState.snapshot.player,
          gpm: null,
        },
      },
    };

    const memory = reducePlayerHistory({
      memory: [],
      state: partialState,
      freshnessMs: 5_000,
      retentionMs: 90_000,
    });

    expect(memory).toEqual([]);
  });

  it('uses a half-open 90-second retention window', () => {
    const history: PlayerHistory = {
      clientId: 'client-01',
      lastUsableReceivedAt: 99_000,
      samples: [createSample(10_000), createSample(10_001), createSample(99_000)],
    };
    const state = createNormalizedClientState({ clientId: 'client-01', receivedAt: 100_000 });

    const memory = reducePlayerHistory({
      memory: [history],
      state,
      freshnessMs: 5_000,
      retentionMs: 90_000,
    });

    expect(memory[0]?.samples.map((sample) => sample.receivedAt)).toEqual([10_001, 99_000, 100_000]);
  });

  it('rebaselines one returning client at the exact freshness boundary without a gap trend', () => {
    const history: PlayerHistory = {
      clientId: 'client-01',
      lastUsableReceivedAt: 1_000,
      samples: [createSample(1_000)],
    };
    const state = createNormalizedClientState({ clientId: 'client-01', receivedAt: 6_000 });

    const memory = reducePlayerHistory({
      memory: [history],
      state,
      freshnessMs: 5_000,
      retentionMs: 90_000,
    });

    expect(memory).toEqual([
      {
        clientId: 'client-01',
        lastUsableReceivedAt: 6_000,
        samples: [createSample(6_000)],
      },
    ]);
  });
});
