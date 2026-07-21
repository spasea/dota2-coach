import { createServer } from 'node:http';

import { describe, expect, it } from '@jest/globals';
import pino from 'pino';

import { ConfigurationError } from '../platform/config/configuration-error.js';
import { createRuntime, type CreateRuntimeDependencies } from './create-runtime.js';

const knownGsiToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const environment = {
  CLIENT_CONFIG_PATH: '/etc/dota2-coach/clients.yaml',
  CLIENT_CREDENTIALS_PATH: '/run/secrets/dota2-coach/client-credentials.yaml',
  LOST_POLICY_PATH: '/etc/dota2-coach/lost-policy.yaml',
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  PORT: '3000',
};
const clientsYaml = `
schema_version: 1
clients:
  client-01:
    default_role: 2
`;
const credentialsYaml = `
schema_version: 1
client_credentials:
  client-01:
    gsi_token: ${knownGsiToken}
    discord_user_id: '123456789012345678'
    coach_alias: Local Player
`;
const lostPolicyYaml = `
schema_version: 1
map_depth:
  center_half_width: 1200
  base_boundary: 7700
proximity:
  structure_radius: 1600
  team_cluster_radius: 1200
  minimum_cluster_size: 2
structure_risk:
  critical_health_percent: 25
  pressured_health_percent: 60
  repeated_active_damage_events: 2
`;

function createDependencies(
  documents: ReadonlyMap<string, string> = new Map([
    [environment.CLIENT_CONFIG_PATH, clientsYaml],
    [environment.CLIENT_CREDENTIALS_PATH, credentialsYaml],
    [environment.LOST_POLICY_PATH, lostPolicyYaml],
  ])
): CreateRuntimeDependencies {
  return {
    createLogger: () => pino({ level: 'silent' }),
    monotonicNow: () => 12_345,
    readConfigText: (path) => Promise.resolve(documents.get(path) ?? ''),
    requestIdFactory: () => 'request-01',
  };
}

describe('runtime composition', () => {
  it('serves health and authenticated GSI through a real HTTP server', async () => {
    const portProbe = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      portProbe.once('error', reject);
      portProbe.listen(0, '127.0.0.1', () => {
        const address = portProbe.address();

        if (typeof address !== 'object' || address === null) {
          reject(new Error('Port probe did not expose a TCP address.'));
          return;
        }

        portProbe.close((error) => {
          if (error === undefined) {
            resolve(address.port);
            return;
          }

          reject(error);
        });
      });
    });
    const runtime = await createRuntime({ ...environment, PORT: String(port) }, createDependencies());
    const address = await runtime.start();
    const baseUrl = `http://${address.host}:${address.port}`;

    try {
      const healthResponse = await fetch(`${baseUrl}/health`);
      const gsiResponse = await fetch(`${baseUrl}/gsi`, {
        body: JSON.stringify({
          auth: { token: knownGsiToken },
          provider: { timestamp: 1_753_002_000 },
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      expect(healthResponse.status).toBe(200);
      await expect(healthResponse.json()).resolves.toEqual({ status: 'ok' });
      expect(gsiResponse.status).toBe(200);
      await expect(gsiResponse.text()).resolves.toBe('');
    } finally {
      await runtime.stop();
    }

    await expect(fetch(`${baseUrl}/health`)).rejects.toThrow();
  });

  it('rejects invalid client configuration before a server can start', async () => {
    const invalidDocuments = new Map([
      [environment.CLIENT_CONFIG_PATH, clientsYaml],
      [environment.CLIENT_CREDENTIALS_PATH, 'schema_version: invalid'],
    ]);

    const result = await createRuntime(environment, createDependencies(invalidDocuments)).catch(
      (error: unknown) => error
    );

    expect(result).toBeInstanceOf(ConfigurationError);
    expect(result).toMatchObject({ source: 'credentials', stage: 'validation' });
  });

  it('loads the Lost policy source before a server can start', async () => {
    const readPaths: string[] = [];
    const dependencies = createDependencies();

    await createRuntime(environment, {
      ...dependencies,
      readConfigText: (path) => {
        readPaths.push(path);
        return dependencies.readConfigText(path);
      },
    });

    expect(readPaths).toContain(environment.LOST_POLICY_PATH);
  });

  it.each([
    ['source', 'source', new Map([[environment.LOST_POLICY_PATH, lostPolicyYaml]])],
    ['syntax', 'syntax', new Map([[environment.LOST_POLICY_PATH, 'schema_version: [']])],
    ['validation', 'validation', new Map([[environment.LOST_POLICY_PATH, 'schema_version: 2']])],
  ] as const)('maps Lost policy %s failures before server binding', async (failureKind, stage, policyDocuments) => {
    const documents = new Map([
      [environment.CLIENT_CONFIG_PATH, clientsYaml],
      [environment.CLIENT_CREDENTIALS_PATH, credentialsYaml],
      ...policyDocuments,
    ]);
    const dependencies = createDependencies(documents);
    const readConfigText =
      failureKind === 'source'
        ? (path: string) =>
            path === environment.LOST_POLICY_PATH
              ? Promise.reject(new Error('synthetic read failure'))
              : dependencies.readConfigText(path)
        : dependencies.readConfigText;

    const result = await createRuntime(environment, { ...dependencies, readConfigText }).catch(
      (error: unknown) => error
    );

    expect(result).toBeInstanceOf(ConfigurationError);
    expect(result).toMatchObject({ source: 'lost_policy', stage });
    expect(String(result)).not.toContain(documents.get(environment.LOST_POLICY_PATH));
  });
});
