export {
  createRecordClientSnapshot,
  type RecordClientSnapshot,
  type RecordClientSnapshotCommand,
} from './application/record-client-snapshot.js';
export type { LatestStateStore } from './application/latest-state-store.js';
export type { ClientIdentity, ClientSnapshot, LatestClientState } from './domain/latest-client-state.js';
export { createInMemoryLatestStateStore } from './infrastructure/in-memory-latest-state-store.js';
