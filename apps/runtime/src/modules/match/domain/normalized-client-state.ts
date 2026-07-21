import type { ClientIdentity } from './latest-client-state.js';
import type { NormalizedClientSnapshot } from './normalized-snapshot.js';

export type NormalizedClientState = Readonly<{
  identity: ClientIdentity;
  receivedAt: number;
  snapshot: NormalizedClientSnapshot;
}>;
