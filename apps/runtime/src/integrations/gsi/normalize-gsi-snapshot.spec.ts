import { describe, expect, it } from '@jest/globals';

import {
  fullGsiSnapshot,
  heartbeatGsiSnapshot,
  malformedNestedGsiSnapshot,
} from './normalize-gsi-snapshot.fixtures.js';
import { normalizeGsiSnapshot } from './normalize-gsi-snapshot.js';

describe('GSI snapshot normalization', () => {
  it('normalizes a heartbeat into explicit absence without inventing match facts', () => {
    const normalized = normalizeGsiSnapshot(heartbeatGsiSnapshot);

    expect(normalized).toEqual({
      sourceTimestampSeconds: 1_784_393_633,
      match: null,
      player: null,
      hero: null,
      minimapHeroes: [],
      buildings: [],
      events: [],
    });
  });

  it('maps the approved current-state facts and all supported non-chat event envelopes', () => {
    const normalized = normalizeGsiSnapshot(fullGsiSnapshot);

    expect(normalized.sourceTimestampSeconds).toBe(1_784_393_945);
    expect(normalized.match).toEqual({
      matchId: '8902657168',
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      gameTime: 129,
      clockTime: 0,
      paused: false,
      radiantScore: 0,
      direScore: 0,
    });
    expect(normalized.player).toEqual({
      team: 'radiant',
      teamSlot: 4,
      gold: 117,
      lastHits: 0,
      denies: 0,
      gpm: 10_442,
      xpm: 0,
      goldFromHeroKills: 0,
      goldFromCreepKills: 0,
      goldFromIncome: 2,
      goldFromShared: 0,
    });
    expect(normalized.hero).toEqual({
      heroName: 'npc_dota_hero_invoker',
      position: { x: 427, y: -1_838 },
      alive: true,
      healthPercent: 100,
      manaPercent: 100,
      level: 1,
      xp: 0,
    });
    expect(normalized.minimapHeroes).toEqual([
      {
        heroName: 'npc_dota_hero_invoker',
        team: 'radiant',
        position: { x: 427, y: -1_838 },
        markerKind: 'self',
      },
      {
        heroName: 'npc_dota_hero_windrunner',
        team: 'dire',
        position: { x: 1_920, y: 2_560 },
        markerKind: 'standard',
      },
      {
        heroName: 'npc_dota_hero_windrunner',
        team: 'dire',
        position: { x: 1_944, y: 2_544 },
        markerKind: 'enemy',
      },
    ]);
    expect(normalized.buildings).toEqual([
      {
        buildingId: 'dota_goodguys_tower1_top',
        team: 'radiant',
        health: 1_800,
        maxHealth: 1_800,
      },
      {
        buildingId: 'dota_goodguys_tower2_top',
        team: 'radiant',
        health: 2_500,
        maxHealth: 2_500,
      },
    ]);
    expect(normalized.events).toEqual([
      {
        type: 'generic_event',
        gameTime: 28,
        data: {
          eventType: 'CHAT_MESSAGE_ITEM_PURCHASE',
          time: -41.666_664_1,
          value: 42,
          value2: null,
          value3: null,
          playerId1: 3,
          playerId2: -1,
          playerId3: null,
          playerId4: null,
          playerId5: null,
          playerId6: null,
        },
      },
      {
        type: 'bounty_rune_pickup',
        gameTime: 129,
        playerId: 3,
        team: 'radiant',
        bountyValue: 40,
        teamGold: 200,
      },
      {
        type: 'roshan_killed',
        gameTime: 1_508,
        killedByTeam: 'dire',
        killerPlayerId: 9,
      },
      {
        type: 'aegis_picked_up',
        gameTime: 1_509,
        playerId: 5,
        snatched: false,
      },
    ]);
  });

  it('uses null for invalid scalars without coercion and discards unsafe events', () => {
    const normalized = normalizeGsiSnapshot(malformedNestedGsiSnapshot);

    expect(normalized.sourceTimestampSeconds).toBeNull();
    expect(normalized.match).toEqual({
      matchId: '8902657168',
      gameState: null,
      gameTime: null,
      clockTime: null,
      paused: null,
      radiantScore: null,
      direScore: null,
    });
    expect(normalized.player).toEqual({
      team: 'radiant',
      teamSlot: null,
      gold: 117,
      lastHits: null,
      denies: null,
      gpm: null,
      xpm: null,
      goldFromHeroKills: null,
      goldFromCreepKills: null,
      goldFromIncome: null,
      goldFromShared: null,
    });
    expect(normalized.hero).toEqual({
      heroName: 'npc_dota_hero_invoker',
      position: null,
      alive: null,
      healthPercent: 100,
      manaPercent: null,
      level: 1,
      xp: null,
    });
    expect(normalized.events).toEqual([]);
  });

  it('returns deeply immutable normalized state', () => {
    const normalized = normalizeGsiSnapshot(fullGsiSnapshot);

    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.match)).toBe(true);
    expect(Object.isFrozen(normalized.minimapHeroes)).toBe(true);
    expect(Object.isFrozen(normalized.minimapHeroes[0])).toBe(true);
    expect(Object.isFrozen(normalized.events)).toBe(true);
    expect(Object.isFrozen(normalized.events[0])).toBe(true);
  });
});
