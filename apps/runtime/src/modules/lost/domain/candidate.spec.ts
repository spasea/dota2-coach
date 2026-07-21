import { describe, expect, it } from '@jest/globals';

import type { BuildCoachContextResult } from '../../match/public.js';
import { evaluateCandidateSafety, type LostAction } from './candidate.js';
import type { LostSignals, StructureDamageActivity } from './derive-lost-signals.js';
import { createLostContext } from './lost-domain.spec-fixtures.js';

describe('Lost hard outcomes', () => {
  it.each([
    'client_not_found',
    'snapshot_missing',
    'snapshot_stale',
    'match_unavailable',
    'outside_active_session',
  ] as const)('maps %s context without producing directional candidates', (status) => {
    expect(evaluateCandidateSafety({ contextResult: { status }, signals: null })).toEqual({
      status: 'unavailable',
      reason: status,
    });
  });

  it('maps a non-active game to explicit unavailability', () => {
    const context = createLostContext({ gameState: 'DOTA_GAMERULES_STATE_PRE_GAME' });

    expect(evaluateCandidateSafety({ contextResult: { status: 'ready', context }, signals: readySignals() })).toEqual({
      status: 'unavailable',
      reason: 'game_not_in_progress',
    });
  });

  it.each([
    ['requester death', createLostContext({ requester: { alive: false } }), 'requester_dead'],
    ['paused match', createLostContext({ paused: true }), 'match_paused'],
  ] as const)('maps %s to a non-scored hold outcome', (_caseName, context, reason) => {
    expect(evaluateCandidateSafety({ contextResult: { status: 'ready', context }, signals: readySignals() })).toEqual({
      status: 'hold',
      reason,
    });
  });

  it('holds when critical unknowns leave no safe directional candidate', () => {
    const context = createLostContext({ unknowns: ['timeline_stale', 'building_history_unavailable'] });
    const signals = readySignals({
      requesterReadiness: {
        ...readySignals().requesterReadiness,
        health: 'unknown',
        mana: 'unknown',
        disabled: null,
        teleportReadiness: { status: 'unknown' },
      },
      isolation: { deep: null, isolated: null, missingEnemyCount: 5 },
      unknowns: context.unknowns,
    });

    expect(evaluateCandidateSafety({ contextResult: { status: 'ready', context }, signals })).toEqual({
      status: 'hold',
      reason: 'insufficient_evidence',
    });
  });
});

