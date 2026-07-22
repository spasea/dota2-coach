import { readFile } from 'node:fs/promises';

import type { Logger } from 'pino';

import { createDiscordGatewayAdapter } from '../integrations/discord/infrastructure/discord-gateway-adapter.js';
import { createRussianDiscordTranslator } from '../integrations/discord/infrastructure/russian-discord-translator.js';
import { createDiscordPanelDefinition } from '../integrations/discord/panel/discord-panel.js';
import {
  createProvisionDiscordPanel,
  DiscordPanelProvisionError,
} from '../integrations/discord/panel/discord-panel-lifecycle.js';
import { ConfigurationError } from '../platform/config/configuration-error.js';
import { loadDiscordConfig } from '../platform/config/load-discord-config.js';
import { parseDiscordProcessSettings } from '../platform/config/parse-discord-process-settings.js';
import { parseApplicationSettings, type RuntimeLogLevel } from '../platform/config/parse-runtime-settings.js';
import { createLogger } from '../platform/logging/create-logger.js';
import { createServingRuntime } from './create-serving-runtime.js';
import {
  runApplication,
  runApplicationProcess,
  type RunApplicationDependencies,
  type RuntimeProcessFailure,
} from './run-application.js';
import { RuntimeStartupError } from './runtime-lifecycle.js';

const runtimeLogLevels = new Set<RuntimeLogLevel>(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);

export function runProductionApplication(environment: Readonly<Record<string, string | undefined>>): Promise<void> {
  const logger = createLogger(resolveBootstrapLogLevel(environment.LOG_LEVEL));
  const applicationDependencies = createProductionApplicationDependencies(environment, logger);

  return runApplicationProcess({
    execute: () => runApplication(environment, applicationDependencies),
    registerShutdownSignals: (stop) => registerShutdownSignals(stop, logger),
    mapFailure: mapRuntimeProcessFailure,
    recordFailure: (failure) => {
      logger.fatal(failure, 'runtime startup failed');
    },
    setExitCode: (exitCode) => {
      process.exitCode = exitCode;
    },
  });
}

export function createProductionApplicationDependencies(
  environment: Readonly<Record<string, string | undefined>>,
  logger: Logger
): RunApplicationDependencies {
  return Object.freeze({
    resolveProcessMode: (currentEnvironment) => {
      const settings = parseDiscordProcessSettings(currentEnvironment);
      return Object.freeze({
        kind: settings.discordCreatePanel ? 'provision_discord_panel' : 'serve',
      });
    },
    loadDiscordConfiguration: (currentEnvironment) => {
      const settings = parseDiscordProcessSettings(currentEnvironment);
      return loadDiscordConfig(settings, (path) => readFile(path, 'utf8'));
    },
    provisionDiscordPanel: async (configuration) => {
      parseApplicationSettings(environment);
      const translator = createRussianDiscordTranslator();
      const gateway = createDiscordGatewayAdapter(configuration.botToken);
      const provisionPanel = createProvisionDiscordPanel(gateway, () => {
        logger.error({ code: 'DISCORD_PANEL_CLEANUP_ERROR' }, 'Discord panel cleanup failed');
      });

      return provisionPanel({
        guildId: configuration.guildId,
        textChannelId: configuration.textChannelId,
        panel: createDiscordPanelDefinition(translator),
      });
    },
    createServingRuntime: (currentEnvironment, configuration) =>
      createServingRuntime(currentEnvironment, configuration, logger),
    recordPanelCreated: (result) => {
      logger.info({ code: 'DISCORD_PANEL_CREATED', ...result }, 'Discord panel created');
    },
  });
}

export function mapRuntimeProcessFailure(error: unknown): RuntimeProcessFailure {
  if (error instanceof ConfigurationError) {
    return Object.freeze({ code: error.code, source: error.source, stage: error.stage });
  }

  if (error instanceof DiscordPanelProvisionError) {
    return Object.freeze({ code: error.code, stage: error.stage });
  }

  if (error instanceof RuntimeStartupError) {
    return Object.freeze({ code: error.code, stage: error.stage });
  }

  return Object.freeze({ code: 'RUNTIME_STARTUP_ERROR', stage: 'http_bind' });
}

function resolveBootstrapLogLevel(value: string | undefined): RuntimeLogLevel {
  return runtimeLogLevels.has(value as RuntimeLogLevel) ? (value as RuntimeLogLevel) : 'info';
}

function registerShutdownSignals(stop: () => Promise<void>, logger: Logger): void {
  let shutdownStarted = false;
  const shutdown = () => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    void stop().catch(() => {
      logger.error({ code: 'RUNTIME_SHUTDOWN_ERROR' }, 'runtime shutdown failed');
      process.exitCode = 1;
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
