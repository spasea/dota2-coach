import type { ClientConfigYamlSources, TrustedClientRegistry } from './config.types.js';

export function parseClientConfig(sources: ClientConfigYamlSources): TrustedClientRegistry {
  void sources;

  throw new Error('Phase 3 client configuration parsing is not implemented.');
}
