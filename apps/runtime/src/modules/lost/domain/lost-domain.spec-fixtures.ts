import type {
  CoachContext,
  MatchContextUnknown,
  NormalizedClientState,
  NormalizedHeroFacts,
  NormalizedHeroObservation,
  NormalizedStructureObservation,
  Position,
  Team,
} from '../../match/public.js';

const ACTIVE_GAME_STATE = 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';

type ClientScenario = Readonly<{
  clientId: string;
  heroName: string;
  team?: Team;
  position: Position | null;
  healthPercent?: number | null;
  manaPercent?: number | null;
  alive?: boolean | null;
  disabled?: boolean | null;
  teleportStatus?: NormalizedHeroFacts['teleportReadiness']['status'];
}>;

type ContextScenario = Readonly<{
  team?: Team;
  requester?: Partial<ClientScenario>;
  teammates?: readonly ClientScenario[];
  minimapHeroes?: readonly NormalizedHeroObservation[];
  minimapStructures?: readonly NormalizedStructureObservation[];
  buildingPressure?: CoachContext['temporalFeatures']['buildingPressure'];
  timelineStatus?: CoachContext['temporalFeatures']['timelineStatus'];
  gameState?: string | null;
  paused?: boolean | null;
  enemyRoster?: readonly string[];
  unknowns?: readonly MatchContextUnknown[];
}>;

export function createClientState(scenario: ClientScenario): NormalizedClientState {
  const disabled = scenario.disabled === undefined ? false : scenario.disabled;

  return {
    identity: {
      clientId: scenario.clientId,
      discordUserId: `10000000000000000${scenario.clientId.slice(-1)}`,
      coachAlias: scenario.clientId,
      defaultRole: 2,
    },
    receivedAt: 10_000,
    snapshot: {
      sourceTimestampSeconds: 1_784_000_000,
      match: {
        matchId: 'match-01',
        gameState: ACTIVE_GAME_STATE,
        gameTime: 1_200,
        clockTime: 1_200,
        paused: false,
        radiantScore: 20,
        direScore: 18,
      },
      player: {
        team: scenario.team ?? 'radiant',
        teamSlot: 0,
        gold: 1_000,
        lastHits: 100,
        denies: 5,
        gpm: 450,
        xpm: 500,
        goldFromHeroKills: 500,
        goldFromCreepKills: 500,
        goldFromIncome: 500,
        goldFromShared: 100,
      },
      hero: {
        heroName: scenario.heroName,
        position: scenario.position,
        alive: scenario.alive === undefined ? true : scenario.alive,
        respawnSeconds: scenario.alive === false ? 20 : 0,
        buybackCost: 1_500,
        buybackCooldown: 0,
        healthPercent: scenario.healthPercent === undefined ? 100 : scenario.healthPercent,
        manaPercent: scenario.manaPercent === undefined ? 100 : scenario.manaPercent,
        level: 14,
        xp: 12_000,
        status: {
          stunned: disabled,
          silenced: false,
          hexed: false,
          muted: false,
          disarmed: false,
        },
        teleportReadiness: { status: scenario.teleportStatus ?? 'ready' },
      },
      minimapHeroes: [],
      minimapStructures: [],
      buildings: [],
      events: [],
    },
  };
}

export function createLostContext(scenario: ContextScenario = {}): CoachContext {
  const team = scenario.team ?? 'radiant';
  const requesterScenario: ClientScenario = {
    clientId: 'client-01',
    heroName: 'npc_dota_hero_lich',
    team,
    position: { x: 4_859, y: -6_379 },
    ...scenario.requester,
  };
  const requester = createClientState(requesterScenario);
  const sharedSnapshot = {
    ...requester.snapshot,
    match:
      requester.snapshot.match === null
        ? null
        : {
            ...requester.snapshot.match,
            gameState: scenario.gameState === undefined ? requester.snapshot.match.gameState : scenario.gameState,
            paused: scenario.paused === undefined ? requester.snapshot.match.paused : scenario.paused,
          },
    minimapHeroes: scenario.minimapHeroes ?? [],
    minimapStructures: scenario.minimapStructures ?? [],
  };

  return {
    requester,
    effectiveRole: 2,
    teammates: scenario.teammates?.map((ally) => createClientState({ team, ...ally })) ?? [],
    coverage: ((scenario.teammates?.length ?? 0) + 1) / 5,
    matchId: 'match-01',
    team,
    sharedSnapshot,
    alliedRoster: [requesterScenario.heroName, ...(scenario.teammates?.map((ally) => ally.heroName) ?? [])],
    enemyRoster: scenario.enemyRoster ?? [],
    temporalFeatures: {
      timelineStatus: scenario.timelineStatus ?? 'healthy',
      mapTransitions: [],
      enemyHeroes: [],
      requesterHistory: { status: 'unavailable', reason: 'requester_history_unavailable' },
      playerHistories: [],
      buildingPressure:
        scenario.buildingPressure ?? ({ status: 'unavailable', reason: 'building_history_unavailable' } as const),
      events: [],
    },
    unknowns: scenario.unknowns ?? [],
  };
}
