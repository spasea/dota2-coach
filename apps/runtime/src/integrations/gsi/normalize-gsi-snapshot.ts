import type { NormalizedClientSnapshot } from '../../modules/match/public.js';

export function normalizeGsiSnapshot(snapshot: unknown): NormalizedClientSnapshot {
  void snapshot;

  return Object.freeze({
    sourceTimestampSeconds: null,
    match: null,
    player: null,
    hero: null,
    minimapHeroes: Object.freeze([]),
    buildings: Object.freeze([]),
    events: Object.freeze([]),
  });
}
