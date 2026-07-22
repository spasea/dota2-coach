import type {
  CoachContext,
  MatchContextUnknown,
  NormalizedClientState,
  NormalizedHeroFacts,
  NormalizedStructureObservation,
  Position,
  TeleportReadiness,
} from '../../match/public.js';
import type { LostSignalPolicy } from './lost-policy.js';
import { projectMapDepth, type MapDepthProjection } from './map-depth.js';

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
  const requesterMapDepth = projectMapDepth({
    position: input.context.requester.snapshot.hero?.position ?? null,
    team: input.context.team,
    policy: input.policy.mapDepth,
  });
  const requesterReadiness = deriveRequesterReadiness(input.context, input.policy);
  const allies = collectAlliedObservations(input.context);
  const enemies = collectVisibleEnemies(input.context);
  const structuresById = indexOwnStructures(input.context);
  const structureRisks = deriveStructureRisks(input.context, input.policy, structuresById);
  const defenses = deriveDefenses({
    context: input.context,
    policy: input.policy,
    structuresById,
    requesterReadiness,
    structureRisks,
    allies,
    enemies,
  });
  const selectedTeamCluster = selectTeamCluster(input.context, input.policy, allies, enemies);
  const isolation = deriveIsolation(input.context, input.policy, requesterMapDepth, allies, enemies);

  return Object.freeze({
    requesterMapDepth,
    requesterReadiness,
    structureRisks,
    defenses,
    selectedTeamCluster,
    isolation,
    unknowns: Object.freeze([...input.context.unknowns]),
  });
}

type AlliedObservation = Readonly<{
  heroName: string;
  position: Position;
  connectedState: NormalizedClientState | null;
}>;

type VisibleEnemy = Readonly<{
  heroName: string;
  position: Position;
}>;

type BuildingEvidence = Readonly<{
  buildingId: string;
  structureId: string;
  currentHealth: number;
  maxHealth: number;
  activeDamage: number;
  activeDamageEvents: number;
  recentDamage: number;
  recentDamageEvents: number;
  lastDamageAgeMs: number | null;
  temporalEvidenceAvailable: boolean;
}>;

type StructureIndex = ReadonlyMap<string, NormalizedStructureObservation>;

function deriveRequesterReadiness(context: CoachContext, policy: LostSignalPolicy): RequesterReadinessSignal {
  const hero = context.requester.snapshot.hero;

  return Object.freeze({
    alive: hero?.alive ?? null,
    health: classifyThreshold(hero?.healthPercent ?? null, policy.readiness.lowHealthPercent),
    mana: classifyThreshold(hero?.manaPercent ?? null, policy.readiness.lowManaPercent),
    disabled: deriveDisabledState(hero),
    teleportReadiness: Object.freeze({ status: hero?.teleportReadiness.status ?? 'unknown' }),
    respawnSeconds: hero?.respawnSeconds ?? null,
    buybackCost: hero?.buybackCost ?? null,
    buybackCooldown: hero?.buybackCooldown ?? null,
  });
}

function classifyThreshold(value: number | null, threshold: number): ReadinessThresholdState {
  if (value === null) {
    return 'unknown';
  }

  return value <= threshold ? 'low' : 'not_low';
}

function deriveDisabledState(hero: NormalizedHeroFacts | null | undefined): boolean | null {
  if (hero === null || hero === undefined) {
    return null;
  }

  const states = Object.values(hero.status);

  if (states.some((state) => state === true)) {
    return true;
  }

  return states.every((state) => state === false) ? false : null;
}

function collectAlliedObservations(context: CoachContext): readonly AlliedObservation[] {
  const requesterHeroName = context.requester.snapshot.hero?.heroName ?? null;
  const alliesByHeroName = new Map<string, AlliedObservation>();

  for (const observation of context.sharedSnapshot.minimapHeroes) {
    if (
      observation.team !== context.team ||
      observation.position === null ||
      observation.heroName === requesterHeroName ||
      alliesByHeroName.has(observation.heroName)
    ) {
      continue;
    }

    alliesByHeroName.set(
      observation.heroName,
      Object.freeze({
        heroName: observation.heroName,
        position: observation.position,
        connectedState: null,
      })
    );
  }

  for (const teammate of context.teammates) {
    const hero = teammate.snapshot.hero;
    const heroName = hero?.heroName ?? null;

    if (heroName === null || heroName === requesterHeroName) {
      continue;
    }

    const position = hero?.position ?? alliesByHeroName.get(heroName)?.position ?? null;

    if (position === null) {
      continue;
    }

    alliesByHeroName.set(heroName, Object.freeze({ heroName, position, connectedState: teammate }));
  }

  return Object.freeze(
    [...alliesByHeroName.values()].sort((left, right) => left.heroName.localeCompare(right.heroName))
  );
}

