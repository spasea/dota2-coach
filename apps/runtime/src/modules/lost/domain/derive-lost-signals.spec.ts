import { describe, expect, it } from '@jest/globals';

import type {
  CoachContext,
  NormalizedHeroObservation,
  NormalizedStructureObservation,
  Position,
} from '../../match/public.js';
import { deriveLostSignals } from './derive-lost-signals.js';
import { createLostContext } from './lost-domain.spec-fixtures.js';
import type { LostPolicy } from './lost-policy.js';

const policy: LostPolicy = Object.freeze({
  schemaVersion: 1,
  mapDepth: Object.freeze({ centerHalfWidth: 1_200, baseBoundary: 7_700 }),
  proximity: Object.freeze({ structureRadius: 1_600, teamClusterRadius: 1_200, minimumClusterSize: 2 }),
  structureRisk: Object.freeze({
    criticalHealthPercent: 25,
    pressuredHealthPercent: 60,
    repeatedActiveDamageEvents: 2,
  }),
  readiness: Object.freeze({ lowHealthPercent: 25, lowManaPercent: 20 }),
});

describe('Lost requester readiness signals', () => {
  it.each([
    [25, 20, 'low', 'low'],
    [26, 21, 'not_low', 'not_low'],
    [null, null, 'unknown', 'unknown'],
  ] as const)('classifies HP %s and mana %s at the inclusive policy boundaries', (hp, mana, health, manaState) => {
    const context = createLostContext({ requester: { healthPercent: hp, manaPercent: mana } });

    expect(deriveLostSignals({ context, policy }).requesterReadiness).toMatchObject({
      health,
      mana: manaState,
    });
  });

  it('keeps low mana supporting while exposing confirmed disables and TP facts separately', () => {
    const context = createLostContext({
      requester: {
        healthPercent: 80,
        manaPercent: 20,
        disabled: true,
        teleportStatus: 'unavailable',
      },
    });

    expect(deriveLostSignals({ context, policy }).requesterReadiness).toEqual({
      alive: true,
      health: 'not_low',
      mana: 'low',
      disabled: true,
      teleportReadiness: { status: 'unavailable' },
      respawnSeconds: 0,
      buybackCost: 1_500,
      buybackCooldown: 0,
    });
  });
});

describe('Lost structure-risk signals', () => {
  it.each([
    ['critical HP boundary', tower(2), pressure({ health: 450 }), 'healthy', 'critical'],
    ['pressured HP boundary', tower(2), pressure({ health: 1_080 }), 'healthy', 'pressured'],
    ['healthy stable structure', tower(2), pressure({ health: 1_100 }), 'healthy', 'stable'],
    [
      'repeated active outer damage',
      tower(2),
      pressure({ health: 1_700, activeDamage: 100, activeDamageEvents: 2 }),
      'healthy',
      'critical',
    ],
    [
      'active T3 damage',
      tower(3),
      pressure({ health: 1_700, activeDamage: 50, activeDamageEvents: 1 }),
      'healthy',
      'critical',
    ],
    [
      'active T4 damage',
      tower(4),
      pressure({ health: 1_700, activeDamage: 50, activeDamageEvents: 1 }),
      'healthy',
      'critical',
    ],
    [
      'active barracks damage',
      barracks(),
      pressure({ health: 1_700, activeDamage: 50, activeDamageEvents: 1 }),
      'healthy',
      'critical',
    ],
    [
      'active Ancient damage',
      ancient(),
      pressure({ health: 1_700, activeDamage: 50, activeDamageEvents: 1 }),
      'healthy',
      'critical',
    ],
    [
      'recent outer damage',
      tower(2),
      pressure({ health: 1_700, recentDamage: 50, recentDamageEvents: 1 }),
      'healthy',
      'pressured',
    ],
    [
      'stale damage evidence',
      tower(2),
      pressure({ health: 1_700, activeDamage: 100, activeDamageEvents: 2 }),
      'stale',
      'stable',
    ],
  ] as const)(
    'classifies %s without estimating time to loss',
    (_caseName, structure, building, timelineStatus, level) => {
      const structureBuilding = {
        ...building,
        buildingId: structure.structureId,
        structureId: structure.structureId,
      };
      const context = createLostContext({
        minimapStructures: [structure],
        buildingPressure: { status: 'available', value: [structureBuilding] },
        timelineStatus,
      });

      expect(deriveLostSignals({ context, policy }).structureRisks[0]).toMatchObject({
        buildingId: structureBuilding.buildingId,
        structureId: structureBuilding.structureId,
        level,
      });
    }
  );

  it('returns deeply immutable signal collections', () => {
    const context = deepFreeze(
      pressuredDefenseContext({
        structure: tower(2),
        teammates: [connected('npc_dota_hero_axe', { x: 0, y: 100 }, 'client-02')],
        allies: [ally('npc_dota_hero_oracle', { x: 100, y: 0 })],
        enemies: [enemy('npc_dota_hero_sniper', { x: 100, y: 100 })],
      })
    );
    const serializedContext = JSON.stringify(context);
    const signals = deriveLostSignals({ context, policy: deepFreeze(policy) });

    expect(JSON.stringify(context)).toBe(serializedContext);
    expectDeepFrozen(signals);
  });
});

