import { describe, expect, it } from '@jest/globals';

import { createRankedCandidate, decisionPolicy } from './lost-decision.spec-fixtures.js';
import type { LostAdviceMemory } from './recommendation.js';
import { applyLostStability } from './stability.js';

describe('Lost advice stability', () => {
  it('adds the bounded bonus to the same eligible action inside the compatible window', () => {
    const candidates = [createRankedCandidate('FARM_SAFELY', 40), createRankedCandidate('REGROUP', 42)];

    expect(apply({ candidates, now: 39_999 })).toEqual([
      expect.objectContaining({ action: 'FARM_SAFELY', score: 45 }),
      expect.objectContaining({ action: 'REGROUP', score: 42 }),
    ]);
  });

  it.each([
    ['the exact upper boundary', 40_000],
    ['a negative clock age', 9_999],
  ])('ignores previous advice at %s', (_caseName, now) => {
    const candidates = [createRankedCandidate('FARM_SAFELY', 40), createRankedCandidate('REGROUP', 42)];

    expect(apply({ candidates, now })).toEqual(candidates);
  });

  it.each([
    ['match mismatch', { matchId: 'match-02' }],
    ['team mismatch', { team: 'dire' as const }],
    ['context mismatch', { contextKey: 'lost:v1:changed' }],
  ])('invalidates memory on %s', (_caseName, override) => {
    const candidates = [createRankedCandidate('FARM_SAFELY', 40)];

    expect(apply({ candidates, previous: previousAdvice(override) })).toEqual(candidates);
  });

  it('bypasses hysteresis for an urgent or material change', () => {
    const candidates = [createRankedCandidate('FARM_SAFELY', 40), createRankedCandidate('DEFEND', 42)];

    expect(apply({ candidates, bypass: true })).toEqual(candidates);
  });

  it('does not resurrect a previous action that is no longer eligible', () => {
    const candidates = [createRankedCandidate('DEFEND', 42)];

    expect(apply({ candidates })).toEqual(candidates);
  });
});

type ApplyOverrides = Readonly<{
  candidates: readonly ReturnType<typeof createRankedCandidate>[];
  previous?: LostAdviceMemory;
  now?: number;
  bypass?: boolean;
}>;

function apply(overrides: ApplyOverrides) {
  return applyLostStability({
    candidates: overrides.candidates,
    previous: overrides.previous ?? previousAdvice(),
    matchId: 'match-01',
    team: 'radiant',
    contextKey: 'lost:v1:stable',
    now: overrides.now ?? 20_000,
    bypass: overrides.bypass ?? false,
    policy: decisionPolicy.stability,
  });
}

function previousAdvice(overrides: Partial<LostAdviceMemory> = {}): LostAdviceMemory {
  return Object.freeze({
    clientId: 'client-01',
    matchId: 'match-01',
    team: 'radiant',
    action: 'FARM_SAFELY',
    score: 40,
    contextKey: 'lost:v1:stable',
    createdAt: 10_000,
    ...overrides,
  });
}
