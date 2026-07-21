import type { Role } from './client-identity.js';
import type { BuildingMemory } from './building-memory.js';
import type { EventMemory } from './event-memory.js';
import { createEmptyHeroMemory, type HeroMemory } from './hero-memory.js';
import { createEmptyMapMemory, type MapMemory } from './map-memory.js';
import type { MatchSession } from './match-session.js';
import type { PlayerHistoryMemory } from './player-history.js';
import type { Team } from './normalized-snapshot.js';

export type MatchMemory = Readonly<{
  matchId: string;
  team: Team;
  map: MapMemory;
  heroes: HeroMemory;
  playerHistories: PlayerHistoryMemory;
  buildings: BuildingMemory;
  events: EventMemory;
}>;

export type RoleOverride = Readonly<{
  clientId: string;
  role: Role;
}>;

export type ActiveMatchState = Readonly<{
  session: MatchSession;
  memory: MatchMemory;
  roleOverrides: readonly RoleOverride[];
}>;

export function createEmptyMatchMemory(matchId: string, team: Team): MatchMemory {
  return Object.freeze({
    matchId,
    team,
    map: createEmptyMapMemory(),
    heroes: createEmptyHeroMemory(),
    playerHistories: Object.freeze([]),
    buildings: Object.freeze([]),
    events: Object.freeze([]),
  });
}

export function createActiveMatchState(session: MatchSession): ActiveMatchState {
  return Object.freeze({
    session,
    memory: createEmptyMatchMemory(session.matchId, session.team),
    roleOverrides: Object.freeze([]),
  });
}
