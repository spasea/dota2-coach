import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

import type { Logger } from 'pino';

import { createLostConsoleDebug } from '../integrations/console/lost-console-debug.js';
import {
  createLostRecommendationCapability,
  parseLostPolicy,
  type RecommendLostAction,
} from '../modules/lost/public.js';
import {
  createBuildCoachContext,
  createInMemoryActiveMatchStore,
  createInMemoryNormalizedLatestStateStore,
  createRecordClientSnapshot,
  createSetRequesterRoleOverride,
  type BuildCoachContext,
  type RecordClientSnapshot,
  type SetRequesterRoleOverride,
} from '../modules/match/public.js';
import type { ReadConfigText } from '../platform/config/config.types.js';
import { ConfigurationError } from '../platform/config/configuration-error.js';
import { loadClientConfigSources } from '../platform/config/load-runtime-config.js';
import { parseClientConfig } from '../platform/config/parse-client-config.js';
import { parseRuntimeSettings, type RuntimeLogLevel } from '../platform/config/parse-runtime-settings.js';
import { createApp } from '../platform/http/create-app.js';
import type { RequestIdFactory } from '../platform/http/middleware/request-context.js';
import { createLogger as createPinoLogger } from '../platform/logging/create-logger.js';
import { readMonotonicMilliseconds, type MonotonicClock } from '../platform/time/monotonic-clock.js';

const GSI_BODY_LIMIT_BYTES = 1_048_576;
const LOST_CONSOLE_DEBUG_INTERVAL_MS = 30_000;
const PLAYER_HISTORY_RETENTION_MS = 90_000;
const BUILDING_WINDOWS = Object.freeze({
  activeDamageMs: 6_000,
  recentDamageMs: 15_000,
  pressureMs: 30_000,
});

export type RuntimeAddress = Readonly<{
  host: string;
  port: number;
}>;

export type Runtime = Readonly<{
  buildCoachContext: BuildCoachContext;
  recommendLostAction: RecommendLostAction;
  setRequesterRoleOverride: SetRequesterRoleOverride;
  start: () => Promise<RuntimeAddress>;
  stop: () => Promise<void>;
}>;

export type CreateRuntimeDependencies = Readonly<{
  createLogger: (logLevel: RuntimeLogLevel) => Logger;
  monotonicNow: MonotonicClock;
  readConfigText: ReadConfigText;
  requestIdFactory: RequestIdFactory;
  writeDebugOutput: (output: string) => void;
}>;

const defaultDependencies: CreateRuntimeDependencies = Object.freeze({
  createLogger: createPinoLogger,
  monotonicNow: readMonotonicMilliseconds,
  readConfigText: (path) => readFile(path, 'utf8'),
  requestIdFactory: randomUUID,
  writeDebugOutput: (output) => process.stdout.write(`${output}\n`),
});

export async function createRuntime(
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: CreateRuntimeDependencies = defaultDependencies
): Promise<Runtime> {
  const settings = parseRuntimeSettings(environment);
  const logger = dependencies.createLogger(settings.logLevel);
  const configSources = await loadClientConfigSources(
    {
      clientConfigPath: settings.clientConfigPath,
      clientCredentialsPath: settings.clientCredentialsPath,
    },
    dependencies.readConfigText
  );
  const trustedClientRegistry = parseClientConfig(configSources);
  let lostPolicyYaml: string;

  try {
    lostPolicyYaml = await dependencies.readConfigText(settings.lostPolicyPath);
  } catch {
    throw new ConfigurationError({ source: 'lost_policy', stage: 'source' });
  }

  const lostPolicy = parseLostPolicy(lostPolicyYaml);

  const latestStateStore = createInMemoryNormalizedLatestStateStore();
  const activeMatchStore = createInMemoryActiveMatchStore();
  const recordClientSnapshot = createRecordClientSnapshot({
    activeMatchStore,
    freshnessMs: settings.gsiFreshnessMs,
    latestStateStore,
    logLifecycleTransition: (metadata) => {
      logger.info(metadata, 'match lifecycle transitioned');
    },
    monotonicNow: dependencies.monotonicNow,
    playerHistoryRetentionMs: PLAYER_HISTORY_RETENTION_MS,
  });
  const buildCoachContext = createBuildCoachContext({
    activeMatchStore,
    buildingWindows: BUILDING_WINDOWS,
    clientDirectory: trustedClientRegistry,
    freshnessMs: settings.gsiFreshnessMs,
    latestStateStore,
    monotonicNow: dependencies.monotonicNow,
  });
  const setRequesterRoleOverride = createSetRequesterRoleOverride({
    activeMatchStore,
    clientDirectory: trustedClientRegistry,
    freshnessMs: settings.gsiFreshnessMs,
    latestStateStore,
    monotonicNow: dependencies.monotonicNow,
  });
  const recommendLostAction = createLostRecommendationCapability({
    buildCoachContext,
    locale: settings.coachLocale,
    monotonicNow: dependencies.monotonicNow,
    policy: lostPolicy,
    recordDecision: (metadata) => {
      logger.info(metadata, 'lost recommendation decided');
    },
  });
  const observeLostConsoleDebug = createLostConsoleDebug({
    enabled: settings.lostConsoleDebugEnabled,
    intervalMs: LOST_CONSOLE_DEBUG_INTERVAL_MS,
    monotonicNow: dependencies.monotonicNow,
    recommendLostAction,
    reportFailure: () => {
      logger.warn({ code: 'LOST_CONSOLE_DEBUG_ERROR' }, 'lost console debug output failed');
    },
    writeOutput: dependencies.writeDebugOutput,
  });
  const recordClientSnapshotWithDebug: RecordClientSnapshot = (command) => {
    recordClientSnapshot(command);
    observeLostConsoleDebug({
      clientId: command.identity.clientId,
      discordUserId: command.identity.discordUserId,
      matchId: command.snapshot.match?.matchId ?? null,
    });
  };
  const app = createApp({
    gsiBodyLimitBytes: GSI_BODY_LIMIT_BYTES,
    logger,
    manualSpeechRouter: null,
    recordClientSnapshot: recordClientSnapshotWithDebug,
    requestIdFactory: dependencies.requestIdFactory,
    trustedClientRegistry,
  });
  const server = createServer(app);

  return Object.freeze({
    buildCoachContext,
    recommendLostAction,
    setRequesterRoleOverride,
    start: async () => {
      await new Promise<void>((resolve, reject) => {
        const handleError = (error: Error) => {
          reject(error);
        };

        server.once('error', handleError);
        server.listen(settings.port, settings.host, () => {
          server.off('error', handleError);
          resolve();
        });
      });

      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : settings.port;
      const runtimeAddress = Object.freeze({ host: settings.host, port });

      return runtimeAddress;
    },
    stop: async () => {
      if (!server.listening) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }

          reject(error);
        });
      });
    },
  });
}

export function createRuntimeWithLogger(
  environment: Readonly<Record<string, string | undefined>>,
  logger: Logger
): Promise<Runtime> {
  return createRuntime(environment, { ...defaultDependencies, createLogger: () => logger });
}
