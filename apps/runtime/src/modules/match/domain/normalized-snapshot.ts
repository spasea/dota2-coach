export type Team = 'radiant' | 'dire';

export type Position = Readonly<{
  x: number;
  y: number;
}>;

export type NormalizedMatchFacts = Readonly<{
  matchId: string | null;
  gameState: string | null;
  gameTime: number | null;
  clockTime: number | null;
  paused: boolean | null;
  radiantScore: number | null;
  direScore: number | null;
}>;

export type NormalizedPlayerFacts = Readonly<{
  team: Team | null;
  teamSlot: number | null;
  gold: number | null;
  lastHits: number | null;
  denies: number | null;
  gpm: number | null;
  xpm: number | null;
  goldFromHeroKills: number | null;
  goldFromCreepKills: number | null;
  goldFromIncome: number | null;
  goldFromShared: number | null;
}>;

export type NormalizedHeroFacts = Readonly<{
  heroName: string | null;
  position: Position | null;
  alive: boolean | null;
  healthPercent: number | null;
  manaPercent: number | null;
  level: number | null;
  xp: number | null;
}>;

export type HeroMarkerKind = 'self' | 'standard' | 'enemy' | 'invisible' | 'other';

export type NormalizedHeroObservation = Readonly<{
  heroName: string;
  team: Team | null;
  position: Position | null;
  markerKind: HeroMarkerKind;
}>;

export type NormalizedBuildingObservation = Readonly<{
  buildingId: string;
  team: Team;
  health: number | null;
  maxHealth: number | null;
}>;

export type NormalizedGenericEventData = Readonly<{
  eventType: string | null;
  time: number | null;
  value: number | null;
  value2: number | null;
  value3: number | null;
  playerId1: number | null;
  playerId2: number | null;
  playerId3: number | null;
  playerId4: number | null;
  playerId5: number | null;
  playerId6: number | null;
}>;

export type NormalizedGenericEvent = Readonly<{
  type: 'generic_event';
  gameTime: number | null;
  data: NormalizedGenericEventData;
}>;

export type NormalizedBountyRunePickupEvent = Readonly<{
  type: 'bounty_rune_pickup';
  gameTime: number | null;
  playerId: number | null;
  team: Team | null;
  bountyValue: number | null;
  teamGold: number | null;
}>;

export type NormalizedRoshanKilledEvent = Readonly<{
  type: 'roshan_killed';
  gameTime: number | null;
  killedByTeam: Team | null;
  killerPlayerId: number | null;
}>;

export type NormalizedAegisPickedUpEvent = Readonly<{
  type: 'aegis_picked_up';
  gameTime: number | null;
  playerId: number | null;
  snatched: boolean | null;
}>;

export type NormalizedMatchEvent =
  NormalizedGenericEvent | NormalizedBountyRunePickupEvent | NormalizedRoshanKilledEvent | NormalizedAegisPickedUpEvent;

export type NormalizedClientSnapshot = Readonly<{
  sourceTimestampSeconds: number | null;
  match: NormalizedMatchFacts | null;
  player: NormalizedPlayerFacts | null;
  hero: NormalizedHeroFacts | null;
  minimapHeroes: readonly NormalizedHeroObservation[];
  buildings: readonly NormalizedBuildingObservation[];
  events: readonly NormalizedMatchEvent[];
}>;
