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
  const alliedNames = new Set(input.memory.alliedRoster);
  const enemyNames = new Set(input.memory.enemyRoster);
  const visibleEnemyPositions = new Map<string, Position>();
  const ambiguousEnemyNames = new Set<string>();
  const updatesEnemyTimeline = input.timelineUpdate !== 'none' && input.observations.length > 0;

  for (const observation of input.observations) {
    if (observation.team === input.sessionTeam) {
      alliedNames.add(observation.heroName);
      continue;
    }

    if (observation.team === null) {
      continue;
    }

    enemyNames.add(observation.heroName);

    if (!updatesEnemyTimeline || observation.position === null || ambiguousEnemyNames.has(observation.heroName)) {
      continue;
    }

    if (visibleEnemyPositions.has(observation.heroName)) {
      visibleEnemyPositions.delete(observation.heroName);
      ambiguousEnemyNames.add(observation.heroName);
      continue;
    }

    visibleEnemyPositions.set(observation.heroName, observation.position);
  }

  const alliedRoster = Object.freeze([...alliedNames].sort());
  const enemyRoster = Object.freeze([...enemyNames].sort());

  if (!updatesEnemyTimeline) {
    return Object.freeze({
      alliedRoster,
      enemyRoster,
      enemies: input.memory.enemies,
      ambiguousEnemyHeroNames: input.memory.ambiguousEnemyHeroNames,
    });
  }

  const enemiesByName = new Map(input.memory.enemies.map((enemy) => [enemy.heroName, enemy]));

  if (input.timelineUpdate === 'delta') {
    for (const enemy of input.memory.enemies) {
      if (ambiguousEnemyNames.has(enemy.heroName) || visibleEnemyPositions.has(enemy.heroName)) {
        continue;
      }

      enemiesByName.set(enemy.heroName, Object.freeze({ ...enemy, sourceVisible: false }));
    }
  }

  for (const [heroName, position] of visibleEnemyPositions) {
    const previous = enemiesByName.get(heroName);

    enemiesByName.set(
      heroName,
      Object.freeze({
        heroName,
        firstSeenAt: previous?.firstSeenAt ?? input.receivedAt,
        lastSeenAt: input.receivedAt,
        lastKnownPosition: position,
        sourceVisible: true,
      })
    );
  }

  return Object.freeze({
    alliedRoster,
    enemyRoster,
    enemies: Object.freeze(
      [...enemiesByName.values()].sort((left, right) => left.heroName.localeCompare(right.heroName))
    ),
    ambiguousEnemyHeroNames: Object.freeze([...ambiguousEnemyNames].sort()),
  });
}
