import { describe, expect, it } from '@jest/globals';

import type { TrustedClientIdentity, TrustedClientRegistry } from '../../platform/config/config.types.js';
import { authenticateGsiClient } from './authenticate-gsi-client.js';

const trustedIdentity: TrustedClientIdentity = Object.freeze({
  clientId: 'client-01',
  discordUserId: '123456789',
  coachAlias: 'Local Player',
  defaultRole: 2,
});

const registry: TrustedClientRegistry = {
  resolveToken: (bearerToken) => (bearerToken === 'known-token' ? trustedIdentity : null),
};

describe('GSI client authentication', () => {
  it('returns only the trusted identity for a known bearer token', () => {
    expect(authenticateGsiClient('known-token', registry)).toBe(trustedIdentity);
    expect(authenticateGsiClient('known-token', registry)).not.toHaveProperty('bearerToken');
  });

  it('returns the same result for a missing and an unknown bearer token', () => {
    const missingResult = authenticateGsiClient(undefined, registry);
    const unknownResult = authenticateGsiClient('unknown-token', registry);

    expect(missingResult).toBeNull();
    expect(unknownResult).toBe(missingResult);
  });
});
