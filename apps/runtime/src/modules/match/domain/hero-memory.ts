import type { TimelineUpdate } from './match-session.js';
import type { NormalizedHeroObservation, Position, Team } from './normalized-snapshot.js';

export type EnemyHeroMemory = Readonly<{
  heroName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastKnownPosition: Position | null;
  sourceVisible: boolean;
}>;

export type HeroMemory = Readonly<{
  alliedRoster: readonly string[];
  enemyRoster: readonly string[];
  enemies: readonly EnemyHeroMemory[];
  ambiguousEnemyHeroNames: readonly string[];
}>;

export type ReduceHeroMemoryInput = Readonly<{
  memory: HeroMemory;
  observations: readonly NormalizedHeroObservation[];
  sessionTeam: Team;
  receivedAt: number;
  timelineUpdate: TimelineUpdate;
}>;

export function createEmptyHeroMemory(): HeroMemory {
  return Object.freeze({
    alliedRoster: Object.freeze([]),
    enemyRoster: Object.freeze([]),
    enemies: Object.freeze([]),
    ambiguousEnemyHeroNames: Object.freeze([]),
  });
}

export function reduceHeroMemory(input: ReduceHeroMemoryInput): HeroMemory {
  return input.memory;
}