describe('Lost team-cluster signals', () => {
  it('prefers an equal-size safe cluster containing a connected player', () => {
    const context = createLostContext({
      requester: { position: { x: -6_000, y: -6_000 } },
      teammates: [connected('npc_dota_hero_invoker', { x: 4_000, y: 4_000 }, 'client-02')],
      minimapHeroes: [
        ally('npc_dota_hero_axe', { x: 0, y: 0 }),
        ally('npc_dota_hero_dazzle', { x: 0, y: 100 }),
        ally('npc_dota_hero_invoker', { x: -4_000, y: -4_000 }),
        ally('npc_dota_hero_oracle', { x: 4_000, y: 4_100 }),
      ],
    });

    expect(deriveLostSignals({ context, policy }).selectedTeamCluster).toMatchObject({
      heroNames: ['npc_dota_hero_invoker', 'npc_dota_hero_oracle'],
      connectedHeroNames: ['npc_dota_hero_invoker'],
      destinationRisk: 'not_contradicted',
    });
  });

  it('prefers a larger unconnected cluster over a connected singleton', () => {
    const context = createLostContext({
      teammates: [connected('npc_dota_hero_invoker', { x: 5_000, y: 5_000 }, 'client-02')],
      minimapHeroes: [
        ally('npc_dota_hero_axe', { x: 0, y: 0 }),
        ally('npc_dota_hero_dazzle', { x: 0, y: 200 }),
        ally('npc_dota_hero_oracle', { x: 200, y: 0 }),
      ],
    });

    expect(deriveLostSignals({ context, policy }).selectedTeamCluster).toMatchObject({
      heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle', 'npc_dota_hero_oracle'],
      connectedHeroNames: [],
    });
  });

  it('does not add weight for a second connected member once both equal-size clusters contain one', () => {
    const context = createLostContext({
      teammates: [
        connected('npc_dota_hero_axe', { x: 0, y: 0 }, 'client-02'),
        connected('npc_dota_hero_dazzle', { x: 0, y: 500 }, 'client-03'),
        connected('npc_dota_hero_invoker', { x: 4_000, y: 4_000 }, 'client-04'),
      ],
      minimapHeroes: [ally('npc_dota_hero_oracle', { x: 4_000, y: 4_100 })],
    });

    expect(deriveLostSignals({ context, policy }).selectedTeamCluster).toMatchObject({
      heroNames: ['npc_dota_hero_invoker', 'npc_dota_hero_oracle'],
      connectedHeroNames: ['npc_dota_hero_invoker'],
      maxPairDistance: 100,
    });
  });

  it('uses the inclusive radius and never inflates membership with duplicate hero markers', () => {
    const context = createLostContext({
      minimapHeroes: [
        ally('npc_dota_hero_axe', { x: 0, y: 0 }),
        ally('npc_dota_hero_axe', { x: 50, y: 50 }),
        ally('npc_dota_hero_dazzle', { x: 1_200, y: 0 }),
      ],
    });

    expect(deriveLostSignals({ context, policy }).selectedTeamCluster).toMatchObject({
      heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle'],
      maxPairDistance: 1_200,
    });
  });

  it('rejects a cluster destination contradicted by a stronger visible enemy lower bound', () => {
    const context = createLostContext({
      minimapHeroes: [
        ally('npc_dota_hero_axe', { x: 0, y: 0 }),
        ally('npc_dota_hero_dazzle', { x: 0, y: 100 }),
        enemy('npc_dota_hero_sniper', { x: 100, y: 0 }),
        enemy('npc_dota_hero_ursa', { x: 100, y: 100 }),
        enemy('npc_dota_hero_bristleback', { x: 200, y: 0 }),
      ],
    });

    expect(deriveLostSignals({ context, policy }).selectedTeamCluster).toBeNull();
  });
});

