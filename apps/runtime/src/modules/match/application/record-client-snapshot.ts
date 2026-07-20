import type { LatestStateStore } from './latest-state-store.js';
import type { ClientIdentity, ClientSnapshot } from '../domain/latest-client-state.js';

export type RecordClientSnapshotCommand = Readonly<{
  identity: ClientIdentity;
  snapshot: ClientSnapshot;
}>;

export type RecordClientSnapshot = (command: RecordClientSnapshotCommand) => void;

type RecordClientSnapshotDependencies = Readonly<{
  latestStateStore: LatestStateStore;
  now: () => Date;
}>;

export function createRecordClientSnapshot(dependencies: RecordClientSnapshotDependencies): RecordClientSnapshot {
  void dependencies;

  return () => {
    throw new Error('Phase 5 record-client-snapshot behavior is not implemented.');
  };
}
