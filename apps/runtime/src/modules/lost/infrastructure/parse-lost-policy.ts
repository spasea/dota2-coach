import type { LostPolicy } from '../domain/lost-policy.js';

export function parseLostPolicy(yaml: string): LostPolicy {
  void yaml;
  throw new Error('Lost policy parsing is not implemented.');
}
