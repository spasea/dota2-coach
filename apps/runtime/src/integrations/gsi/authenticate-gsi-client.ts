import type { TrustedClientIdentity, TrustedClientRegistry } from '../../platform/config/config.types.js';

export function authenticateGsiClient(
  bearerToken: string | undefined,
  registry: TrustedClientRegistry
): TrustedClientIdentity | null {
  void bearerToken;
  void registry;

  throw new Error('Phase 3 GSI client authentication is not implemented.');
}