describe('Lost candidate safety', () => {
  it('returns exactly the four fixed directional candidates in deterministic order', () => {
    const result = evaluateCandidateSafety({
      contextResult: readyContextResult(),
      signals: readySignals(),
    });

    expect(result).toMatchObject({
      status: 'candidates',
      candidates: [{ action: 'RESET' }, { action: 'DEFEND' }, { action: 'REGROUP' }, { action: 'FARM_SAFELY' }],
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.status === 'candidates' && Object.isFrozen(result.candidates)).toBe(true);
    expect(result.status === 'candidates' && result.candidates.every(Object.isFrozen)).toBe(true);
  });

  it('blocks solo T2 defense against three visible enemies before scoring', () => {
    const signals = readySignals({
      structureRisks: [structureRisk('pressured')],
      defenses: [
        {
          buildingId: 'radiant:tower:2:top',
          structureId: 'radiant:tower:2:top',
          arrivalClass: 'teleport_available',
          readyDefenders: 1,
          uncertainSupports: 0,
          visibleEnemyLowerBound: 3,
          numericalRisk: 'outnumbered',
          response: 'blocked',
        },
      ],
    });

    expectCandidate(signals, 'DEFEND').toMatchObject({
      eligible: false,
      blockers: ['isolated_outnumbered_outer_defense'],
      guardrails: ['avoid_solo_defense'],
    });
    expectCandidate(signals, 'FARM_SAFELY').toMatchObject({
      eligible: true,
      guardrails: ['avoid_solo_defense'],
    });
  });

  it('does not turn remote connected teammates into committed defenders', () => {
    const signals = readySignals({
      structureRisks: [structureRisk('pressured')],
      defenses: [
        {
          buildingId: 'radiant:tower:2:top',
          structureId: 'radiant:tower:2:top',
          arrivalClass: 'teleport_available',
          readyDefenders: 1,
          uncertainSupports: 0,
          visibleEnemyLowerBound: 3,
          numericalRisk: 'outnumbered',
          response: 'blocked',
        },
      ],
    });

    expectCandidate(signals, 'DEFEND').toMatchObject({
      eligible: false,
      blockers: ['isolated_outnumbered_outer_defense'],
    });
  });

  it('keeps local low-HP RESET eligible regardless of partial team coverage', () => {
    const context = createLostContext({ unknowns: ['partial_team_coverage'], requester: { healthPercent: 18 } });
    const signals = readySignals({
      requesterReadiness: { ...readySignals().requesterReadiness, health: 'low' },
      unknowns: context.unknowns,
    });

    expectCandidate(signals, 'RESET', context).toMatchObject({ eligible: true, blockers: [] });
  });

  it('allows REGROUP only toward a confirmed safe allied cluster', () => {
    const signals = readySignals({
      selectedTeamCluster: {
        heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle'],
        connectedHeroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle'],
        center: { x: 0, y: 50 },
        maxPairDistance: 100,
        visibleEnemyLowerBound: 0,
        destinationRisk: 'not_contradicted',
      },
    });

    expectCandidate(signals, 'REGROUP').toMatchObject({ eligible: true, blockers: [] });
  });

  it('rejects a regroup destination contradicted by a stronger visible enemy cluster', () => {
    const signals = readySignals({
      selectedTeamCluster: {
        heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle'],
        connectedHeroNames: [],
        center: { x: 0, y: 50 },
        maxPairDistance: 100,
        visibleEnemyLowerBound: 3,
        destinationRisk: 'contradicted',
      },
    });

    expectCandidate(signals, 'REGROUP').toMatchObject({
      eligible: false,
      blockers: ['safe_cluster_unavailable'],
    });
  });

  it('does not treat zero visible enemies as proof that a regroup destination is safe', () => {
    const signals = readySignals({
      selectedTeamCluster: {
        heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_dazzle'],
        connectedHeroNames: ['npc_dota_hero_axe'],
        center: { x: 0, y: 50 },
        maxPairDistance: 100,
        visibleEnemyLowerBound: 0,
        destinationRisk: 'not_contradicted',
      },
    });

    expectCandidate(signals, 'REGROUP').toMatchObject({
      unknowns: ['enemy_count_is_lower_bound'],
      risks: ['enemy_count_is_lower_bound'],
    });
  });

  it('keeps low mana supporting without forcing RESET or HOLD', () => {
    const signals = readySignals({
      requesterReadiness: { ...readySignals().requesterReadiness, mana: 'low' },
    });

    expectCandidate(signals, 'FARM_SAFELY').toMatchObject({ eligible: true });
  });

  it('adds conservative guardrails for a deep isolated requester with missing enemies', () => {
    const signals = readySignals({
      requesterMapDepth: { zone: 'enemy_base', orientedDepth: 8_000 },
      isolation: { deep: true, isolated: true, missingEnemyCount: 3 },
    });

    expectCandidate(signals, 'FARM_SAFELY').toMatchObject({
      eligible: true,
      guardrails: ['do_not_farm_deep', 'retreat_on_enemy_visibility_drop'],
    });
  });

  it('never opens current DEFEND urgency from stale pressure evidence', () => {
    const context = createLostContext({ unknowns: ['timeline_stale'], timelineStatus: 'stale' });
    const signals = readySignals({
      structureRisks: [structureRisk('pressured', 'unknown')],
      unknowns: context.unknowns,
    });

    expectCandidate(signals, 'DEFEND', context).toMatchObject({
      eligible: false,
      blockers: ['structure_pressure_unavailable'],
    });
  });

  it('propagates ambiguous enemy observations as uncertainty instead of a precise threat count', () => {
    const context = createLostContext({ unknowns: ['enemy_observation_ambiguous'] });
    const signals = readySignals({
      defenses: [
        {
          buildingId: 'radiant:tower:2:top',
          structureId: 'radiant:tower:2:top',
          arrivalClass: 'already_near',
          readyDefenders: 2,
          uncertainSupports: 0,
          visibleEnemyLowerBound: 1,
          numericalRisk: 'unknown',
          response: 'allowed',
        },
      ],
      unknowns: context.unknowns,
    });

    expectCandidate(signals, 'DEFEND', context).toMatchObject({
      risks: ['enemy_observation_ambiguous'],
      unknowns: ['enemy_observation_ambiguous'],
    });
  });
});

function readyContextResult(context = createLostContext()): BuildCoachContextResult {
  return { status: 'ready', context };
}

function readySignals(overrides: Partial<LostSignals> = {}): LostSignals {
  return {
    requesterMapDepth: { zone: 'own_half', orientedDepth: -2_000 },
    requesterReadiness: {
      alive: true,
      health: 'not_low',
      mana: 'not_low',
      disabled: false,
      teleportReadiness: { status: 'ready' },
      respawnSeconds: 0,
      buybackCost: 1_500,
      buybackCooldown: 0,
    },
    structureRisks: [],
    defenses: [],
    selectedTeamCluster: null,
    isolation: { deep: false, isolated: false, missingEnemyCount: 0 },
    unknowns: [],
    ...overrides,
  };
}

function structureRisk(level: 'stable' | 'pressured' | 'critical', damageActivity: StructureDamageActivity = 'active') {
  return {
    buildingId: 'radiant:tower:2:top',
    structureId: 'radiant:tower:2:top',
    level,
    damageActivity,
    activeDamageEvents: damageActivity === 'active' ? 1 : 0,
    recentDamageEvents: damageActivity === 'none' ? 0 : 1,
    lastDamageAgeMs: damageActivity === 'none' ? null : 1_000,
  };
}

function expectCandidate(signals: LostSignals, action: LostAction, context = createLostContext()) {
  const result = evaluateCandidateSafety({ contextResult: readyContextResult(context), signals });

  expect(result.status).toBe('candidates');

  if (result.status !== 'candidates') {
    throw new Error(`Expected candidate result, received ${result.status}.`);
  }

  return expect(result.candidates.find((candidate) => candidate.action === action));
}
