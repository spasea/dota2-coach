import { describe, expect, it, jest } from '@jest/globals';
import pino from 'pino';

import type { DiscordGatewayAdapter } from '../integrations/discord/infrastructure/discord-gateway-adapter.js';
import type { DiscordInteractionSource } from '../integrations/discord/infrastructure/discord-interaction-adapter.js';
import type { DiscordServingAdapters } from '../integrations/discord/infrastructure/discord-serving-adapters.js';
import type { DiscordVoiceAdapter } from '../integrations/discord/infrastructure/discord-voice-adapter.js';
import { createRussianDiscordTranslator } from '../integrations/discord/infrastructure/russian-discord-translator.js';
import { createDiscordPanelDefinition } from '../integrations/discord/panel/discord-panel.js';
import { ConfigurationError } from '../platform/config/configuration-error.js';
import { createServingRuntime, type CreateServingRuntimeDependencies } from './create-serving-runtime.js';
import type { Runtime } from './create-runtime.js';

const disabledConfiguration = Object.freeze({ schemaVersion: 1 as const, enabled: false as const });
const disabledSpeechConfiguration = Object.freeze({ schemaVersion: 1 as const, enabled: false as const });
const enabledConfiguration = Object.freeze({
  schemaVersion: 1 as const,
  enabled: true as const,
  guildId: '123456789012345678',
  textChannelId: '234567890123456789',
  controlMessageId: '345678901234567890',
  actionDebounceMs: 5_000,
  botToken: 'private-test-token',
});
const enabledSpeechConfiguration = Object.freeze({
  schemaVersion: 1 as const,
  enabled: true as const,
  voiceChannelId: '678901234567890123',
  ttsBaseUrl: 'http://tts:8080',
  recommendationSpeaker: 'baya' as const,
  jobTtlMs: 20_000,
  ttsTimeoutMs: 7_000,
  voiceReadyTimeoutMs: 3_000,
  playbackTimeoutMs: 15_000,
  consecutiveFailuresBeforeTextOnly: 2,
  recoveryProbeIntervalMs: 5_000,
  queueCapacity: 10,
  manual: Object.freeze({
    enabled: true as const,
    maxTextCharacters: 300 as const,
    bearerToken: 'long-private-manual-speech-token',
  }),
});

describe('serving runtime composition', () => {
  it('keeps disabled Discord on the HTTP-only lifecycle without constructing an SDK adapter', async () => {
    const fixture = createServingFixture();
    const runtime = await createServingRuntime(
      {},
      disabledConfiguration,
      disabledSpeechConfiguration,
      fixture.logger,
      fixture.dependencies
    );

    await runtime.start();
    await runtime.stop();

    expect(fixture.createDiscordGateway).not.toHaveBeenCalled();
    expect(fixture.operations).toEqual(['http_start', 'http_stop']);
  });

  it('wires one interaction listener, validates the canonical panel, and binds HTTP last', async () => {
    const fixture = createServingFixture();
    const runtime = await createServingRuntime(
      {},
      enabledConfiguration,
      disabledSpeechConfiguration,
      fixture.logger,
      fixture.dependencies
    );

    await runtime.start();

    expect(fixture.createDiscordGateway).toHaveBeenCalledWith('private-test-token');
    expect(fixture.operations).toEqual([
      'observe_gateway_state',
      'observe_interactions',
      'discord_connect',
      'discord_connect',
      'resolve_channel',
      'fetch_message',
      'http_start',
    ]);
    expect(fixture.interactionObserver).not.toBeNull();

    await runtime.stop();

    expect(fixture.operations.slice(-4)).toEqual([
      'remove_interactions',
      'http_stop',
      'remove_gateway_state',
      'discord_destroy',
    ]);
  });

  it('delegates registered interactions through the contained application handler', async () => {
    const fixture = createServingFixture();
    const runtime = await createServingRuntime(
      {},
      enabledConfiguration,
      disabledSpeechConfiguration,
      fixture.logger,
      fixture.dependencies
    );
    const replyEphemeral = jest.fn<(content: string) => Promise<void>>().mockResolvedValue(undefined);

    await runtime.start();
    await fixture.interactionObserver?.(
      createInteractionSource({
        messageId: 'copied-message',
        replyEphemeral,
      })
    );

    expect(replyEphemeral).toHaveBeenCalledTimes(1);
    await runtime.stop();
  });

  it('wires shared voice recovery and the protected manual router without delaying HTTP startup', async () => {
    const fixture = createServingFixture();
    const runtime = await createServingRuntime(
      {},
      enabledConfiguration,
      enabledSpeechConfiguration,
      fixture.logger,
      fixture.dependencies
    );

    await runtime.start();
    await Promise.resolve();

    expect(fixture.createDiscordGateway).not.toHaveBeenCalled();
    expect(fixture.createDiscordServingAdapters).toHaveBeenCalledWith('private-test-token', {
      guildId: enabledConfiguration.guildId,
      voiceChannelId: enabledSpeechConfiguration.voiceChannelId,
    });
    expect(fixture.manualSpeechRouter).not.toBeNull();
    expect(fixture.operations).toContain('http_start');

    await runtime.stop();

    expect(fixture.operations.slice(-6)).toEqual([
      'remove_interactions',
      'voice_stop',
      'http_stop',
      'voice_destroy',
      'remove_gateway_state',
      'discord_destroy',
    ]);
  });

  it('starts HTTP and Discord text while TTS readiness is unavailable', async () => {
    const fixture = createServingFixture({ ttsUnavailable: true });
    const runtime = await createServingRuntime(
      {},
      enabledConfiguration,
      enabledSpeechConfiguration,
      fixture.logger,
      fixture.dependencies
    );

    await expect(runtime.start()).resolves.toEqual({ host: '127.0.0.1', port: 3000 });
    expect(fixture.operations).toContain('http_start');

    await runtime.stop();
  });

  it('rejects an enabled serving configuration without a canonical control message before SDK construction', async () => {
    const fixture = createServingFixture();
    const invalidConfiguration = Object.freeze({ ...enabledConfiguration, controlMessageId: null });

    const result = await createServingRuntime(
      {},
      invalidConfiguration,
      disabledSpeechConfiguration,
      fixture.logger,
      fixture.dependencies
    ).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(ConfigurationError);
    expect(result).toMatchObject({ source: 'discord_combined', stage: 'validation' });
    expect(fixture.createDiscordGateway).not.toHaveBeenCalled();
  });
});

