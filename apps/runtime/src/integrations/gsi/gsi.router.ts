import { Router } from 'express';

import type { RecordClientSnapshot } from '../../modules/match/public.js';
import type { TrustedClientRegistry } from '../../platform/config/config.types.js';
import { createAuthenticateGsiRequest } from './middleware/authenticate-gsi-request.js';
import { getGsiRequestContext } from './middleware/gsi-request-context.js';
import { parseGsiRequest } from './middleware/parse-gsi-request.js';

export type GsiRouterDependencies = Readonly<{
  recordClientSnapshot: RecordClientSnapshot;
  trustedClientRegistry: TrustedClientRegistry;
}>;

export function createGsiRouter(dependencies: GsiRouterDependencies): Router {
  const router = Router();

  router.post(
    '/gsi',
    parseGsiRequest,
    createAuthenticateGsiRequest(dependencies.trustedClientRegistry),
    (_request, response) => {
      const context = getGsiRequestContext(response);

      if (context.stage !== 'authenticated') {
        throw new Error('GSI request handler must run after authentication.');
      }

      dependencies.recordClientSnapshot({
        identity: context.identity,
        snapshot: context.snapshot,
      });
      response.status(200).end();
    }
  );

  return router;
}
