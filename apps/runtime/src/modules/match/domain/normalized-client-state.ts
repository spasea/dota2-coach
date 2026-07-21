import type { ClientIdentity } from './client-identity.js';
import type { NormalizedClientSnapshot } from './normalized-snapshot.js';

export type NormalizedClientState = Readonly<{
  identity: ClientIdentity;
  receivedAt: number;
  snapshot: NormalizedClientSnapshot;
}>;
