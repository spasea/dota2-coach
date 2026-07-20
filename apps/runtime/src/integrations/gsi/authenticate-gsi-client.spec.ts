import { describe, expect, it } from '@jest/globals';

import type { TrustedClientIdentity, TrustedClientRegistry } from '../../platform/config/config.types.js';
import { authenticateGsiClient } from './authenticate-gsi-client.js';

const trustedIdentity: TrustedClientIdentity = Object.freeze({
  clientId: 'client-01',
  discordUserId: '123456789012345678',
  coachAlias: 'Local Player',
  defaultRole: 2,
});

const registry: TrustedClientRegistry = {
  resolveToken: (gsiToken) => (gsiToken === 'known-gsi-token' ? trustedIdentity : null),
};

describe('GSI client authentication', () => {
  it('returns only the trusted identity for a known GSI auth token', () => {
    expect(authenticateGsiClient('known-gsi-token', registry)).toBe(trustedIdentity);
    expect(authenticateGsiClient('known-gsi-token', registry)).not.toHaveProperty('gsiToken');
  });

  it('returns the same result for a missing and an unknown GSI auth token', () => {
    const missingResult = authenticateGsiClient(undefined, registry);
    const unknownResult = authenticateGsiClient('unknown-gsi-token', registry);

    expect(missingResult).toBeNull();
    expect(unknownResult).toBe(missingResult);
  });
});
