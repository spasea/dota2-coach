import { randomUUID } from 'node:crypto';

import type { Router } from 'express';
import type { Logger } from 'pino';

import { createDiscordActionDebounce } from '../integrations/discord/application/action-debounce.js';
import { createHandleDiscordButton } from '../integrations/discord/application/handle-discord-button.js';
import { createPresentDiscordLostMessage } from '../integrations/discord/application/present-discord-lost-message.js';
import { createResolveDiscordLostActionScope } from '../integrations/discord/application/resolve-discord-lost-action-scope.js';
import {
  createDiscordGatewayAdapter,
  type DiscordGatewayAdapter,
} from '../integrations/discord/infrastructure/discord-gateway-adapter.js';
import {
  createProductionDiscordServingAdapters,
  type DiscordServingAdapters,
} from '../integrations/discord/infrastructure/discord-serving-adapters.js';
import { dispatchDiscordInteraction } from '../integrations/discord/infrastructure/discord-interaction-adapter.js';
import { createRussianDiscordTranslator } from '../integrations/discord/infrastructure/russian-discord-translator.js';
import { createDiscordPanelDefinition } from '../integrations/discord/panel/discord-panel.js';
import { createValidateDiscordPanel } from '../integrations/discord/panel/discord-panel-lifecycle.js';
import { createManualSpeechRouter } from '../integrations/speech/manual-speech.router.js';
import { createTtsHttpAdapter, createTtsReadinessProbe } from '../integrations/tts/tts-http-adapter.js';
import {
  createRecoverSpeechDelivery,
  createSpeechCoordinator,
  type EnqueueSpeech,
  type ScheduleSpeechTask,
  type SpeechCoordinator,
} from '../modules/speech/public.js';
import type { DiscordConfiguration, SpeechConfiguration } from '../platform/config/config.types.js';
import { ConfigurationError } from '../platform/config/configuration-error.js';
import { assertSpeechDiscordCompatibility } from '../platform/config/parse-speech-config.js';
import { readMonotonicMilliseconds, type MonotonicClock } from '../platform/time/monotonic-clock.js';
import { createRuntimeWithLogger, type Runtime } from './create-runtime.js';
import {
  createRuntimeLifecycle,
  type DiscordServingLifecycle,
  type RuntimeLifecycle,
  type SpeechServingLifecycle,
  RuntimeStartupError,
} from './runtime-lifecycle.js';

export type CreateServingRuntimeDependencies = Readonly<{
  createCoreRuntime: (
    environment: Readonly<Record<string, string | undefined>>,
    logger: Logger,
    manualSpeechRouter: Router | null
  ) => Promise<Runtime>;
  createDiscordGateway: (botToken: string) => DiscordGatewayAdapter;
  createDiscordServingAdapters: (
    botToken: string,
    voiceOptions: Readonly<{ guildId: string; voiceChannelId: string }>
  ) => DiscordServingAdapters;
  createJobId: () => string;
  fetch: typeof globalThis.fetch;
  monotonicNow: MonotonicClock;
  scheduleTask: ScheduleSpeechTask;
}>;

const defaultDependencies: CreateServingRuntimeDependencies = Object.freeze({
  createCoreRuntime: createRuntimeWithLogger,
  createDiscordGateway: (botToken) => createDiscordGatewayAdapter(botToken, undefined, 'serving'),
  createDiscordServingAdapters: createProductionDiscordServingAdapters,
  createJobId: randomUUID,
  fetch: globalThis.fetch,
  monotonicNow: readMonotonicMilliseconds,
  scheduleTask: (delayMs, task) => {
    const timeout = setTimeout(task, delayMs);
    return () => clearTimeout(timeout);
  },
});

