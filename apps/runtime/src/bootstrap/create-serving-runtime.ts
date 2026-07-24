import type { Logger } from 'pino';

import { createDiscordActionDebounce } from '../integrations/discord/application/action-debounce.js';
import { createHandleDiscordButton } from '../integrations/discord/application/handle-discord-button.js';
import { createPresentDiscordLostMessage } from '../integrations/discord/application/present-discord-lost-message.js';
import { createResolveDiscordLostActionScope } from '../integrations/discord/application/resolve-discord-lost-action-scope.js';
import {
  createDiscordGatewayAdapter,
  type DiscordGatewayAdapter,
} from '../integrations/discord/infrastructure/discord-gateway-adapter.js';
import { dispatchDiscordInteraction } from '../integrations/discord/infrastructure/discord-interaction-adapter.js';
import { createRussianDiscordTranslator } from '../integrations/discord/infrastructure/russian-discord-translator.js';
import { createDiscordPanelDefinition } from '../integrations/discord/panel/discord-panel.js';
import { createValidateDiscordPanel } from '../integrations/discord/panel/discord-panel-lifecycle.js';
import type { DiscordConfiguration } from '../platform/config/config.types.js';
import { ConfigurationError } from '../platform/config/configuration-error.js';
import { readMonotonicMilliseconds, type MonotonicClock } from '../platform/time/monotonic-clock.js';
import { createRuntimeWithLogger, type Runtime } from './create-runtime.js';
import {
  createRuntimeLifecycle,
  type DiscordServingLifecycle,
  type RuntimeLifecycle,
  RuntimeStartupError,
} from './runtime-lifecycle.js';

export type CreateServingRuntimeDependencies = Readonly<{
  createCoreRuntime: (environment: Readonly<Record<string, string | undefined>>, logger: Logger) => Promise<Runtime>;
  createDiscordGateway: (botToken: string) => DiscordGatewayAdapter;
  monotonicNow: MonotonicClock;
}>;

const defaultDependencies: CreateServingRuntimeDependencies = Object.freeze({
  createCoreRuntime: createRuntimeWithLogger,
  createDiscordGateway: (botToken) => createDiscordGatewayAdapter(botToken, undefined, 'serving'),
  monotonicNow: readMonotonicMilliseconds,
});

export async function createServingRuntime(
  environment: Readonly<Record<string, string | undefined>>,
  configuration: DiscordConfiguration,
  logger: Logger,
  dependencies: CreateServingRuntimeDependencies = defaultDependencies
): Promise<RuntimeLifecycle> {
  let coreRuntime: Runtime;

  try {
    coreRuntime = await dependencies.createCoreRuntime(environment, logger);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }

    throw new RuntimeStartupError('http_bind');
  }

  let discord: DiscordServingLifecycle | null = null;

  if (configuration.enabled) {
    try {
      discord = createDiscordServingLifecycle(configuration, coreRuntime, logger, dependencies);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }

      throw new RuntimeStartupError('discord_connect');
    }
  }

  return createRuntimeLifecycle({
    http: coreRuntime,
    discord,
    speech: null,
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
  logger: Logger,
  dependencies: CreateServingRuntimeDependencies
): DiscordServingLifecycle {
  if (configuration.controlMessageId === null) {
    throw new ConfigurationError({ source: 'discord_combined', stage: 'validation' });
  }

  const controlMessageId = configuration.controlMessageId;
  const gateway = dependencies.createDiscordGateway(configuration.botToken);
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
      monotonicNow: dependencies.monotonicNow,
    }),
    resolveLostActionScope: createResolveDiscordLostActionScope(coreRuntime.buildCoachContext),
    recommendLostAction: coreRuntime.recommendLostAction,
    setRequesterRoleOverride: coreRuntime.setRequesterRoleOverride,
    presentLostMessage: createPresentDiscordLostMessage(translator),
    publishMessage: gateway.publishMessage,
    enqueueSpeech: () => Object.freeze({ status: 'text_only' }),
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
