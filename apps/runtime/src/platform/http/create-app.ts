import express, { type Express } from 'express';
import type { Logger } from 'pino';

import { createGsiRouter } from '../../integrations/gsi/gsi.router.js';
import type { RecordClientSnapshot } from '../../modules/match/public.js';
import type { TrustedClientRegistry } from '../config/config.types.js';
import { finalErrorHandler } from './errors/error-handler.js';
import { createHealthRouter } from './health/health.router.js';
import { createRequestContextMiddleware, type RequestIdFactory } from './middleware/request-context.js';
import { createRequestLoggingMiddleware } from './middleware/request-logging.js';
import { notFoundHandler } from './not-found-handler.js';

export type CreateAppDependencies = Readonly<{
  gsiBodyLimitBytes: number;
  logger: Logger;
  recordClientSnapshot: RecordClientSnapshot;
  requestIdFactory: RequestIdFactory;
  trustedClientRegistry: TrustedClientRegistry;
}>;

export function createApp(dependencies: CreateAppDependencies): Express {
  const app = express();

  app.use(createRequestContextMiddleware(dependencies.requestIdFactory));
  app.use(createRequestLoggingMiddleware(dependencies.logger));
  app.use(express.json({ limit: dependencies.gsiBodyLimitBytes, strict: false }));
  app.use(createHealthRouter());
  app.use(
    createGsiRouter({
      recordClientSnapshot: dependencies.recordClientSnapshot,
      trustedClientRegistry: dependencies.trustedClientRegistry,
    })
  );
  app.use(notFoundHandler);
  app.use(finalErrorHandler);

  return app;
}
