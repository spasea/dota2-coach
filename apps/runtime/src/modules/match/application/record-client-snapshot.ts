import type { ClientIdentity } from '../domain/client-identity.js';
import type { NormalizedClientSnapshot } from '../domain/normalized-snapshot.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';

export type RecordClientSnapshotCommand = Readonly<{
  identity: ClientIdentity;
  snapshot: NormalizedClientSnapshot;
}>;

export type RecordClientSnapshot = (command: RecordClientSnapshotCommand) => void;

type RecordClientSnapshotDependencies = Readonly<{
  latestStateStore: NormalizedLatestStateStore;
  monotonicNow: () => number;
}>;

export function createRecordClientSnapshot(dependencies: RecordClientSnapshotDependencies): RecordClientSnapshot {
  return (command) => {
    dependencies.latestStateStore.save({
      identity: command.identity,
      receivedAt: dependencies.monotonicNow(),
      snapshot: command.snapshot,
    });
  };
}
