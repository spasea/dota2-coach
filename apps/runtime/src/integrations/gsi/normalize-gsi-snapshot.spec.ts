import { describe, expect, it } from '@jest/globals';

import {
  fullGsiSnapshot,
  heartbeatGsiSnapshot,
  lostContextGsiSnapshot,
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
      minimapStructures: [],
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
      respawnSeconds: null,
      buybackCost: null,
      buybackCooldown: null,
      healthPercent: 100,
      manaPercent: 100,
      level: 1,
      xp: 0,
      status: {
        stunned: null,
        silenced: null,
        hexed: null,
        muted: null,
        disarmed: null,
      },
      teleportReadiness: { status: 'unknown' },
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
        buildingId: 'radiant:tower:1:top',
        structureId: 'radiant:tower:1:top',
        team: 'radiant',
        health: 1_800,
        maxHealth: 1_800,
      },
      {
        buildingId: 'radiant:tower:2:top',
        structureId: 'radiant:tower:2:top',
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
      respawnSeconds: null,
      buybackCost: null,
      buybackCooldown: null,
      healthPercent: 100,
      manaPercent: null,
      level: 1,
      xp: null,
      status: {
        stunned: null,
        silenced: null,
        hexed: null,
        muted: null,
        disarmed: null,
      },
      teleportReadiness: { status: 'unknown' },
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

  it('normalizes the approved requester readiness facts and ignores can_cast for TP readiness', () => {
    const normalized = normalizeGsiSnapshot(lostContextGsiSnapshot);

    expect(normalized.hero).toEqual({
      heroName: 'npc_dota_hero_lich',
      position: { x: 4_859, y: -6_379 },
      alive: true,
      respawnSeconds: 0,
      buybackCost: 1_506,
      buybackCooldown: 0,
      healthPercent: 78,
      manaPercent: 61,
      level: 14,
      xp: 12_400,
      status: {
        stunned: false,
        silenced: true,
        hexed: false,
        muted: false,
        disarmed: true,
      },
      teleportReadiness: { status: 'ready' },
    });
  });

  it('retains a hero fact set when only newly approved current facts are available', () => {
    const normalized = normalizeGsiSnapshot({
      hero: { stunned: true },
    });

    expect(normalized.hero).toMatchObject({
      heroName: null,
      status: { stunned: true },
      teleportReadiness: { status: 'unknown' },
    });
  });

  it.each([
    ['missing items section', {}, 'unknown'],
    ['valid empty teleport slot', { items: {} }, 'unavailable'],
    [
      'scroll on cooldown',
      { items: { teleport0: { name: 'item_tpscroll', cooldown: 8, item_charges: 1, charges: 1 } } },
      'unavailable',
    ],
    ['Travel Boots in teleport slot', { items: { teleport0: { name: 'item_travel_boots' } } }, 'unavailable'],
    [
      'scroll with fallback charges',
      { items: { teleport0: { name: 'item_tpscroll', cooldown: 0, charges: 2 } } },
      'ready',
    ],
    [
      'scroll with incomplete readiness facts',
      { items: { teleport0: { name: 'item_tpscroll', cooldown: 0 } } },
      'unknown',
    ],
    [
      'mismatched charge fields',
      { items: { teleport0: { name: 'item_tpscroll', cooldown: 0, item_charges: 1, charges: 2 } } },
      'unknown',
    ],
  ] as const)('maps %s to explicit TP readiness', (_caseName, snapshot, expectedStatus) => {
    const normalized = normalizeGsiSnapshot({
      hero: { name: 'npc_dota_hero_lich' },
      ...snapshot,
    });

    expect(normalized.hero?.teleportReadiness.status).toBe(expectedStatus);
  });

  it('normalizes semantic building identities and current structure areas for both teams', () => {
    const normalized = normalizeGsiSnapshot(lostContextGsiSnapshot);

    expect(normalized.buildings).toEqual([
      {
        buildingId: 'radiant:ancient',
        structureId: 'radiant:ancient',
        team: 'radiant',
        health: 4_500,
        maxHealth: 4_500,
      },
      {
        buildingId: 'radiant:barracks:melee:mid',
        structureId: 'radiant:barracks:melee:mid',
        team: 'radiant',
        health: 1_700,
        maxHealth: 2_200,
      },
      {
        buildingId: 'radiant:tower:1:top',
        structureId: 'radiant:tower:1:top',
        team: 'radiant',
        health: 1_200,
        maxHealth: 1_800,
      },
      {
        buildingId: 'radiant:tower:4:bot',
        structureId: 'radiant:tower:4',
        team: 'radiant',
        health: 2_300,
        maxHealth: 2_600,
      },
      {
        buildingId: 'radiant:tower:4:top',
        structureId: 'radiant:tower:4',
        team: 'radiant',
        health: 2_100,
        maxHealth: 2_600,
      },
    ]);
    expect(normalized.minimapStructures).toEqual([
      {
        structureId: 'dire:tower:2:bot',
        team: 'dire',
        kind: 'tower',
        tier: 2,
        positions: [{ x: 6_400, y: 384 }],
      },
      {
        structureId: 'radiant:ancient',
        team: 'radiant',
        kind: 'ancient',
        tier: null,
        positions: [{ x: -5_920, y: -5_352 }],
      },
      {
        structureId: 'radiant:barracks:melee:mid',
        team: 'radiant',
        kind: 'barracks',
        tier: null,
        positions: [{ x: -4_672, y: -4_552 }],
      },
      {
        structureId: 'radiant:tower:1:top',
        team: 'radiant',
        kind: 'tower',
        tier: 1,
        positions: [{ x: -6_336, y: 1_856 }],
      },
      {
        structureId: 'radiant:tower:4',
        team: 'radiant',
        kind: 'tower',
        tier: 4,
        positions: [
          { x: -5_712, y: -4_864 },
          { x: -5_392, y: -5_192 },
        ],
      },
    ]);
  });

  it('deduplicates exact structure marker positions', () => {
    const normalized = normalizeGsiSnapshot({
      minimap: {
        first: {
          team: 2,
          unitname: 'npc_dota_goodguys_tower1_mid',
          xpos: -1_544,
          ypos: -1_408,
        },
        exactDuplicate: {
          team: 2,
          unitname: 'npc_dota_goodguys_tower1_mid',
          xpos: -1_544,
          ypos: -1_408,
        },
      },
    });

    expect(normalized.minimapStructures).toEqual([
      {
        structureId: 'radiant:tower:1:mid',
        team: 'radiant',
        kind: 'tower',
        tier: 1,
        positions: [{ x: -1_544, y: -1_408 }],
      },
    ]);
  });

  it('rejects conflicting non-T4 structure positions', () => {
    const normalized = normalizeGsiSnapshot({
      minimap: {
        first: {
          team: 2,
          unitname: 'npc_dota_goodguys_tower1_mid',
          xpos: -1_544,
          ypos: -1_408,
        },
        conflict: {
          team: 2,
          unitname: 'npc_dota_goodguys_tower1_mid',
          xpos: -1_500,
          ypos: -1_400,
        },
      },
    });

    expect(normalized.minimapStructures).toEqual([]);
  });
});
