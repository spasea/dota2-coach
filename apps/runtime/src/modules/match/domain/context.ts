import type { BuildingPressureAvailability } from './building-memory.js';
import type { Role } from './client-identity.js';
import type { MatchEventMemory } from './event-memory.js';
import type { MapTransition } from './map-memory.js';
import type { TimelineStatus } from './match-session.js';
import type { NormalizedClientState } from './normalized-client-state.js';
import type { NormalizedClientSnapshot, Position, Team } from './normalized-snapshot.js';
import type { PlayerHistory } from './player-history.js';

export type MatchContextUnknown =
  | 'partial_team_coverage'
  | 'timeline_stale'
  | 'timeline_rebaselining'
  | 'requester_history_unavailable'
  | 'building_history_unavailable'
  | 'enemy_observation_ambiguous';

export type FeatureAvailability<T, TReason extends MatchContextUnknown> =
  Readonly<{ status: 'available'; value: T }> | Readonly<{ status: 'unavailable'; reason: TReason }>;

export type EnemyTemporalFeature = Readonly<{
  heroName: string;
  currentlyVisible: boolean | null;
  lastKnownPosition: Position | null;
  lastSeenAgeMs: number | null;
}>;

export type TemporalEventFeature = Readonly<{
  event: MatchEventMemory['event'];
  firstReceivedAt: number;
}>;

export type TemporalFeatures = Readonly<{
  timelineStatus: TimelineStatus;
  mapTransitions: readonly MapTransition[];
  enemyHeroes: readonly EnemyTemporalFeature[];
  requesterHistory: FeatureAvailability<PlayerHistory, 'requester_history_unavailable'>;
  playerHistories: readonly PlayerHistory[];
  buildingPressure: BuildingPressureAvailability;
  events: readonly TemporalEventFeature[];
}>;

export type CoachContext = Readonly<{
  requester: NormalizedClientState;
  effectiveRole: Role;
  teammates: readonly NormalizedClientState[];
  coverage: number;
  matchId: string;
  team: Team;
  sharedSnapshot: NormalizedClientSnapshot;
  alliedRoster: readonly string[];
  enemyRoster: readonly string[];
  temporalFeatures: TemporalFeatures;
  unknowns: readonly MatchContextUnknown[];
}>;

export type ContextUnavailableStatus =
  'client_not_found' | 'snapshot_missing' | 'snapshot_stale' | 'match_unavailable' | 'outside_active_session';

export type BuildCoachContextResult =
  Readonly<{ status: 'ready'; context: CoachContext }> | Readonly<{ status: ContextUnavailableStatus }>;
