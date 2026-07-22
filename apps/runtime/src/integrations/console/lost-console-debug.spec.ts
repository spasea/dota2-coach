import { describe, expect, it } from '@jest/globals';

import type { RecommendLostAction, RecommendLostActionResult } from '../../modules/lost/public.js';
import { createLostConsoleDebug } from './lost-console-debug.js';

const recommendedResult: RecommendLostActionResult = Object.freeze({
  status: 'recommended',
  recommendation: Object.freeze({
    action: 'FARM_SAFELY',
    primary: null,
    alternative: null,
    confidence: 'medium',
    coverage: 0.75,
    voiceText: 'Фарми безопасно.',
    textTitle: 'Безопасный фарм',
    textBody: 'Не приходи в драку в меньшинстве.',
    unknowns: Object.freeze([]),
    guardrails: Object.freeze([]),
  }),
});

describe('Lost console debug adapter', () => {
  it('stays inert when the local debug mode is disabled', () => {
    const calls = createHarness({ enabled: false });

    calls.observe(clientSnapshot('client-01', 'discord-01', 'match-01'));
    calls.advanceBy(30_000);
    calls.observe(clientSnapshot('client-01', 'discord-01', 'match-01'));

    expect(calls.requestedDiscordUserIds).toEqual([]);
    expect(calls.outputs).toEqual([]);
  });

  it('warms up and throttles each requester independently', () => {
    const calls = createHarness();
    const firstClient = clientSnapshot('client-01', 'discord-01', 'match-01');
    const secondClient = clientSnapshot('client-02', 'discord-02', 'match-01');

    calls.observe(firstClient);
    calls.advanceBy(29_999);
    calls.observe(firstClient);
    calls.observe(secondClient);

    expect(calls.requestedDiscordUserIds).toEqual([]);

    calls.advanceBy(1);
    calls.observe(firstClient);

    expect(calls.requestedDiscordUserIds).toEqual(['discord-01']);
    expect(calls.outputs).toEqual([
      [
        '[lost-debug] client=client-01',
        'status=recommended action=FARM_SAFELY confidence=medium coverage=0.75',
        'title: Безопасный фарм',
        'body: Не приходи в драку в меньшинстве.',
        'voice: Фарми безопасно.',
      ].join('\n'),
    ]);

    calls.advanceBy(30_000);
    calls.observe(firstClient);
    calls.observe(secondClient);

    expect(calls.requestedDiscordUserIds).toEqual(['discord-01', 'discord-01', 'discord-02']);
  });

  it('starts a new warm-up window when the requester changes match', () => {
    const calls = createHarness();
    const firstMatch = clientSnapshot('client-01', 'discord-01', 'match-01');
    const secondMatch = clientSnapshot('client-01', 'discord-01', 'match-02');

    calls.observe(firstMatch);
    calls.advanceBy(30_000);
    calls.observe(secondMatch);
    calls.advanceBy(29_999);
    calls.observe(secondMatch);

    expect(calls.requestedDiscordUserIds).toEqual([]);

    calls.advanceBy(1);
    calls.observe(secondMatch);

    expect(calls.requestedDiscordUserIds).toEqual(['discord-01']);
  });

  it('prints unavailable outcomes without exposing requester identity', () => {
    const calls = createHarness({
      result: Object.freeze({ status: 'unavailable', reason: 'snapshot_stale' }),
    });
    const snapshot = clientSnapshot('client-01', 'private-discord-id', 'match-01');

    calls.observe(snapshot);
    calls.advanceBy(30_000);
    calls.observe(snapshot);

    expect(calls.outputs).toEqual(['[lost-debug] client=client-01\nstatus=unavailable reason=snapshot_stale']);
    expect(calls.outputs[0]).not.toContain('private-discord-id');
  });

  it('contains debug failures so they cannot change GSI ingest behavior', () => {
    let failureCount = 0;
    let now = 0;
    const observe = createLostConsoleDebug({
      enabled: true,
      intervalMs: 30_000,
      monotonicNow: () => now,
      recommendLostAction: () => {
        throw new Error('debug failure');
      },
      reportFailure: () => {
        failureCount += 1;
      },
      writeOutput: () => undefined,
    });
    const snapshot = clientSnapshot('client-01', 'discord-01', 'match-01');

    observe(snapshot);
    now = 30_000;

    expect(() => observe(snapshot)).not.toThrow();
    expect(failureCount).toBe(1);
  });
});

type HarnessOptions = Readonly<{
  enabled?: boolean;
  result?: RecommendLostActionResult;
}>;

function createHarness(options: HarnessOptions = {}) {
  let now = 0;
  const outputs: string[] = [];
  const requestedDiscordUserIds: string[] = [];
  const recommendLostAction: RecommendLostAction = ({ discordUserId }) => {
    requestedDiscordUserIds.push(discordUserId);
    return options.result ?? recommendedResult;
  };
  const observe = createLostConsoleDebug({
    enabled: options.enabled ?? true,
    intervalMs: 30_000,
    monotonicNow: () => now,
    recommendLostAction,
    reportFailure: () => undefined,
    writeOutput: (output) => outputs.push(output),
  });

  return {
    advanceBy: (milliseconds: number) => {
      now += milliseconds;
    },
    observe,
    outputs,
    requestedDiscordUserIds,
  };
}

function clientSnapshot(clientId: string, discordUserId: string, matchId: string | null) {
  return Object.freeze({ clientId, discordUserId, matchId });
}
