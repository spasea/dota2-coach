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
  return (command) => {
    dependencies.latestStateStore.save({
      identity: command.identity,
      receivedAt: dependencies.now().toISOString(),
      snapshot: command.snapshot,
    });
  };
}
