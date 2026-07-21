import type {
  HeroMarkerKind,
  NormalizedBuildingObservation,
  NormalizedClientSnapshot,
  NormalizedGenericEventData,
  NormalizedHeroObservation,
  NormalizedMatchEvent,
  Position,
  Team,
} from '../../modules/match/public.js';
import type {
  RawGsiBuilding,
  RawGsiEvent,
  RawGsiHero,
  RawGsiMap,
  RawGsiMinimapMarker,
  RawGsiPlayer,
  RawGsiProvider,
  RawGsiSnapshot,
} from './raw-gsi.types.js';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function teamValue(value: unknown): Team | null {
  if (value === 'radiant' || value === 2) {
    return 'radiant';
  }

  if (value === 'dire' || value === 3) {
    return 'dire';
  }

  return null;
}

function positionValue(x: unknown, y: unknown): Position | null {
  const normalizedX = finiteNumber(x);
  const normalizedY = finiteNumber(y);

  if (normalizedX === null || normalizedY === null) {
    return null;
  }

  return { x: normalizedX, y: normalizedY };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

function normalizeMatch(value: unknown): NormalizedClientSnapshot['match'] {
  if (!isRecord(value)) {
    return null;
  }

  const map = value as RawGsiMap;
  const match = {
    matchId: nonEmptyString(map.matchid),
    gameState: nonEmptyString(map.game_state),
    gameTime: finiteNumber(map.game_time),
    clockTime: finiteNumber(map.clock_time),
    paused: booleanValue(map.paused),
    radiantScore: finiteNumber(map.radiant_score),
    direScore: finiteNumber(map.dire_score),
  };

  return Object.values(match).some((fact) => fact !== null) ? match : null;
}

function normalizePlayer(value: unknown): NormalizedClientSnapshot['player'] {
  if (!isRecord(value)) {
    return null;
  }

  const player = value as RawGsiPlayer;
  const normalized = {
    team: teamValue(player.team_name),
    teamSlot: finiteNumber(player.team_slot),
    gold: finiteNumber(player.gold),
    lastHits: finiteNumber(player.last_hits),
    denies: finiteNumber(player.denies),
    gpm: finiteNumber(player.gpm),
    xpm: finiteNumber(player.xpm),
    goldFromHeroKills: finiteNumber(player.gold_from_hero_kills),
    goldFromCreepKills: finiteNumber(player.gold_from_creep_kills),
    goldFromIncome: finiteNumber(player.gold_from_income),
    goldFromShared: finiteNumber(player.gold_from_shared),
  };

  return Object.values(normalized).some((fact) => fact !== null) ? normalized : null;
}

function normalizeHero(value: unknown): NormalizedClientSnapshot['hero'] {
  if (!isRecord(value)) {
    return null;
  }

  const hero = value as RawGsiHero;
  const rawHeroName = nonEmptyString(hero.name);
  const normalized = {
    heroName: rawHeroName?.startsWith('npc_dota_hero_') === true ? rawHeroName : null,
    position: positionValue(hero.xpos, hero.ypos),
    alive: booleanValue(hero.alive),
    healthPercent: finiteNumber(hero.health_percent),
    manaPercent: finiteNumber(hero.mana_percent),
    level: finiteNumber(hero.level),
    xp: finiteNumber(hero.xp),
  };

  return Object.values(normalized).some((fact) => fact !== null) ? normalized : null;
}

function markerKindValue(image: unknown): HeroMarkerKind {
  switch (image) {
    case 'minimap_herocircle_self':
      return 'self';
    case 'minimap_herocircle':
    case 'minimap_heroimage':
      return 'standard';
    case 'minimap_enemyicon':
      return 'enemy';
    case 'minimap_heroinvis':
      return 'invisible';
    default:
      return 'other';
  }
}

function normalizeMinimapHeroes(value: unknown): NormalizedHeroObservation[] {
  if (!isRecord(value)) {
    return [];
  }

  const observations: NormalizedHeroObservation[] = [];

  for (const markerValue of Object.values(value)) {
    if (!isRecord(markerValue)) {
      continue;
    }

    const marker = markerValue as RawGsiMinimapMarker;
    const heroName = nonEmptyString(marker.unitname);

    if (heroName?.startsWith('npc_dota_hero_') !== true) {
      continue;
    }

    observations.push({
      heroName,
      team: teamValue(marker.team),
      position: positionValue(marker.xpos, marker.ypos),
      markerKind: markerKindValue(marker.image),
    });
  }

  return observations;
}

function normalizeBuildings(value: unknown): NormalizedBuildingObservation[] {
  if (!isRecord(value)) {
    return [];
  }

  const observations: NormalizedBuildingObservation[] = [];

  for (const [rawTeam, teamBuildings] of Object.entries(value)) {
    const team = teamValue(rawTeam);

    if (team === null || !isRecord(teamBuildings)) {
      continue;
    }

    for (const [buildingId, buildingValue] of Object.entries(teamBuildings)) {
      if (!isRecord(buildingValue)) {
        continue;
      }

      const building = buildingValue as RawGsiBuilding;
      observations.push({
        buildingId,
        team,
        health: finiteNumber(building.health),
        maxHealth: finiteNumber(building.max_health),
      });
    }
  }

  return observations.sort((left, right) => {
    const teamOrder = left.team.localeCompare(right.team);
    return teamOrder === 0 ? left.buildingId.localeCompare(right.buildingId) : teamOrder;
  });
}

function parseGenericEventData(value: unknown): NormalizedGenericEventData | null {
  if (typeof value !== 'string') {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  return {
    eventType: nonEmptyString(parsed.type),
    time: finiteNumber(parsed.time),
    value: finiteNumber(parsed.value),
    value2: finiteNumber(parsed.value2),
    value3: finiteNumber(parsed.value3),
    playerId1: finiteNumber(parsed.playerid1),
    playerId2: finiteNumber(parsed.playerid2),
    playerId3: finiteNumber(parsed.playerid3),
    playerId4: finiteNumber(parsed.playerid4),
    playerId5: finiteNumber(parsed.playerid5),
    playerId6: finiteNumber(parsed.playerid6),
  };
}

function normalizeEvent(value: unknown): NormalizedMatchEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const event = value as RawGsiEvent;
  const eventType = nonEmptyString(event.event_type);
  const gameTime = finiteNumber(event.game_time);

  switch (eventType) {
    case 'generic_event': {
      const data = parseGenericEventData(event.data);
      return data === null ? null : { type: eventType, gameTime, data };
    }
    case 'bounty_rune_pickup':
      return {
        type: eventType,
        gameTime,
        playerId: finiteNumber(event.player_id),
        team: teamValue(event.team),
        bountyValue: finiteNumber(event.bounty_value),
        teamGold: finiteNumber(event.team_gold),
      };
    case 'roshan_killed':
      return {
        type: eventType,
        gameTime,
        killedByTeam: teamValue(event.killed_by_team),
        killerPlayerId: finiteNumber(event.killer_player_id),
      };
    case 'aegis_picked_up':
      return {
        type: eventType,
        gameTime,
        playerId: finiteNumber(event.player_id),
        snatched: booleanValue(event.snatched),
      };
    default:
      return null;
  }
}

function normalizeEvents(value: unknown): NormalizedMatchEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const events: NormalizedMatchEvent[] = [];

  for (const eventValue of value) {
    const event = normalizeEvent(eventValue);

    if (event !== null) {
      events.push(event);
    }
  }

  return events;
}

export function normalizeGsiSnapshot(value: unknown): NormalizedClientSnapshot {
  const snapshot: RawGsiSnapshot = isRecord(value) ? value : {};
  const provider = isRecord(snapshot.provider) ? (snapshot.provider as RawGsiProvider) : null;

  return deepFreeze({
    sourceTimestampSeconds: provider === null ? null : finiteNumber(provider.timestamp),
    match: normalizeMatch(snapshot.map),
    player: normalizePlayer(snapshot.player),
    hero: normalizeHero(snapshot.hero),
    minimapHeroes: normalizeMinimapHeroes(snapshot.minimap),
    buildings: normalizeBuildings(snapshot.buildings),
    events: normalizeEvents(snapshot.events),
  });
}
