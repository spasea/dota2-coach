import type { TrustedClientIdentity, TrustedClientRegistry } from '../../platform/config/config.types.js';

export function authenticateGsiClient(
  gsiToken: string | undefined,
  registry: TrustedClientRegistry
): TrustedClientIdentity | null {
  return gsiToken === undefined ? null : registry.resolveToken(gsiToken);
}
