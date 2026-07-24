import { describe, expect, it, jest } from '@jest/globals';

import type { RecommendLostActionResult } from '../../../modules/lost/public.js';
import type { SetRequesterRoleOverrideResult } from '../../../modules/match/public.js';
import { DISCORD_PANEL_CUSTOM_IDS } from '../panel/discord-panel.js';
import type { DiscordButtonObservation } from '../discord.types.js';
import type { DiscordActionDebounceKey, DiscordActionDebounceResult } from './action-debounce.js';
import {
  createHandleDiscordButton,
  type DiscordInteractionResponder,
  type HandleDiscordButtonDependencies,
} from './handle-discord-button.js';
import type { PresentDiscordLostMessageResult } from './present-discord-lost-message.js';
import type { ResolveDiscordLostActionScopeResult } from './resolve-discord-lost-action-scope.js';

const guildId = '123456789012345678';
const channelId = '234567890123456789';
const messageId = '345678901234567890';
const discordUserId = '456789012345678901';

const recommendedResult: Extract<RecommendLostActionResult, { status: 'recommended' }> = Object.freeze({
  status: 'recommended',
  delivery: Object.freeze({
    audience: Object.freeze({ kind: 'individual', displayName: 'Lich' }),
    effectiveRole: 4,
  }),
  recommendation: Object.freeze({
    action: 'HOLD_AND_WAIT',
    primary: null,
    alternative: null,
    confidence: 'medium',
    coverage: 0.4,
    voiceText: 'Lich, подожди.',
    textTitle: 'Подожди',
    textBody: 'Недостаточно данных для безопасного действия.',
    unknowns: Object.freeze([]),
    guardrails: Object.freeze([]),
  }),
});

