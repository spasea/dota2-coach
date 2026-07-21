import { describe, expect, it } from '@jest/globals';

import { projectMapDepth, type MapDepthZone } from './map-depth.js';

const policy = Object.freeze({ centerHalfWidth: 1_200, baseBoundary: 7_700 });

describe('Lost map depth', () => {
  it.each([
    [-7_701, 'own_base'],
    [-7_700, 'own_half'],
    [-1_200, 'river_or_center'],
    [1_200, 'river_or_center'],
    [1_201, 'enemy_half'],
    [7_700, 'enemy_half'],
    [7_701, 'enemy_base'],
  ] as const)('assigns Radiant oriented depth %s to %s', (depth, zone) => {
    expect(projectMapDepth({ position: { x: depth, y: 0 }, team: 'radiant', policy })).toEqual({
      zone,
      orientedDepth: depth,
    } satisfies Readonly<{ zone: MapDepthZone; orientedDepth: number }>);
  });

  it.each([-8_000, -2_000, 0, 2_000, 8_000])('mirrors depth %s for Dire', (radiantDepth) => {
    const radiant = projectMapDepth({
      position: { x: radiantDepth, y: 0 },
      team: 'radiant',
      policy,
    });
    const dire = projectMapDepth({
      position: { x: -radiantDepth, y: 0 },
      team: 'dire',
      policy,
    });

    expect(dire).toEqual(radiant);
  });

  it('preserves unknown position without inventing a zone', () => {
    expect(projectMapDepth({ position: null, team: 'radiant', policy })).toEqual({
      zone: 'unknown',
      orientedDepth: null,
    });
  });

  it('returns an immutable projection', () => {
    expect(Object.isFrozen(projectMapDepth({ position: { x: 0, y: 0 }, team: 'radiant', policy }))).toBe(true);
  });
});
