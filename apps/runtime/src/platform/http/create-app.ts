import express, { type Express, type Router } from 'express';
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
  manualSpeechRouter: Router | null;
  recordClientSnapshot: RecordClientSnapshot;
  requestIdFactory: RequestIdFactory;
  trustedClientRegistry: TrustedClientRegistry;
}>;

export function createApp(dependencies: CreateAppDependencies): Express {
  const app = express();

  app.use(createRequestContextMiddleware(dependencies.requestIdFactory));
  app.use(createRequestLoggingMiddleware(dependencies.logger));
  app.use(createHealthRouter());
  app.use(
    '/gsi',
    express.json({
      limit: dependencies.gsiBodyLimitBytes,
      strict: false,
      type: 'application/json',
    })
  );
  app.use(
    createGsiRouter({
      recordClientSnapshot: dependencies.recordClientSnapshot,
      trustedClientRegistry: dependencies.trustedClientRegistry,
    })
  );
  if (dependencies.manualSpeechRouter !== null) {
    app.use(dependencies.manualSpeechRouter);
  }
  app.use(notFoundHandler);
  app.use(finalErrorHandler);

  return app;
}