function collectVisibleEnemies(context: CoachContext): readonly VisibleEnemy[] {
  const enemiesByHeroName = new Map<string, VisibleEnemy>();

  for (const observation of context.sharedSnapshot.minimapHeroes) {
    if (
      observation.team === null ||
      observation.team === context.team ||
      observation.position === null ||
      enemiesByHeroName.has(observation.heroName)
    ) {
      continue;
    }

    enemiesByHeroName.set(
      observation.heroName,
      Object.freeze({ heroName: observation.heroName, position: observation.position })
    );
  }

  return Object.freeze(
    [...enemiesByHeroName.values()].sort((left, right) => left.heroName.localeCompare(right.heroName))
  );
}

function indexOwnStructures(context: CoachContext): StructureIndex {
  const structuresById = new Map<string, NormalizedStructureObservation>();

  for (const structure of context.sharedSnapshot.minimapStructures) {
    if (structure.team === context.team) {
      structuresById.set(structure.structureId, structure);
    }
  }

  return structuresById;
}

function deriveStructureRisks(
  context: CoachContext,
  policy: LostSignalPolicy,
  structuresById: StructureIndex
): readonly StructureRiskSignal[] {
  const evidence = collectBuildingEvidence(context);
  const risks = evidence.map((building) =>
    deriveStructureRisk(building, structuresById.get(building.structureId), policy)
  );

  return Object.freeze(risks);
}

function deriveStructureRisk(
  building: BuildingEvidence,
  structure: NormalizedStructureObservation | undefined,
  policy: LostSignalPolicy
): StructureRiskSignal {
  const damageActivity = deriveDamageActivity(building);

  return Object.freeze({
    buildingId: building.buildingId,
    structureId: building.structureId,
    level: classifyStructureRisk(building, structure, damageActivity, policy),
    damageActivity,
    activeDamageEvents: building.temporalEvidenceAvailable ? building.activeDamageEvents : 0,
    recentDamageEvents: building.temporalEvidenceAvailable ? building.recentDamageEvents : 0,
    lastDamageAgeMs: building.temporalEvidenceAvailable ? building.lastDamageAgeMs : null,
  });
}

function classifyStructureRisk(
  building: BuildingEvidence,
  structure: NormalizedStructureObservation | undefined,
  damageActivity: StructureDamageActivity,
  policy: LostSignalPolicy
): StructureRiskLevel {
  const healthPercent = (building.currentHealth / building.maxHealth) * 100;
  const receivesCriticalActiveDamage =
    damageActivity === 'active' && isHighGroundStructure(building.structureId, structure);
  const receivesRepeatedActiveDamage =
    damageActivity === 'active' && building.activeDamageEvents >= policy.structureRisk.repeatedActiveDamageEvents;

  if (
    healthPercent <= policy.structureRisk.criticalHealthPercent ||
    receivesCriticalActiveDamage ||
    receivesRepeatedActiveDamage
  ) {
    return 'critical';
  }

  if (
    healthPercent <= policy.structureRisk.pressuredHealthPercent ||
    damageActivity === 'active' ||
    damageActivity === 'recent'
  ) {
    return 'pressured';
  }

  return 'stable';
}

