import type { ClientConfigPaths, ClientConfigYamlSources, ReadConfigText } from './config.types.js';
import { ConfigurationError } from './configuration-error.js';

export async function loadClientConfigSources(
  paths: ClientConfigPaths,
  readConfigText: ReadConfigText
): Promise<ClientConfigYamlSources> {
  let clientsYaml: string;
  let credentialsYaml: string;

  try {
    clientsYaml = await readConfigText(paths.clientConfigPath);
  } catch {
    throw new ConfigurationError({ source: 'clients', stage: 'source' });
  }

  try {
    credentialsYaml = await readConfigText(paths.clientCredentialsPath);
  } catch {
    throw new ConfigurationError({ source: 'credentials', stage: 'source' });
  }

  return Object.freeze({ clientsYaml, credentialsYaml });
}
