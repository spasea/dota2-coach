import type { LostSignals } from './derive-lost-signals.js';

export function deriveLostContextKey(signals: LostSignals): string {
  const context = {
    readiness: {
      alive: signals.requesterReadiness.alive,
      health: signals.requesterReadiness.health,
      mana: signals.requesterReadiness.mana,
      disabled: signals.requesterReadiness.disabled,
      teleport: signals.requesterReadiness.teleportReadiness.status,
    },
    mapDepth: signals.requesterMapDepth.zone,
    isolation: signals.isolation,
    structures: signals.structureRisks
      .map((risk) => ({
        structureId: risk.structureId,
        level: risk.level,
        damageActivity: risk.damageActivity,
        repeatedActiveDamage: risk.activeDamageEvents > 1,
      }))
      .sort((left, right) => left.structureId.localeCompare(right.structureId)),
    defenses: signals.defenses
      .map((defense) => ({
        structureId: defense.structureId,
        arrivalClass: defense.arrivalClass,
        numericalRisk: defense.numericalRisk,
        response: defense.response,
        hasUncertainSupport: defense.uncertainSupports > 0,
      }))
      .sort((left, right) => left.structureId.localeCompare(right.structureId)),
    cluster:
      signals.selectedTeamCluster === null
        ? null
        : {
            heroNames: [...signals.selectedTeamCluster.heroNames].sort(),
            connectedHeroNames: [...signals.selectedTeamCluster.connectedHeroNames].sort(),
            destinationRisk: signals.selectedTeamCluster.destinationRisk,
            visibleEnemyLowerBound: signals.selectedTeamCluster.visibleEnemyLowerBound,
          },
    unknowns: [...signals.unknowns].sort(),
  };

  return `lost:v1:${JSON.stringify(context)}`;
}
