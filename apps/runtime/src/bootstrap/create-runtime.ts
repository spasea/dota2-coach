import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

import type { Logger } from 'pino';

import {
  createInMemoryMatchSessionStore,
  createInMemoryNormalizedLatestStateStore,
  createRecordClientSnapshot,
} from '../modules/match/public.js';
import type { ReadConfigText } from '../platform/config/config.types.js';
import { loadClientConfigSources } from '../platform/config/load-runtime-config.js';
import { parseClientConfig } from '../platform/config/parse-client-config.js';
import { parseRuntimeSettings, type RuntimeLogLevel } from '../platform/config/parse-runtime-settings.js';
import { createApp } from '../platform/http/create-app.js';
import type { RequestIdFactory } from '../platform/http/middleware/request-context.js';
import { createLogger as createPinoLogger } from '../platform/logging/create-logger.js';
import { readMonotonicMilliseconds, type MonotonicClock } from '../platform/time/monotonic-clock.js';

const GSI_BODY_LIMIT_BYTES = 1_048_576;

export type RuntimeAddress = Readonly<{
  host: string;
  port: number;
}>;

export type Runtime = Readonly<{
  start: () => Promise<RuntimeAddress>;
  stop: () => Promise<void>;
}>;

export type CreateRuntimeDependencies = Readonly<{
  createLogger: (logLevel: RuntimeLogLevel) => Logger;
  monotonicNow: MonotonicClock;
  readConfigText: ReadConfigText;
  requestIdFactory: RequestIdFactory;
}>;

const defaultDependencies: CreateRuntimeDependencies = Object.freeze({
  createLogger: createPinoLogger,
  monotonicNow: readMonotonicMilliseconds,
  readConfigText: (path) => readFile(path, 'utf8'),
  requestIdFactory: randomUUID,
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
  const latestStateStore = createInMemoryNormalizedLatestStateStore();
  const matchSessionStore = createInMemoryMatchSessionStore();
  const recordClientSnapshot = createRecordClientSnapshot({
    freshnessMs: settings.gsiFreshnessMs,
    latestStateStore,
    logLifecycleTransition: (metadata) => {
      logger.info(metadata, 'match lifecycle transitioned');
    },
    matchSessionStore,
    monotonicNow: dependencies.monotonicNow,
  });
  const app = createApp({
    gsiBodyLimitBytes: GSI_BODY_LIMIT_BYTES,
    logger,
    recordClientSnapshot,
    requestIdFactory: dependencies.requestIdFactory,
    trustedClientRegistry,
  });
  const server = createServer(app);

  return Object.freeze({
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

      logger.info(runtimeAddress, 'runtime started');
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
      logger.info('runtime stopped');
    },
  });
}
