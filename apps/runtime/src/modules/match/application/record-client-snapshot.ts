import type { ClientIdentity } from '../domain/client-identity.js';
import { advanceActiveMatchState } from '../domain/match-memory.js';
import { advanceMatchSession, type TimelineStatus } from '../domain/match-session.js';
import type { NormalizedClientSnapshot, Team } from '../domain/normalized-snapshot.js';
import type { ActiveMatchStore } from './active-match-store.js';
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
  activeMatchStore: ActiveMatchStore;
  freshnessMs: number;
  latestStateStore: NormalizedLatestStateStore;
  logLifecycleTransition: (metadata: MatchLifecycleTransitionMetadata) => void;
  monotonicNow: () => number;
  playerHistoryRetentionMs: number;
}>;

export function createRecordClientSnapshot(dependencies: RecordClientSnapshotDependencies): RecordClientSnapshot {
  return (command) => {
    const state = Object.freeze({
      identity: command.identity,
      receivedAt: dependencies.monotonicNow(),
      snapshot: command.snapshot,
    });
    const currentActiveState = dependencies.activeMatchStore.getActive();
    const currentSession = currentActiveState?.session ?? null;
    const decision = advanceMatchSession({
      currentSession,
      state,
      freshnessMs: dependencies.freshnessMs,
    });

    dependencies.latestStateStore.save(state);
    const nextActiveState = advanceActiveMatchState({
      currentState: currentActiveState,
      decision,
      clientState: state,
      freshnessMs: dependencies.freshnessMs,
      playerHistoryRetentionMs: dependencies.playerHistoryRetentionMs,
    });

    if (nextActiveState !== currentActiveState) {
      dependencies.activeMatchStore.replaceActive(nextActiveState);
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
