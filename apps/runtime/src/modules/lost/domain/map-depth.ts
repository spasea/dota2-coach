import type { Position, Team } from '../../match/public.js';
import type { LostMapDepthPolicy } from './lost-policy.js';

export type MapDepthZone = 'own_base' | 'own_half' | 'river_or_center' | 'enemy_half' | 'enemy_base' | 'unknown';

export type MapDepthProjection = Readonly<{
  zone: MapDepthZone;
  orientedDepth: number | null;
}>;

export type ProjectMapDepthInput = Readonly<{
  position: Position | null;
  team: Team;
  policy: LostMapDepthPolicy;
}>;

const getMapZone = (orientedDepth: number, baseBoundary: number, centerHalfWidth: number): MapDepthZone => {
  if (orientedDepth < -baseBoundary) {
    return 'own_base';
  }

  if (orientedDepth < -centerHalfWidth) {
    return 'own_half';
  }

  if (orientedDepth <= centerHalfWidth) {
    return 'river_or_center';
  }

  if (orientedDepth <= baseBoundary) {
    return 'enemy_half';
  }

  return 'enemy_base';
};

export function projectMapDepth(input: ProjectMapDepthInput): MapDepthProjection {
  if (input.position === null) {
    return Object.freeze({ zone: 'unknown', orientedDepth: null });
  }

  const radiantDepth = input.position.x + input.position.y;
  const teamDepth = input.team === 'radiant' ? radiantDepth : -radiantDepth;
  const orientedDepth = Object.is(teamDepth, -0) ? 0 : teamDepth;
  const { baseBoundary, centerHalfWidth } = input.policy;
  const zone = getMapZone(orientedDepth, baseBoundary, centerHalfWidth);

  return Object.freeze({ zone, orientedDepth });
}