describe('Discord button routing', () => {
  it.each([
    ['unsupported component', { componentKind: 'unsupported' as const }],
    ['different guild', { guildId: '567890123456789012' }],
    ['different channel', { channelId: '678901234567890123' }],
    ['copied message', { messageId: '789012345678901234' }],
    ['unsupported custom ID', { customId: 'coach:v2:action:lost' }],
  ])('rejects %s before Match, Lost, or role use cases', async (_caseName, override) => {
    const harness = createHarness();

    await harness.handle({
      interaction: interaction(override),
      responder: harness.responder,
    });

    expect(harness.operations).toEqual(['reply:discord.error.invalid_source']);
  });

  it('acknowledges disabled Buy without invoking an application use case', async () => {
    const harness = createHarness();

    await harness.handle({
      interaction: interaction({ customId: DISCORD_PANEL_CUSTOM_IDS.buy }),
      responder: harness.responder,
    });

    expect(harness.operations).toEqual(['reply:discord.buy.disabled']);
  });

  it('preflights, debounces, defers, recommends once, publishes once, and confirms in order', async () => {
    const harness = createHarness();

    await harness.handle({
      interaction: interaction(),
      responder: harness.responder,
    });

    expect(harness.operations).toEqual([
      `resolve_scope:${discordUserId}`,
      'debounce:match-01:lost',
      'defer',
      `recommend:${discordUserId}:match-01`,
      'present',
      'publish',
      'edit:discord.lost.delivered',
    ]);
  });

  it('admits the exact Lost voice text with baya only after public text succeeds', async () => {
    const harness = createHarness();

    await harness.handle({
      interaction: interaction(),
      responder: harness.responder,
    });

    expect(harness.enqueueSpeech).toHaveBeenCalledWith({
      requestId: 'request-01',
      source: 'lost',
      speaker: 'baya',
      text: recommendedResult.recommendation.voiceText,
    });
    expect(harness.operations).toEqual([
      `resolve_scope:${discordUserId}`,
      'debounce:match-01:lost',
      'defer',
      `recommend:${discordUserId}:match-01`,
      'present',
      'publish',
      'enqueue_speech',
      'edit:discord.lost.delivered',
    ]);
  });

  it('replies to a duplicate immediately without deferring or scoring', async () => {
    const harness = createHarness({ debounceResult: Object.freeze({ status: 'duplicate' }) });

    await harness.handle({
      interaction: interaction(),
      responder: harness.responder,
    });

    expect(harness.operations).toEqual([
      `resolve_scope:${discordUserId}`,
      'debounce:match-01:lost',
      'reply:discord.lost.duplicate',
    ]);
  });

  it.each([
    ['client_not_found', 'discord.error.identity_unmapped'],
    ['snapshot_missing', 'discord.error.gsi_unavailable'],
    ['snapshot_stale', 'discord.error.gsi_unavailable'],
    ['match_unavailable', 'discord.error.match_unavailable'],
    ['outside_active_session', 'discord.error.match_unavailable'],
  ] as const)('maps %s preflight rejection to %s before debounce', async (status, expectedKey) => {
    const harness = createHarness({ scopeResult: Object.freeze({ status }) });

    await harness.handle({ interaction: interaction(), responder: harness.responder });

    expect(harness.operations).toEqual([`resolve_scope:${discordUserId}`, `reply:${expectedKey}`]);
  });

  it('maps a changed match after defer without publishing', async () => {
    const harness = createHarness({
      recommendResult: Object.freeze({ status: 'unavailable', reason: 'match_changed' }),
    });

    await harness.handle({ interaction: interaction(), responder: harness.responder });

    expect(harness.operations).toEqual([
      `resolve_scope:${discordUserId}`,
      'debounce:match-01:lost',
      'defer',
      `recommend:${discordUserId}:match-01`,
      'edit:discord.error.match_changed',
    ]);
  });

  it('maps Lost unavailability after defer without presentation or publication', async () => {
    const harness = createHarness({
      recommendResult: Object.freeze({ status: 'unavailable', reason: 'game_not_in_progress' }),
    });

    await harness.handle({ interaction: interaction(), responder: harness.responder });

    expect(harness.operations).toEqual([
      `resolve_scope:${discordUserId}`,
      'debounce:match-01:lost',
      'defer',
      `recommend:${discordUserId}:match-01`,
      'edit:discord.error.match_unavailable',
    ]);
  });

  it('fails closed on oversized presentation without attempting publication', async () => {
    const harness = createHarness({ presentResult: Object.freeze({ status: 'too_long' }) });

    await harness.handle({ interaction: interaction(), responder: harness.responder });

    expect(harness.operations).toEqual([
      `resolve_scope:${discordUserId}`,
      'debounce:match-01:lost',
      'defer',
      `recommend:${discordUserId}:match-01`,
      'present',
      'edit:discord.lost.delivery_failed',
    ]);
  });

  it.each([
    [DISCORD_PANEL_CUSTOM_IDS.carry, 1],
    [DISCORD_PANEL_CUSTOM_IDS.mid, 2],
    [DISCORD_PANEL_CUSTOM_IDS.offlane, 3],
    [DISCORD_PANEL_CUSTOM_IDS.support, 4],
    [DISCORD_PANEL_CUSTOM_IDS.hardSupport, 5],
  ] as const)(
    'defers and applies idempotent role %s without Lost, debounce, or publication',
    async (customId, role) => {
      const harness = createHarness();

      await harness.handle({ interaction: interaction({ customId }), responder: harness.responder });

      expect(harness.operations).toEqual(['defer', `set_role:${discordUserId}:${role}`, 'edit:discord.role.updated']);
    }
  );

  it('contains publication failures and completes the deferred response safely', async () => {
    const harness = createHarness({ publishError: new Error('raw Discord response') });

    await expect(harness.handle({ interaction: interaction(), responder: harness.responder })).resolves.toBeUndefined();
    expect(harness.operations.at(-1)).toBe('edit:discord.lost.delivery_failed');
    expect(JSON.stringify(harness.events)).not.toContain('raw Discord response');
    expect(harness.operations.filter((operation) => operation === 'publish')).toHaveLength(1);
  });

  it('keeps public delivery successful when the final ephemeral edit fails', async () => {
    const harness = createHarness({ editError: new Error('raw edit details') });

    await expect(harness.handle({ interaction: interaction(), responder: harness.responder })).resolves.toBeUndefined();

    expect(harness.operations.filter((operation) => operation === 'publish')).toHaveLength(1);
    expect(harness.events).toContainEqual(
      expect.objectContaining({
        code: 'DISCORD_LOST_DELIVERED',
        deliveryStatus: 'sent',
      })
    );
    expect(JSON.stringify(harness.events)).not.toContain('raw edit details');
  });

  it('edits the deferred role response when Match rejects the update', async () => {
    const harness = createHarness({ roleResult: Object.freeze({ status: 'snapshot_stale' }) });

    await harness.handle({
      interaction: interaction({ customId: DISCORD_PANEL_CUSTOM_IDS.support }),
      responder: harness.responder,
    });

    expect(harness.operations).toEqual(['defer', `set_role:${discordUserId}:4`, 'edit:discord.error.gsi_unavailable']);
  });

  it('contains unexpected failures before acknowledgement with an ephemeral reply', async () => {
    const harness = createHarness({ scopeError: new Error('raw context details') });

    await expect(harness.handle({ interaction: interaction(), responder: harness.responder })).resolves.toBeUndefined();
    expect(harness.operations).toEqual([`resolve_scope:${discordUserId}`, 'reply:discord.error.unexpected']);
    expect(JSON.stringify(harness.events)).not.toContain('raw context details');
  });

  it('contains unexpected failures after defer with an ephemeral edit', async () => {
    const harness = createHarness({ recommendError: new Error('raw recommendation details') });

    await expect(harness.handle({ interaction: interaction(), responder: harness.responder })).resolves.toBeUndefined();
    expect(harness.operations.at(-1)).toBe('edit:discord.error.unexpected');
    expect(JSON.stringify(harness.events)).not.toContain('raw recommendation details');
  });
});

