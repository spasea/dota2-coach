export type LostMapDepthPolicy = Readonly<{
  centerHalfWidth: number;
  baseBoundary: number;
}>;

export type LostProximityPolicy = Readonly<{
  structureRadius: number;
  teamClusterRadius: number;
  minimumClusterSize: number;
}>;

export type LostStructureRiskPolicy = Readonly<{
  criticalHealthPercent: number;
  pressuredHealthPercent: number;
  repeatedActiveDamageEvents: number;
}>;

export type LostPolicy = Readonly<{
  schemaVersion: 1;
  mapDepth: LostMapDepthPolicy;
  proximity: LostProximityPolicy;
  structureRisk: LostStructureRiskPolicy;
}>;
