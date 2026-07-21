import { describe, expect, it, jest } from '@jest/globals';

import type { MatchSession } from '../domain/match-session.js';
import type { NormalizedClientState } from '../domain/normalized-client-state.js';
import type { NormalizedClientSnapshot } from '../domain/normalized-snapshot.js';
import type { MatchSessionStore } from './match-session-store.js';
import type { NormalizedLatestStateStore } from './normalized-latest-state-store.js';
import { createRecordClientSnapshot } from './record-client-snapshot.js';

describe('record client snapshot', () => {
  it('records resolved identity, server receive time, and accepted snapshot', () => {
    const save = jest.fn<(state: NormalizedClientState) => void>();
    const latestStateStore: NormalizedLatestStateStore = {
      getAll: () => [],
      getLatest: () => null,
      save,
    };
    const replaceActive = jest.fn<(session: MatchSession | null) => void>();
    const matchSessionStore: MatchSessionStore = {
      getActive: () => null,
      replaceActive,
    };
    const logLifecycleTransition = jest.fn();
    const monotonicNow = jest.fn(() => 12_345);
    const recordClientSnapshot = createRecordClientSnapshot({
      freshnessMs: 5_000,
      latestStateStore,
      logLifecycleTransition,
      matchSessionStore,
      monotonicNow,
    });
    const identity = {
      clientId: 'client-01',
      discordUserId: '123456789012345678',
      coachAlias: 'Local Player',
      defaultRole: 2 as const,
    };
    const snapshot: NormalizedClientSnapshot = {
      sourceTimestampSeconds: 1_753_002_000,
      match: null,
      player: null,
      hero: null,
      minimapHeroes: [],
      buildings: [],
      events: [],
    };

    recordClientSnapshot({ identity, snapshot });

    expect(monotonicNow).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      identity,
      receivedAt: 12_345,
      snapshot,
    });
    expect(replaceActive).not.toHaveBeenCalled();
    expect(logLifecycleTransition).not.toHaveBeenCalled();
  });

  it('advances the active session and logs only bounded lifecycle transitions', () => {
    let activeSession: MatchSession | null = null;
    const save = jest.fn<(state: NormalizedClientState) => void>();
    const replaceActive = jest.fn((session: MatchSession | null) => {
      activeSession = session;
    });
    const logLifecycleTransition = jest.fn();
    const receivedTimes = [1_000, 2_000, 3_000];
    const latestStateStore: NormalizedLatestStateStore = {
      getAll: () => [],
      getLatest: () => null,
      save,
    };
    const matchSessionStore: MatchSessionStore = {
      getActive: () => activeSession,
      replaceActive,
    };
    const recordClientSnapshot = createRecordClientSnapshot({
      freshnessMs: 5_000,
      latestStateStore,
      logLifecycleTransition,
      matchSessionStore,
      monotonicNow: () => receivedTimes.shift() ?? 3_000,
    });
    const identity = {
      clientId: 'client-01',
      discordUserId: '123456789012345678',
      coachAlias: 'Local Player',
      defaultRole: 2 as const,
    };
    const snapshot: NormalizedClientSnapshot = {
      sourceTimestampSeconds: null,
      match: {
        matchId: 'match-01',
        gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        gameTime: 120,
        clockTime: 30,
        paused: false,
        radiantScore: 1,
        direScore: 2,
      },
      player: {
        team: 'radiant',
        teamSlot: 0,
        gold: null,
        lastHits: null,
        denies: null,
        gpm: null,
        xpm: null,
        goldFromHeroKills: null,
        goldFromCreepKills: null,
        goldFromIncome: null,
        goldFromShared: null,
      },
      hero: null,
      minimapHeroes: [],
      buildings: [],
      events: [],
    };

    recordClientSnapshot({ identity, snapshot });
    recordClientSnapshot({ identity, snapshot });
    recordClientSnapshot({ identity, snapshot });

    expect(save).toHaveBeenCalledTimes(3);
    expect(replaceActive).toHaveBeenCalledTimes(3);
    expect(activeSession).toMatchObject({
      matchId: 'match-01',
      timelineSourceClientId: 'client-01',
      timelineStatus: 'healthy',
      lastUsableSourceReceivedAt: 3_000,
    });
    expect(logLifecycleTransition).toHaveBeenNthCalledWith(1, {
      clientId: 'client-01',
      matchId: 'match-01',
      team: 'radiant',
      timelineStatus: 'rebaselining',
    });
    expect(logLifecycleTransition).toHaveBeenNthCalledWith(2, {
      clientId: 'client-01',
      matchId: 'match-01',
      team: 'radiant',
      timelineStatus: 'healthy',
    });
    expect(logLifecycleTransition).toHaveBeenCalledTimes(2);
  });
});