function collectBuildingEvidence(context: CoachContext): readonly BuildingEvidence[] {
  const pressure = context.temporalFeatures.buildingPressure;
  const temporalEvidenceAvailable =
    pressure.status === 'available' && context.temporalFeatures.timelineStatus === 'healthy';
  const evidenceByBuildingId = new Map<string, BuildingEvidence>();

  if (pressure.status === 'available') {
    for (const building of pressure.value) {
      evidenceByBuildingId.set(
        building.buildingId,
        Object.freeze({
          ...building,
          temporalEvidenceAvailable,
        })
      );
    }
  }

  for (const building of context.sharedSnapshot.buildings) {
    if (
      building.team !== context.team ||
      building.health === null ||
      building.maxHealth === null ||
      building.maxHealth <= 0 ||
      evidenceByBuildingId.has(building.buildingId)
    ) {
      continue;
    }

    evidenceByBuildingId.set(
      building.buildingId,
      Object.freeze({
        buildingId: building.buildingId,
        structureId: building.structureId,
        currentHealth: building.health,
        maxHealth: building.maxHealth,
        activeDamage: 0,
        activeDamageEvents: 0,
        recentDamage: 0,
        recentDamageEvents: 0,
        lastDamageAgeMs: null,
        temporalEvidenceAvailable: false,
      })
    );
  }

  return Object.freeze(
    [...evidenceByBuildingId.values()].sort((left, right) => left.buildingId.localeCompare(right.buildingId))
  );
}

function deriveDamageActivity(building: BuildingEvidence): StructureDamageActivity {
  if (!building.temporalEvidenceAvailable) {
    return 'unknown';
  }

  if (building.activeDamage > 0 || building.activeDamageEvents > 0) {
    return 'active';
  }

  if (building.recentDamage > 0 || building.recentDamageEvents > 0) {
    return 'recent';
  }

  return 'none';
}

function isHighGroundStructure(structureId: string, structure: NormalizedStructureObservation | undefined): boolean {
  if (structure !== undefined) {
    return (
      structure.kind === 'ancient' ||
      structure.kind === 'barracks' ||
      (structure.kind === 'tower' && (structure.tier ?? 0) >= 3)
    );
  }

  return (
    structureId.includes(':ancient') ||
    structureId.includes(':barracks:') ||
    structureId.includes(':tower:3:') ||
    structureId.includes(':tower:4')
  );
}

type DeriveDefensesInput = Readonly<{
  context: CoachContext;
  policy: LostSignalPolicy;
  structuresById: StructureIndex;
  requesterReadiness: RequesterReadinessSignal;
  structureRisks: readonly StructureRiskSignal[];
  allies: readonly AlliedObservation[];
  enemies: readonly VisibleEnemy[];
}>;

type DefenderPresence = Readonly<{
  readyDefenders: number;
  uncertainSupports: number;
}>;

function deriveDefenses(input: DeriveDefensesInput): readonly DefenseFeasibilitySignal[] {
  const defenses: DefenseFeasibilitySignal[] = [];

  for (const risk of input.structureRisks) {
    const defense = deriveDefenseForRisk(input, risk);

    if (defense !== null) {
      defenses.push(defense);
    }
  }

  return Object.freeze(defenses);
}

function deriveDefenseForRisk(input: DeriveDefensesInput, risk: StructureRiskSignal): DefenseFeasibilitySignal | null {
  if (risk.damageActivity !== 'active' && risk.damageActivity !== 'recent') {
    return null;
  }

  const structure = input.structuresById.get(risk.structureId);

  if (structure === undefined || structure.positions.length === 0) {
    return null;
  }

  const arrivalClass = deriveArrivalClass(
    input.context.requester.snapshot.hero?.position ?? null,
    input.requesterReadiness.teleportReadiness,
    structure.positions,
    input.policy.proximity.structureRadius
  );
  const defenderPresence = deriveDefenderPresence(input, structure, arrivalClass);
  const visibleEnemyLowerBound = countNearStructure(
    input.enemies,
    structure.positions,
    input.policy.proximity.structureRadius
  );
  const numericalRisk = deriveNumericalRisk(
    input.context.unknowns.includes('enemy_observation_ambiguous'),
    visibleEnemyLowerBound,
    defenderPresence.readyDefenders
  );

  return Object.freeze({
    buildingId: risk.buildingId,
    structureId: risk.structureId,
    arrivalClass,
    ...defenderPresence,
    visibleEnemyLowerBound,
    numericalRisk,
    response: deriveDefenseResponse(structure, numericalRisk),
  });
}

function deriveDefenderPresence(
  input: DeriveDefensesInput,
  structure: NormalizedStructureObservation,
  arrivalClass: DefenseArrivalClass
): DefenderPresence {
  let readyDefenders = isRequesterReadyToDefend(input.requesterReadiness, arrivalClass) ? 1 : 0;
  let uncertainSupports = 0;

  for (const ally of input.allies) {
    if (distanceToNearestPosition(ally.position, structure.positions) > input.policy.proximity.structureRadius) {
      continue;
    }

    if (isConnectedAllyReadyToDefend(ally.connectedState, input.policy.readiness.lowHealthPercent)) {
      readyDefenders += 1;

      continue;
    }

    uncertainSupports += 1;
  }

  return Object.freeze({ readyDefenders, uncertainSupports });
}

