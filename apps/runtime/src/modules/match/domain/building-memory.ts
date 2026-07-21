import type { TimelineStatus, TimelineUpdate } from './match-session.js';
import type { NormalizedBuildingObservation } from './normalized-snapshot.js';

export type BuildingHealthEvent = Readonly<{
  buildingId: string;
  structureId: string;
  observedAt: number;
  gameTime: number | null;
  previousHealth: number;
  currentHealth: number;
  maxHealth: number;
  damage: number;
  damagePercent: number;
}>;

export type BuildingTemporalState = Readonly<{
  buildingId: string;
  structureId: string;
  currentHealth: number;
  maxHealth: number;
  lastObservedAt: number;
  lastDamageAt: number | null;
  destroyedAt: number | null;
  events: readonly BuildingHealthEvent[];
}>;

export type BuildingMemory = readonly BuildingTemporalState[];

export type BuildingWindowPolicy = Readonly<{
  activeDamageMs: number;
  recentDamageMs: number;
  pressureMs: number;
}>;

export type BuildingPressure = Readonly<{
  buildingId: string;
  structureId: string;
  currentHealth: number;
  maxHealth: number;
  activeDamage: number;
  activeDamageEvents: number;
  recentDamage: number;
  recentDamageEvents: number;
  pressureDamage: number;
  lastDamageAgeMs: number | null;
}>;

export type BuildingPressureAvailability =
  | Readonly<{ status: 'available'; value: readonly BuildingPressure[] }>
  | Readonly<{
      status: 'unavailable';
      reason: 'timeline_stale' | 'timeline_rebaselining' | 'building_history_unavailable';
    }>;

export type ReduceBuildingMemoryInput = Readonly<{
  memory: BuildingMemory;
  observations: readonly NormalizedBuildingObservation[];
  receivedAt: number;
  gameTime: number | null;
  gameState: string | null;
  timelineUpdate: TimelineUpdate;
}>;

export type ReadBuildingPressureInput = Readonly<{
  memory: BuildingMemory;
  now: number;
  gameState: string | null;
  timelineStatus: TimelineStatus;
  windows: BuildingWindowPolicy;
}>;

export function reduceBuildingMemory(input: ReduceBuildingMemoryInput): BuildingMemory {
  if (input.timelineUpdate === 'none' || input.observations.length === 0) {
    return input.memory;
  }

  const buildingsById = new Map(input.memory.map((building) => [building.buildingId, building]));

  for (const observation of input.observations) {
    if (
      observation.health === null ||
      observation.maxHealth === null ||
      !Number.isFinite(observation.health) ||
      !Number.isFinite(observation.maxHealth) ||
      observation.health < 0 ||
      observation.maxHealth <= 0
    ) {
      continue;
    }

    const previous = buildingsById.get(observation.buildingId);

    if (previous === undefined) {
      buildingsById.set(
        observation.buildingId,
        Object.freeze({
          buildingId: observation.buildingId,
          structureId: observation.structureId,
          currentHealth: observation.health,
          maxHealth: observation.maxHealth,
          lastObservedAt: input.receivedAt,
          lastDamageAt: null,
          destroyedAt: observation.health === 0 ? input.receivedAt : null,
          events: Object.freeze([]),
        })
      );
      continue;
    }

    const damage = previous.currentHealth - observation.health;
    const recordsDamage = input.timelineUpdate === 'delta' && damage > 0;
    const event: BuildingHealthEvent | null = recordsDamage
      ? Object.freeze({
          buildingId: observation.buildingId,
          structureId: observation.structureId,
          observedAt: input.receivedAt,
          gameTime: input.gameTime,
          previousHealth: previous.currentHealth,
          currentHealth: observation.health,
          maxHealth: observation.maxHealth,
          damage,
          damagePercent: damage / observation.maxHealth,
        })
      : null;

    buildingsById.set(
      observation.buildingId,
      Object.freeze({
        buildingId: observation.buildingId,
        structureId: observation.structureId,
        currentHealth: observation.health,
        maxHealth: observation.maxHealth,
        lastObservedAt: input.receivedAt,
        lastDamageAt: event === null ? previous.lastDamageAt : input.receivedAt,
        destroyedAt:
          previous.destroyedAt ?? (observation.health === 0 && input.gameState !== null ? input.receivedAt : null),
        events: event === null ? previous.events : Object.freeze([...previous.events, event]),
      })
    );
  }

  return Object.freeze(
    [...buildingsById.values()].sort((left, right) => left.buildingId.localeCompare(right.buildingId))
  );
}

export function readBuildingPressure(input: ReadBuildingPressureInput): BuildingPressureAvailability {
  const { activeDamageMs, recentDamageMs, pressureMs } = input.windows;

  if (
    !Number.isFinite(activeDamageMs) ||
    !Number.isFinite(recentDamageMs) ||
    !Number.isFinite(pressureMs) ||
    activeDamageMs <= 0 ||
    activeDamageMs >= recentDamageMs ||
    recentDamageMs >= pressureMs
  ) {
    throw new RangeError('Building damage windows must be positive and strictly increasing.');
  }

  if (input.timelineStatus === 'stale') {
    return Object.freeze({ status: 'unavailable', reason: 'timeline_stale' });
  }

  if (input.timelineStatus === 'rebaselining') {
    return Object.freeze({ status: 'unavailable', reason: 'timeline_rebaselining' });
  }

  if (input.memory.length === 0 || input.gameState === null) {
    return Object.freeze({ status: 'unavailable', reason: 'building_history_unavailable' });
  }

  const value = input.memory.map((building) => {
    let activeDamage = 0;
    let activeDamageEvents = 0;
    let recentDamage = 0;
    let recentDamageEvents = 0;
    let pressureDamage = 0;
    let lastDamageAgeMs: number | null = null;

    for (const event of building.events) {
      const age = input.now - event.observedAt;

      if (!Number.isFinite(age) || age < 0) {
        throw new RangeError('Building event age must be a non-negative finite number.');
      }

      if (age < activeDamageMs) {
        activeDamage += event.damage;
        activeDamageEvents += 1;
      }
      if (age < recentDamageMs) {
        recentDamage += event.damage;
        recentDamageEvents += 1;
      }
      if (age < pressureMs) {
        pressureDamage += event.damage;
      }

      lastDamageAgeMs = lastDamageAgeMs === null ? age : Math.min(lastDamageAgeMs, age);
    }

    return Object.freeze({
      buildingId: building.buildingId,
      structureId: building.structureId,
      currentHealth: building.currentHealth,
      maxHealth: building.maxHealth,
      activeDamage,
      activeDamageEvents,
      recentDamage,
      recentDamageEvents,
      pressureDamage,
      lastDamageAgeMs,
    });
  });

  return Object.freeze({ status: 'available', value: Object.freeze(value) });
}
