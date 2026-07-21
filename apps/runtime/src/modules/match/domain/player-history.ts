import type { NormalizedClientState } from './normalized-client-state.js';
import type { Position } from './normalized-snapshot.js';

export type PlayerTemporalSample = Readonly<{
  receivedAt: number;
  gameTime: number;
  position: Position;
  alive: boolean;
  healthPercent: number;
  manaPercent: number;
  level: number;
  xp: number;
  gold: number;
  lastHits: number;
  denies: number;
  gpm: number;
  xpm: number;
  goldFromHeroKills: number;
  goldFromCreepKills: number;
  goldFromIncome: number;
  goldFromShared: number;
}>;

export type PlayerHistory = Readonly<{
  clientId: string;
  lastUsableReceivedAt: number;
  samples: readonly PlayerTemporalSample[];
}>;

export type PlayerHistoryMemory = readonly PlayerHistory[];

export type ReducePlayerHistoryInput = Readonly<{
  memory: PlayerHistoryMemory;
  state: NormalizedClientState;
  freshnessMs: number;
  retentionMs: number;
}>;

export function reducePlayerHistory(input: ReducePlayerHistoryInput): PlayerHistoryMemory {
  if (!Number.isFinite(input.freshnessMs) || input.freshnessMs <= 0) {
    throw new RangeError('Freshness must be a positive finite number.');
  }

  if (!Number.isFinite(input.retentionMs) || input.retentionMs <= 0) {
    throw new RangeError('Player history retention must be a positive finite number.');
  }

  const match = input.state.snapshot.match;
  const player = input.state.snapshot.player;
  const hero = input.state.snapshot.hero;
  const position = hero?.position;
  const numericValues = [
    match?.gameTime,
    position?.x,
    position?.y,
    hero?.healthPercent,
    hero?.manaPercent,
    hero?.level,
    hero?.xp,
    player?.gold,
    player?.lastHits,
    player?.denies,
    player?.gpm,
    player?.xpm,
    player?.goldFromHeroKills,
    player?.goldFromCreepKills,
    player?.goldFromIncome,
    player?.goldFromShared,
  ];

  if (hero?.alive === null || hero?.alive === undefined || numericValues.some((value) => !Number.isFinite(value))) {
    return input.memory;
  }

  const sample: PlayerTemporalSample = Object.freeze({
    receivedAt: input.state.receivedAt,
    gameTime: match!.gameTime!,
    position: Object.freeze({ x: position!.x, y: position!.y }),
    alive: hero.alive,
    healthPercent: hero.healthPercent!,
    manaPercent: hero.manaPercent!,
    level: hero.level!,
    xp: hero.xp!,
    gold: player!.gold!,
    lastHits: player!.lastHits!,
    denies: player!.denies!,
    gpm: player!.gpm!,
    xpm: player!.xpm!,
    goldFromHeroKills: player!.goldFromHeroKills!,
    goldFromCreepKills: player!.goldFromCreepKills!,
    goldFromIncome: player!.goldFromIncome!,
    goldFromShared: player!.goldFromShared!,
  });
  const existing = input.memory.find((history) => history.clientId === input.state.identity.clientId);
  const hasContinuity =
    existing !== undefined && input.state.receivedAt - existing.lastUsableReceivedAt < input.freshnessMs;
  const retainedSamples = hasContinuity
    ? existing.samples.filter((entry) => input.state.receivedAt - entry.receivedAt < input.retentionMs)
    : [];
  const updatedHistory: PlayerHistory = Object.freeze({
    clientId: input.state.identity.clientId,
    lastUsableReceivedAt: input.state.receivedAt,
    samples: Object.freeze([...retainedSamples, sample]),
  });
  const histories = input.memory.filter((history) => history.clientId !== updatedHistory.clientId);
  histories.push(updatedHistory);
  histories.sort((left, right) => left.clientId.localeCompare(right.clientId));

  return Object.freeze(histories);
}
