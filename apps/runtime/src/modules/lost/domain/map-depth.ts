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

export function projectMapDepth(input: ProjectMapDepthInput): MapDepthProjection {
  void input;
  throw new Error('Lost map-depth projection is not implemented.');
}
