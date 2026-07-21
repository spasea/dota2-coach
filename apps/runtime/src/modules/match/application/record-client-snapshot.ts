import type { ClientIdentity } from '../domain/client-identity.js';
import { advanceMatchSession, type TimelineStatus } from '../domain/match-session.js';
import type { NormalizedClientSnapshot, Team } from '../domain/normalized-snapshot.js';
import type { MatchSessionStore } from './match-session-store.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';

export type RecordClientSnapshotCommand = Readonly<{
  identity: ClientIdentity;
  snapshot: NormalizedClientSnapshot;
}>;

export type RecordClientSnapshot = (command: RecordClientSnapshotCommand) => void;

type MatchLifecycleTransitionMetadata = Readonly<{
  clientId: string;
  matchId: string;
  team: Team;
  timelineStatus: TimelineStatus | null;
}>;

type RecordClientSnapshotDependencies = Readonly<{
  freshnessMs: number;
  latestStateStore: NormalizedLatestStateStore;
  logLifecycleTransition: (metadata: MatchLifecycleTransitionMetadata) => void;
  matchSessionStore: MatchSessionStore;
  monotonicNow: () => number;
}>;

export function createRecordClientSnapshot(dependencies: RecordClientSnapshotDependencies): RecordClientSnapshot {
  return (command) => {
    const state = Object.freeze({
      identity: command.identity,
      receivedAt: dependencies.monotonicNow(),
      snapshot: command.snapshot,
    });
    const currentSession = dependencies.matchSessionStore.getActive();
    const decision = advanceMatchSession({
      currentSession,
      state,
      freshnessMs: dependencies.freshnessMs,
    });

    dependencies.latestStateStore.save(state);

    if (decision.session !== currentSession) {
      dependencies.matchSessionStore.replaceActive(decision.session);
    }

    const lifecycleChanged =
      (currentSession === null) !== (decision.session === null) ||
      currentSession?.matchId !== decision.session?.matchId ||
      currentSession?.team !== decision.session?.team ||
      currentSession?.timelineStatus !== decision.session?.timelineStatus;

    if (!lifecycleChanged) {
      return;
    }

    const identifiedSession = decision.session ?? currentSession;

    if (identifiedSession === null) {
      return;
    }

    dependencies.logLifecycleTransition(
      Object.freeze({
        clientId: command.identity.clientId,
        matchId: identifiedSession.matchId,
        team: identifiedSession.team,
        timelineStatus: decision.session?.timelineStatus ?? null,
      })
    );
  };
}
