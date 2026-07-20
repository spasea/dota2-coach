import { describe, expect, it } from '@jest/globals';

import { loadClientConfigSources } from './load-runtime-config.js';

describe('client configuration sources', () => {
  it('loads the public and private YAML documents from their process-boundary paths', async () => {
    const requestedPaths: string[] = [];
    const documents = new Map([
      ['/etc/dota2-coach/clients.yaml', 'public config'],
      ['/run/secrets/dota2-coach/client-credentials.yaml', 'private config'],
    ]);

    const sources = await loadClientConfigSources(
      {
        clientConfigPath: '/etc/dota2-coach/clients.yaml',
        clientCredentialsPath: '/run/secrets/dota2-coach/client-credentials.yaml',
      },
      (path) => {
        requestedPaths.push(path);
        return Promise.resolve(documents.get(path) ?? '');
      }
    );

    expect(requestedPaths).toEqual([
      '/etc/dota2-coach/clients.yaml',
      '/run/secrets/dota2-coach/client-credentials.yaml',
    ]);
    expect(sources).toEqual({
      clientsYaml: 'public config',
      credentialsYaml: 'private config',
    });
  });
});
