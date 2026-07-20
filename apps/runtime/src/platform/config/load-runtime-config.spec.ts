import { describe, expect, it } from '@jest/globals';

import { ConfigurationError } from './configuration-error.js';
import { loadClientConfigSources } from './load-runtime-config.js';

const configPaths = {
  clientConfigPath: '/etc/dota2-coach/clients.yaml',
  clientCredentialsPath: '/run/secrets/dota2-coach/client-credentials.yaml',
};

describe('client configuration sources', () => {
  it('loads the public and private YAML documents from their process-boundary paths', async () => {
    const requestedPaths: string[] = [];
    const documents = new Map([
      ['/etc/dota2-coach/clients.yaml', 'public config'],
      ['/run/secrets/dota2-coach/client-credentials.yaml', 'private config'],
    ]);

    const sources = await loadClientConfigSources(configPaths, (path) => {
      requestedPaths.push(path);
      return Promise.resolve(documents.get(path) ?? '');
    });

    expect(requestedPaths).toEqual([
      '/etc/dota2-coach/clients.yaml',
      '/run/secrets/dota2-coach/client-credentials.yaml',
    ]);
    expect(sources).toEqual({
      clientsYaml: 'public config',
      credentialsYaml: 'private config',
    });
    expect(Object.isFrozen(sources)).toBe(true);
  });

  it.each([
    ['clients', configPaths.clientConfigPath],
    ['credentials', configPaths.clientCredentialsPath],
  ] as const)('reports a safe %s source error', async (source, failingPath) => {
    const sourceErrorMessage = 'filesystem details must remain private';
    const result = await loadClientConfigSources(configPaths, (path) => {
      if (path === failingPath) {
        return Promise.reject(new Error(sourceErrorMessage));
      }

      return Promise.resolve('config document');
    }).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(ConfigurationError);
    expect(result).toMatchObject({ source, stage: 'source' });
    expect(String(result)).not.toContain(sourceErrorMessage);
    expect(String(result)).not.toContain(failingPath);
  });
});
