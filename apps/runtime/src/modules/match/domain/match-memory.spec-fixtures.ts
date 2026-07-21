import type { MatchSession } from './match-session.js';
import type { NormalizedClientState } from './normalized-client-state.js';
import type { NormalizedHeroObservation, NormalizedStructureObservation, Team } from './normalized-snapshot.js';

type StateInput = Readonly<{
  clientId?: string;
  receivedAt?: number;
  matchId?: string;
  team?: Team;
  minimapHeroes?: readonly NormalizedHeroObservation[];
  minimapStructures?: readonly NormalizedStructureObservation[];
}>;

export function createNormalizedClientState(input: StateInput = {}): NormalizedClientState {
  const clientId = input.clientId ?? 'client-01';

  return {
    identity: {
      clientId,
      discordUserId: `discord-${clientId}`,
      coachAlias: `Coach ${clientId}`,
      defaultRole: 2,
    },
    receivedAt: input.receivedAt ?? 1_000,
    snapshot: {
      sourceTimestampSeconds: null,
      match: {
        matchId: input.matchId ?? 'match-01',
        gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        gameTime: 120,
        clockTime: 30,
        paused: false,
        radiantScore: 1,
        direScore: 2,
      },
      player: {
        team: input.team ?? 'radiant',
        teamSlot: 0,
        gold: 1_500,
        lastHits: 50,
        denies: 5,
        gpm: 500,
        xpm: 600,
        goldFromHeroKills: 300,
        goldFromCreepKills: 1_000,
        goldFromIncome: 500,
        goldFromShared: 100,
      },
      hero: {
        heroName: 'npc_dota_hero_invoker',
        position: { x: 100, y: 200 },
        alive: true,
        respawnSeconds: null,
        buybackCost: null,
        buybackCooldown: null,
        healthPercent: 75,
        manaPercent: 60,
        level: 10,
        xp: 5_000,
        status: {
          stunned: null,
          silenced: null,
          hexed: null,
          muted: null,
          disarmed: null,
        },
        teleportReadiness: { status: 'unknown' },
      },
      minimapHeroes: input.minimapHeroes ?? [],
      minimapStructures: input.minimapStructures ?? [],
      buildings: [],
      events: [],
    },
  };
}

export function createMatchSession(overrides: Partial<MatchSession> = {}): MatchSession {
  return {
    matchId: 'match-01',
    team: 'radiant',
    timelineSourceClientId: 'client-01',
    timelineStatus: 'healthy',
    lastUsableSourceReceivedAt: 1_000,
    sourceObservedPostGame: false,
    ...overrides,
  };
}