function isRequesterReadyToDefend(readiness: RequesterReadinessSignal, arrivalClass: DefenseArrivalClass): boolean {
  const canArrive = arrivalClass === 'already_near' || arrivalClass === 'teleport_available';

  return readiness.alive === true && readiness.health === 'not_low' && readiness.disabled === false && canArrive;
}

function isConnectedAllyReadyToDefend(state: NormalizedClientState | null, lowHealthPercent: number): boolean {
  const hero = state?.snapshot.hero;

  return (
    hero?.alive === true &&
    hero.healthPercent !== null &&
    hero.healthPercent > lowHealthPercent &&
    deriveDisabledState(hero) === false
  );
}

function deriveNumericalRisk(
  enemyObservationAmbiguous: boolean,
  visibleEnemyLowerBound: number,
  readyDefenders: number
): DefenseNumericalRisk {
  if (enemyObservationAmbiguous) {
    return 'unknown';
  }

  return visibleEnemyLowerBound > readyDefenders ? 'outnumbered' : 'acceptable';
}

function deriveArrivalClass(
  requesterPosition: Position | null,
  teleportReadiness: TeleportReadiness,
  structurePositions: readonly Position[],
  structureRadius: number
): DefenseArrivalClass {
  if (requesterPosition === null) {
    return 'unknown';
  }

  if (distanceToNearestPosition(requesterPosition, structurePositions) <= structureRadius) {
    return 'already_near';
  }

  if (teleportReadiness.status === 'ready') {
    return 'teleport_available';
  }

  return teleportReadiness.status === 'unknown' ? 'unknown' : 'slow_or_unavailable';
}

function deriveDefenseResponse(
  structure: NormalizedStructureObservation,
  numericalRisk: DefenseNumericalRisk
): DefenseResponse {
  if (numericalRisk !== 'outnumbered') {
    return 'allowed';
  }

  if (structure.kind === 'ancient') {
    return 'last_stand';
  }

  if (structure.kind === 'tower' && (structure.tier === 1 || structure.tier === 2)) {
    return 'blocked';
  }

  return 'strong_penalty';
}

function countNearStructure(
  enemies: readonly VisibleEnemy[],
  structurePositions: readonly Position[],
  radius: number
): number {
  let nearbyEnemies = 0;

  for (const enemy of enemies) {
    if (distanceToNearestPosition(enemy.position, structurePositions) <= radius) {
      nearbyEnemies += 1;
    }
  }

  return nearbyEnemies;
}

function selectTeamCluster(
  context: CoachContext,
  policy: LostSignalPolicy,
  allies: readonly AlliedObservation[],
  enemies: readonly VisibleEnemy[]
): TeamClusterSignal | null {
  const candidates: TeamClusterSignal[] = [];

  function visit(startIndex: number, members: readonly AlliedObservation[]): void {
    const candidate = deriveTeamClusterCandidate(context, policy, members, enemies);

    if (candidate !== null) {
      candidates.push(candidate);
    }

    for (let index = startIndex; index < allies.length; index += 1) {
      const ally = allies[index]!;
      const fitsCluster = members.every(
        (member) => distance(member.position, ally.position) <= policy.proximity.teamClusterRadius
      );

      if (!fitsCluster) {
        continue;
      }

      visit(index + 1, [...members, ally]);
    }
  }

  visit(0, []);
  candidates.sort(compareTeamClusters);

  return candidates[0] ?? null;
}

