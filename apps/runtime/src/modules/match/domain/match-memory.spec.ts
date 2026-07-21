import { describe, expect, it } from '@jest/globals';

import { createEmptyHeroMemory, reduceHeroMemory, type HeroMemory } from './hero-memory.js';
import { createEmptyMapMemory, reduceMapMemory } from './map-memory.js';
import type { NormalizedHeroObservation, NormalizedMatchFacts } from './normalized-snapshot.js';

function createMapFacts(overrides: Partial<NormalizedMatchFacts> = {}): NormalizedMatchFacts {
  return {
    matchId: 'match-01',
    gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
    gameTime: 120,
    clockTime: 30,
    paused: false,
    radiantScore: 1,
    direScore: 2,
    ...overrides,
  };
}

describe('map memory', () => {
  it('uses the first source frame as a baseline without fabricating a transition', () => {
    const facts = createMapFacts();

    const memory = reduceMapMemory({
      memory: createEmptyMapMemory(),
      facts,
      receivedAt: 1_000,
      timelineUpdate: 'baseline',
    });

    expect(memory.latest).toEqual(facts);
    expect(memory.transitions).toEqual([]);
  });

  it('stores only lifecycle or score changes from consecutive source frames', () => {
    const baseline = createMapFacts();
    const initialMemory = {
      latest: baseline,
      transitions: [],
    };
    const changed = createMapFacts({ gameTime: 125, radiantScore: 2 });

    const memory = reduceMapMemory({
      memory: initialMemory,
      facts: changed,
      receivedAt: 2_000,
      timelineUpdate: 'delta',
    });

    expect(memory.latest).toEqual(changed);
    expect(memory.transitions).toEqual([
      {
        observedAt: 2_000,
        gameTime: 125,
        previousGameState: baseline.gameState,
        currentGameState: changed.gameState,
        previousRadiantScore: 1,
        currentRadiantScore: 2,
        previousDireScore: 2,
        currentDireScore: 2,
      },
    ]);

    const unchanged = reduceMapMemory({
      memory,
      facts: changed,
      receivedAt: 3_000,
      timelineUpdate: 'delta',
    });

    expect(unchanged.transitions).toHaveLength(1);
  });
});

describe('hero and enemy memory', () => {
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

  it('accumulates stable rosters from all clients but only source frames update enemy timeline', () => {
    const nonSourceMemory = reduceHeroMemory({
      memory: createEmptyHeroMemory(),
      observations: [ally, enemy],
      sessionTeam: 'radiant',
      receivedAt: 1_000,
      timelineUpdate: 'none',
    });

    expect(nonSourceMemory.alliedRoster).toEqual(['npc_dota_hero_invoker']);
    expect(nonSourceMemory.enemyRoster).toEqual(['npc_dota_hero_axe']);
    expect(nonSourceMemory.enemies).toEqual([]);

    const sourceMemory = reduceHeroMemory({
      memory: nonSourceMemory,
      observations: [ally, enemy],
      sessionTeam: 'radiant',
      receivedAt: 1_500,
      timelineUpdate: 'baseline',
    });

    expect(sourceMemory.enemies).toEqual([
      {
        heroName: 'npc_dota_hero_axe',
        firstSeenAt: 1_500,
        lastSeenAt: 1_500,
        lastKnownPosition: { x: 500, y: 600 },
        sourceVisible: true,
      },
    ]);
  });

  it('marks a previously observed enemy missing only when a usable source minimap frame exists', () => {
    const memory: HeroMemory = {
      alliedRoster: ['npc_dota_hero_invoker'],
      enemyRoster: ['npc_dota_hero_axe'],
      enemies: [
        {
          heroName: 'npc_dota_hero_axe',
          firstSeenAt: 1_000,
          lastSeenAt: 1_000,
          lastKnownPosition: { x: 500, y: 600 },
          sourceVisible: true,
        },
      ],
      ambiguousEnemyHeroNames: [],
    };

    const missing = reduceHeroMemory({
      memory,
      observations: [ally],
      sessionTeam: 'radiant',
      receivedAt: 2_000,
      timelineUpdate: 'delta',
    });

    expect(missing.enemies[0]?.sourceVisible).toBe(false);

    const absentSection = reduceHeroMemory({
      memory,
      observations: [],
      sessionTeam: 'radiant',
      receivedAt: 2_000,
      timelineUpdate: 'delta',
    });

    expect(absentSection).toEqual(memory);
  });

  it('deduplicates roster names and ignores ambiguous duplicate positions', () => {
    const duplicateEnemy = { ...enemy, position: { x: 700, y: 800 } };
    const memory = reduceHeroMemory({
      memory: createEmptyHeroMemory(),
      observations: [enemy, duplicateEnemy],
      sessionTeam: 'radiant',
      receivedAt: 1_000,
      timelineUpdate: 'baseline',
    });

    expect(memory.enemyRoster).toEqual(['npc_dota_hero_axe']);
    expect(memory.enemies).toEqual([]);
    expect(memory.ambiguousEnemyHeroNames).toEqual(['npc_dota_hero_axe']);
  });
});
