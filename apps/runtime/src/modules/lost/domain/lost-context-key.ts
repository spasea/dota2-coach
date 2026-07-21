import type { LostSignals } from './derive-lost-signals.js';

export function deriveLostContextKey(signals: LostSignals): string {
  void signals;
  throw new Error('Lost context-key derivation is not implemented.');
}