export async function createServingRuntime(
  environment: Readonly<Record<string, string | undefined>>,
  discordConfiguration: DiscordConfiguration,
  speechConfiguration: SpeechConfiguration,
  logger: Logger,
  dependencies: CreateServingRuntimeDependencies = defaultDependencies
): Promise<RuntimeLifecycle> {
  assertSpeechDiscordCompatibility(speechConfiguration, discordConfiguration);
  assertServingDiscordConfiguration(discordConfiguration);

  let gateway: DiscordGatewayAdapter | null = null;
  let speech: SpeechServingLifecycle | null = null;
  let speechCoordinator: SpeechCoordinator | null = null;
  let manualSpeechRouter: Router | null = null;
  let sharedAdapters: DiscordServingAdapters | null = null;

  if (speechConfiguration.enabled && discordConfiguration.enabled) {
    sharedAdapters = dependencies.createDiscordServingAdapters(discordConfiguration.botToken, {
      guildId: discordConfiguration.guildId,
      voiceChannelId: speechConfiguration.voiceChannelId,
    });
    gateway = sharedAdapters.gateway;
    speechCoordinator = createConfiguredSpeechCoordinator(speechConfiguration, sharedAdapters, logger, dependencies);
    speech = Object.freeze({
      startRecovering: () => speechCoordinator?.start('recovering'),
      stop: () => speechCoordinator?.stop() ?? Promise.resolve(),
      destroy: sharedAdapters.voice.destroy,
    });

    if (speechConfiguration.manual.enabled) {
      manualSpeechRouter = createManualSpeechRouter({
        bearerToken: speechConfiguration.manual.bearerToken,
        maxTextCharacters: speechConfiguration.manual.maxTextCharacters,
        enqueueSpeech: speechCoordinator.enqueue,
      });
    }
  } else if (discordConfiguration.enabled) {
    gateway = dependencies.createDiscordGateway(discordConfiguration.botToken);
  }

  let coreRuntime: Runtime;

  try {
    coreRuntime = await dependencies.createCoreRuntime(environment, logger, manualSpeechRouter);
  } catch (error) {
    await sharedAdapters?.voice.destroy().catch(() => undefined);
    await gateway?.destroy().catch(() => undefined);

    if (error instanceof ConfigurationError) {
      throw error;
    }

    throw new RuntimeStartupError('http_bind');
  }

  let discord: DiscordServingLifecycle | null = null;

  if (discordConfiguration.enabled && gateway !== null) {
    try {
      discord = createDiscordServingLifecycle(
        discordConfiguration,
        coreRuntime,
        gateway,
        speechCoordinator?.enqueue ?? textOnlySpeechAdmission,
        logger,
        dependencies.monotonicNow
      );
    } catch (error) {
      await sharedAdapters?.voice.destroy().catch(() => undefined);
      await gateway.destroy().catch(() => undefined);

      if (error instanceof ConfigurationError) {
        throw error;
      }

      throw new RuntimeStartupError('discord_connect');
    }
  }

  return createRuntimeLifecycle({
    http: coreRuntime,
    discord,
    speech,
    recordGatewayStateChanged: (event) => {
      logger.warn(event, 'Discord Gateway state changed');
    },
    recordRuntimeStarted: (address) => {
      logger.info({ code: 'RUNTIME_STARTED', ...address }, 'runtime started');
    },
    recordRuntimeStopped: () => {
      logger.info({ code: 'RUNTIME_STOPPED' }, 'runtime stopped');
    },
  });
}

