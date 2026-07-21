import { describe, expect, it, jest } from '@jest/globals';

import { createActiveMatchState, type ActiveMatchState } from '../domain/match-memory.js';
import { createMatchSession, createNormalizedClientState } from '../domain/match-memory.spec-fixtures.js';
import type { ClientDirectory } from './client-directory.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';
import { createSetRequesterRoleOverride } from './set-requester-role-override.js';

describe('set requester role override', () => {
  it('updates only the requester, permits duplicate roles, and remains idempotent', () => {
    const requester = createNormalizedClientState({ clientId: 'client-01', receivedAt: 5_500 });
    const teammate = createNormalizedClientState({ clientId: 'client-02', receivedAt: 5_500 });
    const initialState: ActiveMatchState = {
      ...createActiveMatchState(createMatchSession()),
      roleOverrides: [{ clientId: 'client-02', role: 3 }],
    };
    let activeState: ActiveMatchState | null = initialState;
    const replaceActive = jest.fn((state: ActiveMatchState | null) => {
      activeState = state;
    });
    const setRole = createSetRequesterRoleOverride({
      activeMatchStore: {
        getActive: () => activeState,
        replaceActive,
      },
      clientDirectory: createDirectory(requester),
      freshnessMs: 5_000,
      latestStateStore: createLatestStateStore([requester, teammate]),
      monotonicNow: () => 6_000,
    });

    expect(setRole({ discordUserId: requester.identity.discordUserId, role: 3 })).toEqual({
      status: 'updated',
      effectiveRole: 3,
    });
    expect(activeState?.roleOverrides).toEqual([
      { clientId: 'client-01', role: 3 },
      { clientId: 'client-02', role: 3 },
    ]);
    expect(initialState.roleOverrides).toEqual([{ clientId: 'client-02', role: 3 }]);

    expect(setRole({ discordUserId: requester.identity.discordUserId, role: 3 })).toEqual({
      status: 'updated',
      effectiveRole: 3,
    });
    expect(activeState?.roleOverrides).toHaveLength(2);
  });

  it('uses the same explicit requester availability failures as context building', () => {
    const requester = createNormalizedClientState({ receivedAt: 5_500 });
    const setRole = createSetRequesterRoleOverride({
      activeMatchStore: {
        getActive: () => createActiveMatchState(createMatchSession()),
        replaceActive: () => undefined,
      },
      clientDirectory: { resolveDiscordUserId: () => null },
      freshnessMs: 5_000,
      latestStateStore: createLatestStateStore([requester]),
      monotonicNow: () => 6_000,
    });

    expect(setRole({ discordUserId: 'unknown', role: 2 })).toEqual({ status: 'client_not_found' });
  });

  it('starts a replacement match aggregate without previous overrides', () => {
    const previous: ActiveMatchState = {
      ...createActiveMatchState(createMatchSession()),
      roleOverrides: [{ clientId: 'client-01', role: 4 }],
    };

    const replacement = createActiveMatchState(createMatchSession({ matchId: 'match-02' }));

    expect(previous.roleOverrides).toHaveLength(1);
    expect(replacement.session.matchId).toBe('match-02');
    expect(replacement.roleOverrides).toEqual([]);
    expect(replacement.memory.matchId).toBe('match-02');
  });
});

function createDirectory(requester: ReturnType<typeof createNormalizedClientState>): ClientDirectory {
  return {
    resolveDiscordUserId: (discordUserId) =>
      discordUserId === requester.identity.discordUserId ? requester.identity : null,
  };
}

function createLatestStateStore(
  states: readonly ReturnType<typeof createNormalizedClientState>[]
): NormalizedLatestStateStore {
  return {
    getAll: () => states,
    getLatest: (clientId) => states.find((state) => state.identity.clientId === clientId) ?? null,
    save: () => undefined,
  };
}
