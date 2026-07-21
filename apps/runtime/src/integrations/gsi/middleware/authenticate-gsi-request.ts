import type { RequestHandler } from 'express';

import type { TrustedClientRegistry } from '../../../platform/config/config.types.js';
import { HttpError } from '../../../platform/http/errors/http-error.js';
import { setResolvedClientId } from '../../../platform/http/middleware/request-context.js';
import { authenticateGsiClient } from '../authenticate-gsi-client.js';
import { getGsiRequestContext, setGsiRequestContext } from './gsi-request-context.js';

export function createAuthenticateGsiRequest(registry: TrustedClientRegistry): RequestHandler {
  return (_request, response, next) => {
    const context = getGsiRequestContext(response);

    if (context.stage !== 'parsed') {
      throw new Error('GSI authentication middleware must run after request parsing.');
    }

    const identity = authenticateGsiClient(context.gsiToken, registry);

    if (identity === null) {
      throw new HttpError(401, 'UNAUTHORIZED');
    }

    setGsiRequestContext(
      response,
      Object.freeze({
        stage: 'authenticated',
        identity,
        snapshot: context.snapshot,
      })
    );
    setResolvedClientId(response, identity.clientId);
    next();
  };
}