function createDiscordServingLifecycle(
  configuration: Extract<DiscordConfiguration, Readonly<{ enabled: true }>>,
  coreRuntime: Runtime,
  gateway: DiscordGatewayAdapter,
  enqueueSpeech: EnqueueSpeech,
  logger: Logger,
  monotonicNow: MonotonicClock
): DiscordServingLifecycle {
  const controlMessageId = requireControlMessageId(configuration);
  const translator = createRussianDiscordTranslator();
  const panel = createDiscordPanelDefinition(translator);
  const validatePanel = createValidateDiscordPanel(gateway);
  const handleButton = createHandleDiscordButton({
    panelTarget: Object.freeze({
      guildId: configuration.guildId,
      textChannelId: configuration.textChannelId,
      controlMessageId,
    }),
    debounce: createDiscordActionDebounce({
      windowMs: configuration.actionDebounceMs,
      monotonicNow,
    }),
    resolveLostActionScope: createResolveDiscordLostActionScope(coreRuntime.buildCoachContext),
    recommendLostAction: coreRuntime.recommendLostAction,
    setRequesterRoleOverride: coreRuntime.setRequesterRoleOverride,
    presentLostMessage: createPresentDiscordLostMessage(translator),
    publishMessage: gateway.publishMessage,
    enqueueSpeech,
    recordEvent: (event) => {
      logger.info(event, 'Discord interaction handled');
    },
  });
  let removeInteractionObserver: (() => void) | null = null;

  return Object.freeze({
    startAcceptingInteractions: () => {
      removeInteractionObserver ??= gateway.observeInteractions((source) =>
        dispatchDiscordInteraction(source, translator, handleButton, () => {
          logger.error(
            { code: 'DISCORD_INTERACTION_FAILED', stage: 'dispatch' },
            'Discord interaction dispatch failed'
          );
        })
      );
    },
    connect: async () => {
      await gateway.connect();
    },
    validatePanel: () =>
      validatePanel({
        guildId: configuration.guildId,
        textChannelId: configuration.textChannelId,
        controlMessageId,
        panel,
      }),
    observeGatewayState: gateway.observeGatewayState,
    stopAcceptingInteractions: () => {
      removeInteractionObserver?.();
      removeInteractionObserver = null;
    },
    destroy: gateway.destroy,
  });
}

function createConfiguredSpeechCoordinator(
  configuration: Extract<SpeechConfiguration, Readonly<{ enabled: true }>>,
  adapters: DiscordServingAdapters,
  logger: Logger,
  dependencies: CreateServingRuntimeDependencies
): SpeechCoordinator {
  const ttsOptions = Object.freeze({
    baseUrl: configuration.ttsBaseUrl,
    maxAudioBytes: 4_194_304,
  });
  const ttsDependencies = Object.freeze({ fetch: dependencies.fetch });
  const probeTtsReadiness = createTtsReadinessProbe(ttsOptions, ttsDependencies);

  return createSpeechCoordinator(
    {
      jobTtlMs: configuration.jobTtlMs,
      ttsTimeoutMs: configuration.ttsTimeoutMs,
      voiceReadyTimeoutMs: configuration.voiceReadyTimeoutMs,
      playbackTimeoutMs: configuration.playbackTimeoutMs,
      consecutiveFailuresBeforeTextOnly: configuration.consecutiveFailuresBeforeTextOnly,
      recoveryProbeIntervalMs: configuration.recoveryProbeIntervalMs,
      queueCapacity: configuration.queueCapacity,
    },
    {
      synthesizeSpeech: createTtsHttpAdapter(ttsOptions, ttsDependencies),
      voiceOutput: adapters.voice,
      recoverSpeechDelivery: createRecoverSpeechDelivery({
        probeTtsReadiness: (signal) =>
          probeTtsReadiness(AbortSignal.any([signal, AbortSignal.timeout(configuration.ttsTimeoutMs)])),
        recoverVoice: (signal) =>
          adapters.voice.recover(AbortSignal.any([signal, AbortSignal.timeout(configuration.voiceReadyTimeoutMs)])),
      }),
      monotonicNow: dependencies.monotonicNow,
      createJobId: dependencies.createJobId,
      scheduleTask: dependencies.scheduleTask,
      recordEvent: (event) => {
        logger.info(event, 'Speech delivery state changed');
      },
    }
  );
}

function assertServingDiscordConfiguration(configuration: DiscordConfiguration): void {
  if (configuration.enabled) {
    requireControlMessageId(configuration);
  }
}

function requireControlMessageId(configuration: Extract<DiscordConfiguration, Readonly<{ enabled: true }>>): string {
  if (configuration.controlMessageId === null) {
    throw new ConfigurationError({ source: 'discord_combined', stage: 'validation' });
  }

  return configuration.controlMessageId;
}

const textOnlySpeechAdmission: EnqueueSpeech = () => Object.freeze({ status: 'text_only' });
