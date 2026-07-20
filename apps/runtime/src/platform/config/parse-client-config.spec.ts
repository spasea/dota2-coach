import { describe, expect, it } from '@jest/globals';

import type { ClientConfigYamlSources } from './config.types.js';
import { ConfigurationError } from './configuration-error.js';
import { parseClientConfig } from './parse-client-config.js';

const bearerToken = 'local-test-token-with-high-entropy-placeholder';

const validSources: ClientConfigYamlSources = {
  clientsYaml: `
schema_version: 1
clients:
  client-01:
    default_role: 2
`,
  credentialsYaml: `
schema_version: 1
client_credentials:
  client-01:
    bearer_token: ${bearerToken}
    discord_user_id: "123456789"
    coach_alias: Local Player
`,
};

function captureConfigurationError(run: () => unknown): ConfigurationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return error as ConfigurationError;
  }

  throw new Error('Expected configuration parsing to fail.');
}

describe('trusted client configuration', () => {
  it('joins public and private configuration into an immutable safe identity lookup', () => {
    const registry = parseClientConfig(validSources);
    const identity = registry.resolveToken(bearerToken);

    expect(identity).toEqual({
      clientId: 'client-01',
      discordUserId: '123456789',
      coachAlias: 'Local Player',
      defaultRole: 2,
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(identity).not.toHaveProperty('bearerToken');
    expect(JSON.stringify(registry)).not.toContain(bearerToken);
  });

  it('does not retain a caller-owned source reference', () => {
    const callerOwnedSources = {
      ...validSources,
      credentialsYaml: 'schema_version: 1\nclient_credentials: {}',
    };
    const registry = parseClientConfig(callerOwnedSources);

    expect(registry.resolveToken(bearerToken)?.clientId).toBe('client-01');
  });

  it('reports invalid YAML without exposing its contents', () => {
    const secretValue = 'must-never-appear-in-an-error';
    const error = captureConfigurationError(() =>
      parseClientConfig({
        ...validSources,
        credentialsYaml: `client_credentials: [${secretValue}`,
      })
    );

    expect(error).toMatchObject({ source: 'credentials', stage: 'syntax' });
    expect(error.message).not.toContain(secretValue);
  });

  it.each([
    ['missing clients', 'schema_version: 1', validSources.credentialsYaml],
    ['invalid role', 'schema_version: 1\nclients:\n  client-01:\n    default_role: 6', validSources.credentialsYaml],
    [
      'empty token',
      validSources.clientsYaml,
      'schema_version: 1\nclient_credentials:\n  client-01:\n    bearer_token: ""\n    discord_user_id: "123456789"\n    coach_alias: Local Player',
    ],
    ['incomplete join', validSources.clientsYaml, 'schema_version: 1\nclient_credentials: {}'],
    [
      'unknown private client',
      validSources.clientsYaml,
      `
schema_version: 1
client_credentials:
  client-02:
    bearer_token: another-local-test-token
    discord_user_id: "987654321"
    coach_alias: Second Player
`,
    ],
    [
      'mismatched document versions',
      validSources.clientsYaml,
      validSources.credentialsYaml.replace('schema_version: 1', 'schema_version: 2'),
    ],
  ])('rejects %s during semantic validation', (_caseName, clientsYaml, credentialsYaml) => {
    const error = captureConfigurationError(() => parseClientConfig({ clientsYaml, credentialsYaml }));

    expect(error.stage).toBe('validation');
  });

  it.each([
    [
      'bearer token',
      `
schema_version: 1
client_credentials:
  client-01:
    bearer_token: ${bearerToken}
    discord_user_id: "123456789"
    coach_alias: Local Player
  client-02:
    bearer_token: ${bearerToken}
    discord_user_id: "987654321"
    coach_alias: Second Player
`,
    ],
    [
      'Discord identity',
      `
schema_version: 1
client_credentials:
  client-01:
    bearer_token: ${bearerToken}
    discord_user_id: "123456789"
    coach_alias: Local Player
  client-02:
    bearer_token: another-local-test-token
    discord_user_id: "123456789"
    coach_alias: Second Player
`,
    ],
  ])('rejects a duplicate %s', (_caseName, credentialsYaml) => {
    const error = captureConfigurationError(() =>
      parseClientConfig({
        clientsYaml: `
schema_version: 1
clients:
  client-01:
    default_role: 2
  client-02:
    default_role: 5
`,
        credentialsYaml,
      })
    );

    expect(error.stage).toBe('validation');
  });
});
