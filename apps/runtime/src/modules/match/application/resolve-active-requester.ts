import type { ContextUnavailableStatus } from '../domain/context.js';
import type { ActiveMatchState } from '../domain/match-memory.js';
import type { NormalizedClientState } from '../domain/normalized-client-state.js';
import type { ActiveMatchStore } from './active-match-store.js';
import type { ClientDirectory } from './client-directory.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';

export type ActiveRequesterDependencies = Readonly<{
  activeMatchStore: ActiveMatchStore;
  clientDirectory: ClientDirectory;
  freshnessMs: number;
  latestStateStore: NormalizedLatestStateStore;
  monotonicNow: () => number;
}>;

type ActiveRequesterResult =
  | Readonly<{
      status: 'ready';
      requester: NormalizedClientState;
      activeState: ActiveMatchState;
      now: number;
    }>
  | Readonly<{ status: ContextUnavailableStatus }>;

type ResolveActiveRequester = (discordUserId: string) => ActiveRequesterResult;

export function createActiveRequesterResolver(dependencies: ActiveRequesterDependencies): ResolveActiveRequester {
  return (discordUserId) => {
    const identity = dependencies.clientDirectory.resolveDiscordUserId(discordUserId);

    if (identity === null) {
      return Object.freeze({ status: 'client_not_found' });
    }

    const requester = dependencies.latestStateStore.getLatest(identity.clientId);

    if (requester === null) {
      return Object.freeze({ status: 'snapshot_missing' });
    }

    const now = dependencies.monotonicNow();
    const requesterAge = now - requester.receivedAt;

    if (!Number.isFinite(requesterAge) || requesterAge < 0) {
      throw new RangeError('Requester state age must be a non-negative finite number.');
    }

    if (requesterAge >= dependencies.freshnessMs) {
      return Object.freeze({ status: 'snapshot_stale' });
    }

    const activeState = dependencies.activeMatchStore.getActive();

    if (activeState === null) {
      return Object.freeze({ status: 'match_unavailable' });
    }

    const requesterMatchId = requester.snapshot.match?.matchId;
    const requesterTeam = requester.snapshot.player?.team;

    if (requesterMatchId !== activeState.session.matchId || requesterTeam !== activeState.session.team) {
      return Object.freeze({ status: 'outside_active_session' });
    }

    return Object.freeze({ status: 'ready', requester, activeState, now });
  };
}
