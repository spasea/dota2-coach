import { Router } from 'express';

import type { RecordClientSnapshot } from '../../modules/match/public.js';
import type { TrustedClientRegistry } from '../../platform/config/config.types.js';
import { HttpError } from '../../platform/http/errors/http-error.js';
import { setResolvedClientId } from '../../platform/http/middleware/request-context.js';
import { authenticateGsiClient } from './authenticate-gsi-client.js';

export type GsiRouterDependencies = Readonly<{
  recordClientSnapshot: RecordClientSnapshot;
  trustedClientRegistry: TrustedClientRegistry;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createGsiRouter(dependencies: GsiRouterDependencies): Router {
  const router = Router();

  router.post('/gsi', (request, response) => {
    if (request.is('application/json') !== 'application/json') {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE');
    }

    const body: unknown = request.body;

    if (!isObject(body)) {
      throw new HttpError(422, 'INVALID_SNAPSHOT');
    }

    const auth = body.auth;
    const gsiToken = isObject(auth) && typeof auth.token === 'string' ? auth.token : undefined;
    const identity = authenticateGsiClient(gsiToken, dependencies.trustedClientRegistry);

    if (identity === null) {
      throw new HttpError(401, 'UNAUTHORIZED');
    }

    const { auth: transportAuth, ...snapshot } = body;
    void transportAuth;

    dependencies.recordClientSnapshot({ identity, snapshot });
    setResolvedClientId(response, identity.clientId);
    response.status(200).end();
  });

  return router;
}