describe('Lost defense and isolation signals', () => {
  it('blocks isolated outnumbered T2 defense before scoring', () => {
    const context = pressuredDefenseContext({
      structure: tower(2),
      enemies: [
        enemy('npc_dota_hero_sniper', { x: 0, y: 100 }),
        enemy('npc_dota_hero_ursa', { x: 100, y: 0 }),
        enemy('npc_dota_hero_bristleback', { x: 100, y: 100 }),
      ],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      arrivalClass: 'teleport_available',
      readyDefenders: 1,
      visibleEnemyLowerBound: 3,
      numericalRisk: 'outnumbered',
      response: 'blocked',
    });
  });

  it('allows defense when two ready connected allies are already at the structure', () => {
    const context = pressuredDefenseContext({
      structure: tower(2),
      teammates: [
        connected('npc_dota_hero_axe', { x: 0, y: 100 }, 'client-02'),
        connected('npc_dota_hero_dazzle', { x: 100, y: 0 }, 'client-03'),
      ],
      enemies: [enemy('npc_dota_hero_sniper', { x: 100, y: 100 })],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      readyDefenders: 3,
      visibleEnemyLowerBound: 1,
      numericalRisk: 'acceptable',
      response: 'allowed',
    });
  });

  it.each([
    [tower(3), 'strong_penalty'],
    [tower(4), 'strong_penalty'],
    [barracks(), 'strong_penalty'],
    [ancient(), 'last_stand'],
  ] as const)('keeps outnumbered %s defense eligible only with its approved danger response', (structure, response) => {
    const context = pressuredDefenseContext({
      structure,
      enemies: [enemy('npc_dota_hero_sniper', { x: 0, y: 100 }), enemy('npc_dota_hero_ursa', { x: 100, y: 0 })],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      numericalRisk: 'outnumbered',
      response,
    });
  });

  it('counts a nearby unconnected ally only as uncertain positional support', () => {
    const structure = tower(2);
    const context = pressuredDefenseContext({
      structure,
      allies: [ally('npc_dota_hero_axe', { x: 100, y: 100 })],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      readyDefenders: 1,
      uncertainSupports: 1,
    });
  });

  it.each([
    ['low health', { healthPercent: 25 }],
    ['unknown health', { healthPercent: null }],
    ['unknown life state', { alive: null }],
    ['confirmed disable', { disabled: true }],
  ] as const)('keeps a nearby connected ally with %s as uncertain support', (_caseName, readiness) => {
    const context = pressuredDefenseContext({
      structure: tower(2),
      teammates: [connected('npc_dota_hero_axe', { x: 100, y: 100 }, 'client-02', readiness)],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      readyDefenders: 1,
      uncertainSupports: 1,
    });
  });

  it('does not disqualify requester or a nearby connected ally for low mana alone', () => {
    const context = pressuredDefenseContext({
      structure: tower(2),
      requester: { manaPercent: 20 },
      teammates: [connected('npc_dota_hero_axe', { x: 100, y: 100 }, 'client-02', { manaPercent: 20 })],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      readyDefenders: 2,
      uncertainSupports: 0,
    });
  });

  it('does not count a low-health requester as a defender after technical TP arrival', () => {
    const context = pressuredDefenseContext({
      structure: tower(2),
      requester: { healthPercent: 25 },
      enemies: [enemy('npc_dota_hero_sniper', { x: 100, y: 100 })],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      arrivalClass: 'teleport_available',
      readyDefenders: 0,
      uncertainSupports: 0,
      numericalRisk: 'outnumbered',
      response: 'blocked',
    });
  });

  it('does not count two remote connected TP-ready teammates as current defenders', () => {
    const context = pressuredDefenseContext({
      structure: tower(2),
      teammates: [
        connected('npc_dota_hero_axe', { x: 6_000, y: 6_000 }, 'client-02'),
        connected('npc_dota_hero_dazzle', { x: 6_100, y: 6_000 }, 'client-03'),
      ],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      readyDefenders: 1,
      uncertainSupports: 0,
    });
  });

  it('deduplicates visible enemy hero identity before reporting the lower bound', () => {
    const context = pressuredDefenseContext({
      structure: tower(2),
      enemies: [enemy('npc_dota_hero_sniper', { x: 0, y: 100 }), enemy('npc_dota_hero_sniper', { x: 100, y: 0 })],
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({
      visibleEnemyLowerBound: 1,
    });
  });

  it.each([
    ['already near at the inclusive radius', { position: { x: 1_600, y: 0 } }, 'already_near'],
    [
      'far without TP',
      { position: { x: 5_000, y: 5_000 }, teleportStatus: 'unavailable' as const },
      'slow_or_unavailable',
    ],
    ['missing requester position', { position: null }, 'unknown'],
  ] as const)('classifies %s without promising exact travel time', (_caseName, requester, arrivalClass) => {
    const structure = tower(2);
    const context = createLostContext({
      requester,
      minimapStructures: [structure],
      buildingPressure: {
        status: 'available',
        value: [
          {
            ...pressure({ health: 1_500, activeDamage: 100, activeDamageEvents: 1 }),
            buildingId: structure.structureId,
            structureId: structure.structureId,
          },
        ],
      },
    });

    expect(deriveLostSignals({ context, policy }).defenses[0]).toMatchObject({ arrivalClass });
  });

  it('marks a deep isolated requester with missing enemies without inventing trajectories', () => {
    const context = createLostContext({
      requester: { position: { x: 8_000, y: 0 } },
      enemyRoster: ['npc_dota_hero_sniper', 'npc_dota_hero_ursa', 'npc_dota_hero_bristleback'],
      minimapHeroes: [],
    });

    expect(deriveLostSignals({ context, policy }).isolation).toEqual({
      deep: true,
      isolated: true,
      missingEnemyCount: 3,
    });
  });
});

function ally(heroName: string, position: Position): NormalizedHeroObservation {
  return { heroName, team: 'radiant', position, markerKind: 'standard' };
}

function enemy(heroName: string, position: Position): NormalizedHeroObservation {
  return { heroName, team: 'dire', position, markerKind: 'enemy' };
}

type ConnectedReadiness = Readonly<{
  healthPercent?: number | null;
  manaPercent?: number | null;
  alive?: boolean | null;
  disabled?: boolean | null;
}>;

function connected(heroName: string, position: Position, clientId: string, readiness: ConnectedReadiness = {}) {
  return { clientId, heroName, position, teleportStatus: 'ready' as const, ...readiness };
}

function tower(tier: 2 | 3 | 4): NormalizedStructureObservation {
  return {
    structureId: tier === 4 ? 'radiant:tower:4' : `radiant:tower:${tier}:top`,
    team: 'radiant',
    kind: 'tower',
    tier,
    positions: [{ x: 0, y: 0 }],
  };
}

function barracks(): NormalizedStructureObservation {
  return {
    structureId: 'radiant:barracks:melee:top',
    team: 'radiant',
    kind: 'barracks',
    tier: null,
    positions: [{ x: 0, y: 0 }],
  };
}

function ancient(): NormalizedStructureObservation {
  return {
    structureId: 'radiant:ancient',
    team: 'radiant',
    kind: 'ancient',
    tier: null,
    positions: [{ x: 0, y: 0 }],
  };
}

type PressureOverrides = Readonly<{
  health?: number;
  activeDamage?: number;
  activeDamageEvents?: number;
  recentDamage?: number;
  recentDamageEvents?: number;
}>;

function pressure(overrides: PressureOverrides = {}) {
  return {
    buildingId: 'radiant:tower:2:top',
    structureId: 'radiant:tower:2:top',
    currentHealth: overrides.health ?? 1_800,
    maxHealth: 1_800,
    activeDamage: overrides.activeDamage ?? 0,
    activeDamageEvents: overrides.activeDamageEvents ?? 0,
    recentDamage: overrides.recentDamage ?? overrides.activeDamage ?? 0,
    recentDamageEvents: overrides.recentDamageEvents ?? overrides.activeDamageEvents ?? 0,
    pressureDamage: overrides.recentDamage ?? overrides.activeDamage ?? 0,
    lastDamageAgeMs: overrides.activeDamage === undefined && overrides.recentDamage === undefined ? null : 1_000,
  };
}

type DefenseScenario = Readonly<{
  structure: NormalizedStructureObservation;
  requester?: NonNullable<Parameters<typeof createLostContext>[0]>['requester'];
  teammates?: NonNullable<Parameters<typeof createLostContext>[0]>['teammates'];
  allies?: readonly NormalizedHeroObservation[];
  enemies?: readonly NormalizedHeroObservation[];
}>;

function pressuredDefenseContext(scenario: DefenseScenario): CoachContext {
  const building = {
    ...pressure({ health: 1_500, activeDamage: 100, activeDamageEvents: 1 }),
    buildingId: scenario.structure.structureId,
    structureId: scenario.structure.structureId,
  };

  return createLostContext({
    requester: {
      position: { x: 5_000, y: 5_000 },
      teleportStatus: 'ready',
      ...scenario.requester,
    },
    ...(scenario.teammates === undefined ? {} : { teammates: scenario.teammates }),
    minimapHeroes: [...(scenario.allies ?? []), ...(scenario.enemies ?? [])],
    minimapStructures: [scenario.structure],
    buildingPressure: { status: 'available', value: [building] },
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    return;
  }

  expect(Object.isFrozen(value)).toBe(true);

  for (const nested of Object.values(value)) {
    expectDeepFrozen(nested);
  }
}