function deriveTeamClusterCandidate(
  context: CoachContext,
  policy: LostSignalPolicy,
  members: readonly AlliedObservation[],
  enemies: readonly VisibleEnemy[]
): TeamClusterSignal | null {
  if (members.length < policy.proximity.minimumClusterSize) {
    return null;
  }

  const positions = members.map((member) => member.position);
  const center = averagePosition(positions);
  const visibleEnemyLowerBound = countEnemiesNearPosition(enemies, center, policy.proximity.teamClusterRadius);
  const destinationRisk = deriveDestinationRisk(
    context.unknowns.includes('enemy_observation_ambiguous'),
    visibleEnemyLowerBound,
    members.length
  );

  if (destinationRisk === 'contradicted') {
    return null;
  }

  return Object.freeze({
    heroNames: Object.freeze(members.map((member) => member.heroName)),
    connectedHeroNames: Object.freeze(
      members.filter((member) => member.connectedState !== null).map((member) => member.heroName)
    ),
    center,
    maxPairDistance: findMaximumPairDistance(positions),
    visibleEnemyLowerBound,
    destinationRisk,
  });
}

function countEnemiesNearPosition(enemies: readonly VisibleEnemy[], position: Position, radius: number): number {
  let nearbyEnemies = 0;

  for (const enemy of enemies) {
    if (distance(enemy.position, position) <= radius) {
      nearbyEnemies += 1;
    }
  }

  return nearbyEnemies;
}

function deriveDestinationRisk(
  enemyObservationAmbiguous: boolean,
  visibleEnemyLowerBound: number,
  clusterSize: number
): TeamClusterSignal['destinationRisk'] {
  if (enemyObservationAmbiguous) {
    return 'unknown';
  }

  return visibleEnemyLowerBound > clusterSize ? 'contradicted' : 'not_contradicted';
}

function compareTeamClusters(left: TeamClusterSignal, right: TeamClusterSignal): number {
  if (left.heroNames.length !== right.heroNames.length) {
    return right.heroNames.length - left.heroNames.length;
  }

  const leftHasConnected = left.connectedHeroNames.length > 0;
  const rightHasConnected = right.connectedHeroNames.length > 0;

  if (leftHasConnected !== rightHasConnected) {
    return leftHasConnected ? -1 : 1;
  }

  if (left.maxPairDistance !== right.maxPairDistance) {
    return left.maxPairDistance - right.maxPairDistance;
  }

  return left.heroNames.join('|').localeCompare(right.heroNames.join('|'));
}

function deriveIsolation(
  context: CoachContext,
  policy: LostSignalPolicy,
  mapDepth: MapDepthProjection,
  allies: readonly AlliedObservation[],
  enemies: readonly VisibleEnemy[]
): IsolationRiskSignal {
  const requesterPosition = context.requester.snapshot.hero?.position ?? null;
  const deep = deriveDeepState(mapDepth);
  const isolated = deriveIsolatedState(requesterPosition, allies, policy.proximity.teamClusterRadius);
  const missingEnemyCount = countMissingEnemies(context.enemyRoster, enemies);

  return Object.freeze({ deep, isolated, missingEnemyCount });
}

function deriveDeepState(mapDepth: MapDepthProjection): boolean | null {
  if (mapDepth.zone === 'unknown') {
    return null;
  }

  return mapDepth.zone === 'enemy_half' || mapDepth.zone === 'enemy_base';
}

function deriveIsolatedState(
  requesterPosition: Position | null,
  allies: readonly AlliedObservation[],
  clusterRadius: number
): boolean | null {
  if (requesterPosition === null) {
    return null;
  }

  return !allies.some((ally) => distance(ally.position, requesterPosition) <= clusterRadius);
}

function countMissingEnemies(enemyRoster: readonly string[], enemies: readonly VisibleEnemy[]): number {
  const missingEnemyNames = new Set(enemyRoster);

  for (const enemy of enemies) {
    missingEnemyNames.delete(enemy.heroName);
  }

  return missingEnemyNames.size;
}

function averagePosition(positions: readonly Position[]): Position {
  let x = 0;
  let y = 0;

  for (const position of positions) {
    x += position.x;
    y += position.y;
  }

  return Object.freeze({ x: x / positions.length, y: y / positions.length });
}

function findMaximumPairDistance(positions: readonly Position[]): number {
  let maximumDistance = 0;

  for (let leftIndex = 0; leftIndex < positions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < positions.length; rightIndex += 1) {
      maximumDistance = Math.max(maximumDistance, distance(positions[leftIndex]!, positions[rightIndex]!));
    }
  }

  return maximumDistance;
}

function distanceToNearestPosition(position: Position, destinations: readonly Position[]): number {
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const destination of destinations) {
    nearestDistance = Math.min(nearestDistance, distance(position, destination));
  }

  return nearestDistance;
}

function distance(left: Position, right: Position): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