type HarnessOptions = Readonly<{
  debounceResult?: DiscordActionDebounceResult;
  scopeResult?: ResolveDiscordLostActionScopeResult;
  recommendResult?: RecommendLostActionResult;
  roleResult?: SetRequesterRoleOverrideResult;
  presentResult?: PresentDiscordLostMessageResult;
  publishError?: Error;
  scopeError?: Error;
  recommendError?: Error;
  editError?: Error;
}>;

function createHarness(options: HarnessOptions = {}) {
  const operations: string[] = [];
  const events: unknown[] = [];
  const enqueueSpeech = jest.fn<HandleDiscordButtonDependencies['enqueueSpeech']>().mockImplementation(() => {
    operations.push('enqueue_speech');
    return Object.freeze({ status: 'queued', jobId: 'speech-job-01' });
  });
  const responder: DiscordInteractionResponder = Object.freeze({
    replyEphemeral: (message) => {
      operations.push(`reply:${message.key}`);
      return Promise.resolve();
    },
    deferEphemeral: () => {
      operations.push('defer');
      return Promise.resolve();
    },
    editEphemeral: (message) => {
      operations.push(`edit:${message.key}`);
      return options.editError === undefined ? Promise.resolve() : Promise.reject(options.editError);
    },
  });
  const dependencies: HandleDiscordButtonDependencies = Object.freeze({
    panelTarget: Object.freeze({ guildId, textChannelId: channelId, controlMessageId: messageId }),
    debounce: Object.freeze({
      tryAccept: (key: DiscordActionDebounceKey) => {
        operations.push(`debounce:${key.matchId}:${key.actionType}`);
        return options.debounceResult ?? Object.freeze({ status: 'accepted' });
      },
    }),
    resolveLostActionScope: (requesterId) => {
      operations.push(`resolve_scope:${requesterId}`);

      if (options.scopeError !== undefined) {
        throw options.scopeError;
      }

      return (
        options.scopeResult ??
        Object.freeze({
          status: 'ready',
          scope: Object.freeze({ matchId: 'match-01', clientId: 'client-01', discordUserId: requesterId }),
        })
      );
    },
    recommendLostAction: (command) => {
      operations.push(`recommend:${command.discordUserId}:${command.expectedMatchId ?? 'none'}`);

      if (options.recommendError !== undefined) {
        throw options.recommendError;
      }

      return options.recommendResult ?? recommendedResult;
    },
    setRequesterRoleOverride: (command) => {
      operations.push(`set_role:${command.discordUserId}:${command.role}`);
      return options.roleResult ?? Object.freeze({ status: 'updated', effectiveRole: command.role });
    },
    presentLostMessage: () => {
      operations.push('present');
      return (
        options.presentResult ??
        Object.freeze({
          status: 'ready',
          message: Object.freeze({ content: 'safe recommendation', suppressMentions: true }),
        })
      );
    },
    publishMessage: () => {
      operations.push('publish');
      return options.publishError === undefined ? Promise.resolve() : Promise.reject(options.publishError);
    },
    enqueueSpeech,
    recordEvent: (event) => events.push(event),
  });

  return {
    handle: createHandleDiscordButton(dependencies),
    enqueueSpeech,
    responder,
    operations,
    events,
  };
}

function interaction(override: Partial<DiscordButtonObservation> = {}): DiscordButtonObservation {
  return Object.freeze({
    requestId: 'request-01',
    componentKind: 'button',
    guildId,
    channelId,
    messageId,
    discordUserId,
    customId: DISCORD_PANEL_CUSTOM_IDS.lost,
    ...override,
  });
}
