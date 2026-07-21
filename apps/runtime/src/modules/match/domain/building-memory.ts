import type { TimelineStatus, TimelineUpdate } from './match-session.js';
import type { NormalizedBuildingObservation } from './normalized-snapshot.js';

export type BuildingHealthEvent = Readonly<{
  buildingId: string;
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
  currentHealth: number;
  maxHealth: number;
  activeDamage: number;
  recentDamage: number;
  pressureDamage: number;
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
  return input.memory;
}

export function readBuildingPressure(input: ReadBuildingPressureInput): BuildingPressureAvailability {
  void input;
  return Object.freeze({ status: 'unavailable', reason: 'building_history_unavailable' });
}
