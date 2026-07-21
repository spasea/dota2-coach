import type { CoachContext, MatchContextUnknown, Position, TeleportReadiness } from '../../match/public.js';
import type { LostSignalPolicy } from './lost-policy.js';
import type { MapDepthProjection } from './map-depth.js';

export type ReadinessThresholdState = 'low' | 'not_low' | 'unknown';
export type StructureRiskLevel = 'stable' | 'pressured' | 'critical';
export type StructureDamageActivity = 'active' | 'recent' | 'none' | 'unknown';
export type DefenseArrivalClass = 'already_near' | 'teleport_available' | 'slow_or_unavailable' | 'unknown';
export type DefenseNumericalRisk = 'acceptable' | 'outnumbered' | 'unknown';
export type DefenseResponse = 'allowed' | 'blocked' | 'strong_penalty' | 'last_stand';

export type RequesterReadinessSignal = Readonly<{
  alive: boolean | null;
  health: ReadinessThresholdState;
  mana: ReadinessThresholdState;
  disabled: boolean | null;
  teleportReadiness: TeleportReadiness;
  respawnSeconds: number | null;
  buybackCost: number | null;
  buybackCooldown: number | null;
}>;

export type StructureRiskSignal = Readonly<{
  buildingId: string;
  structureId: string;
  level: StructureRiskLevel;
  damageActivity: StructureDamageActivity;
  activeDamageEvents: number;
  recentDamageEvents: number;
  lastDamageAgeMs: number | null;
}>;

export type TeamClusterSignal = Readonly<{
  heroNames: readonly string[];
  connectedHeroNames: readonly string[];
  center: Position;
  maxPairDistance: number;
  visibleEnemyLowerBound: number;
  destinationRisk: 'not_contradicted' | 'contradicted' | 'unknown';
}>;

export type DefenseFeasibilitySignal = Readonly<{
  buildingId: string;
  structureId: string;
  arrivalClass: DefenseArrivalClass;
  readyDefenders: number;
  uncertainSupports: number;
  visibleEnemyLowerBound: number;
  numericalRisk: DefenseNumericalRisk;
  response: DefenseResponse;
}>;

export type IsolationRiskSignal = Readonly<{
  deep: boolean | null;
  isolated: boolean | null;
  missingEnemyCount: number;
}>;

export type LostSignals = Readonly<{
  requesterMapDepth: MapDepthProjection;
  requesterReadiness: RequesterReadinessSignal;
  structureRisks: readonly StructureRiskSignal[];
  defenses: readonly DefenseFeasibilitySignal[];
  selectedTeamCluster: TeamClusterSignal | null;
  isolation: IsolationRiskSignal;
  unknowns: readonly MatchContextUnknown[];
}>;

export type DeriveLostSignalsInput = Readonly<{
  context: CoachContext;
  policy: LostSignalPolicy;
}>;

export function deriveLostSignals(input: DeriveLostSignalsInput): LostSignals {
  void input;
  throw new Error('Lost signal derivation is not implemented.');
}
