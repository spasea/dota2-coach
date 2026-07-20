import type { ClientConfigPaths, ClientConfigYamlSources, ReadConfigText } from './config.types.js';

export function loadClientConfigSources(
  paths: ClientConfigPaths,
  readConfigText: ReadConfigText
): Promise<ClientConfigYamlSources> {
  void paths;
  void readConfigText;

  return Promise.reject(new Error('Phase 3 configuration source loading is not implemented.'));
}
