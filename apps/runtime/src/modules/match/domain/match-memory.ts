import type { Role } from './client-identity.js';
import { reduceBuildingMemory, type BuildingMemory } from './building-memory.js';
import { reduceEventMemory, type EventMemory } from './event-memory.js';
import { createEmptyHeroMemory, reduceHeroMemory, type HeroMemory } from './hero-memory.js';
import { createEmptyMapMemory, reduceMapMemory, type MapMemory } from './map-memory.js';
import type { MatchSession, MatchSessionDecision } from './match-session.js';
import type { NormalizedClientState } from './normalized-client-state.js';
import { reducePlayerHistory, type PlayerHistoryMemory } from './player-history.js';
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

type AdvanceActiveMatchStateInput = Readonly<{
  currentState: ActiveMatchState | null;
  decision: MatchSessionDecision;
  clientState: NormalizedClientState;
  freshnessMs: number;
  playerHistoryRetentionMs: number;
}>;

const createAggregate = (
  startsNewAggregate: boolean,
  session: MatchSessionDecision['session'],
  input: AdvanceActiveMatchStateInput
): ActiveMatchState | null => {
  if (session === null) {
    return null;
  }

  if (startsNewAggregate || input.currentState === null) {
    return createActiveMatchState(session);
  }

  if (input.currentState.session === session) {
    return input.currentState;
  }

  return Object.freeze({ ...input.currentState, session });
};

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

export function advanceActiveMatchState(input: AdvanceActiveMatchStateInput): ActiveMatchState | null {
  const session = input.decision.session;

  if (session === null) {
    return null;
  }

  const startsNewAggregate =
    input.currentState === null ||
    input.decision.resetPreviousSession ||
    input.currentState.session.matchId !== session.matchId ||
    input.currentState.session.team !== session.team;

  const aggregate = createAggregate(startsNewAggregate, session, input);

  if (aggregate === null) {
    return null;
  }

  const belongsToSession =
    input.clientState.snapshot.match?.matchId === session.matchId &&
    input.clientState.snapshot.player?.team === session.team;

  if (!belongsToSession) {
    return aggregate;
  }

  const snapshot = input.clientState.snapshot;
  const memory = Object.freeze({
    ...aggregate.memory,
    map: reduceMapMemory({
      memory: aggregate.memory.map,
      facts: snapshot.match,
      receivedAt: input.clientState.receivedAt,
      timelineUpdate: input.decision.timelineUpdate,
    }),
    heroes: reduceHeroMemory({
      memory: aggregate.memory.heroes,
      observations: snapshot.minimapHeroes,
      sessionTeam: session.team,
      receivedAt: input.clientState.receivedAt,
      timelineUpdate: input.decision.timelineUpdate,
    }),
    playerHistories: reducePlayerHistory({
      memory: aggregate.memory.playerHistories,
      state: input.clientState,
      freshnessMs: input.freshnessMs,
      retentionMs: input.playerHistoryRetentionMs,
    }),
    buildings: reduceBuildingMemory({
      memory: aggregate.memory.buildings,
      observations: snapshot.buildings,
      receivedAt: input.clientState.receivedAt,
      gameTime: snapshot.match?.gameTime ?? null,
      gameState: snapshot.match?.gameState ?? null,
      timelineUpdate: input.decision.timelineUpdate,
    }),
    events: reduceEventMemory({
      memory: aggregate.memory.events,
      events: snapshot.events,
      receivedAt: input.clientState.receivedAt,
    }),
  });

  return Object.freeze({ ...aggregate, memory });
}