function createServingFixture(options: Readonly<{ ttsUnavailable?: boolean }> = {}) {
  const operations: string[] = [];
  const logger = pino({ level: 'silent' });
  let interactionObserver: ((source: DiscordInteractionSource) => Promise<void>) | null = null;
  let manualSpeechRouter: unknown = null;
  const panel = createDiscordPanelDefinition(createRussianDiscordTranslator());
  const gateway: DiscordGatewayAdapter = Object.freeze({
    connect: () => {
      operations.push('discord_connect');
      return Promise.resolve(Object.freeze({ botUserId: '456789012345678901' }));
    },
    resolveTextChannel: (guildId, channelId) => {
      operations.push('resolve_channel');
      return Promise.resolve(
        Object.freeze({
          guildId,
          channelId,
          kind: 'guild_text' as const,
          permissions: Object.freeze([
            'view_channel' as const,
            'read_message_history' as const,
            'send_messages' as const,
            'pin_messages' as const,
          ]),
        })
      );
    },
    createMessage: () => Promise.reject(new Error('not used during serving')),
    pinMessage: () => Promise.reject(new Error('not used during serving')),
    deleteMessage: () => Promise.reject(new Error('not used during serving')),
    fetchMessage: (channel, messageId) => {
      operations.push('fetch_message');
      return Promise.resolve(
        Object.freeze({
          id: messageId,
          guildId: channel.guildId,
          channelId: channel.channelId,
          authorId: '456789012345678901',
          pinned: true,
          panel,
        })
      );
    },
    publishMessage: () => Promise.resolve(),
    observeInteractions: (observer) => {
      operations.push('observe_interactions');
      interactionObserver = observer;
      return () => {
        operations.push('remove_interactions');
        interactionObserver = null;
      };
    },
    observeGatewayState: () => {
      operations.push('observe_gateway_state');
      return () => operations.push('remove_gateway_state');
    },
    destroy: () => {
      operations.push('discord_destroy');
      return Promise.resolve();
    },
  });
  const coreRuntime = {
    start: () => {
      operations.push('http_start');
      return Promise.resolve(Object.freeze({ host: '127.0.0.1', port: 3000 }));
    },
    stop: () => {
      operations.push('http_stop');
      return Promise.resolve();
    },
    buildCoachContext: () => Object.freeze({ status: 'snapshot_missing' }),
    recommendLostAction: () => Object.freeze({ status: 'unavailable', reason: 'snapshot_missing' }),
    setRequesterRoleOverride: () => Object.freeze({ status: 'snapshot_missing' }),
  } as unknown as Runtime;
  const createDiscordGateway = jest.fn<(botToken: string) => DiscordGatewayAdapter>().mockReturnValue(gateway);
  const voice: DiscordVoiceAdapter = Object.freeze({
    recover: () => Promise.resolve('ready' as const),
    waitUntilReady: () => Promise.resolve(),
    play: () => Promise.resolve(),
    stop: () => {
      operations.push('voice_stop');
      return Promise.resolve();
    },
    destroy: () => {
      operations.push('voice_destroy');
      return Promise.resolve();
    },
  });
  const sharedAdapters: DiscordServingAdapters = Object.freeze({ gateway, voice });
  const createDiscordServingAdapters = jest
    .fn<CreateServingRuntimeDependencies['createDiscordServingAdapters']>()
    .mockReturnValue(sharedAdapters);
  const dependencies: CreateServingRuntimeDependencies = Object.freeze({
    createCoreRuntime: (_environment, _logger, currentManualSpeechRouter) => {
      manualSpeechRouter = currentManualSpeechRouter;
      return Promise.resolve(coreRuntime);
    },
    createDiscordGateway,
    createDiscordServingAdapters,
    createJobId: () => 'speech-job-01',
    fetch:
      options.ttsUnavailable === true
        ? jest.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('TTS unavailable'))
        : jest
            .fn<typeof globalThis.fetch>()
            .mockResolvedValue(new Response(JSON.stringify({ status: 'ready', model: 'v5_5_ru', device: 'cpu' }))),
    monotonicNow: () => 12_345,
    scheduleTask: () => () => undefined,
  });

  return {
    createDiscordGateway,
    createDiscordServingAdapters,
    dependencies,
    get interactionObserver() {
      return interactionObserver;
    },
    logger,
    get manualSpeechRouter() {
      return manualSpeechRouter;
    },
    operations,
  };
}

function createInteractionSource(overrides: Partial<DiscordInteractionSource> = {}): DiscordInteractionSource {
  return Object.freeze({
    requestId: 'interaction-01',
    componentKind: 'button',
    guildId: enabledConfiguration.guildId,
    channelId: enabledConfiguration.textChannelId,
    messageId: enabledConfiguration.controlMessageId,
    discordUserId: '567890123456789012',
    customId: 'coach:v1:action:lost',
    replyEphemeral: () => Promise.resolve(),
    deferEphemeral: () => Promise.resolve(),
    editEphemeral: () => Promise.resolve(),
    ...overrides,
  });
}
