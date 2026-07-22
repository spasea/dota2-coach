import { createServer } from 'node:http';

import { describe, expect, it } from '@jest/globals';
import pino from 'pino';

import { ConfigurationError } from '../platform/config/configuration-error.js';
import { createRuntime, type CreateRuntimeDependencies } from './create-runtime.js';

const knownGsiToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const environment = {
  CLIENT_CONFIG_PATH: '/etc/dota2-coach/clients.yaml',
  CLIENT_CREDENTIALS_PATH: '/run/secrets/dota2-coach/client-credentials.yaml',
  COACH_LOCALE: 'ru',
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
readiness:
  low_health_percent: 25
  low_mana_percent: 20
scoring:
  action_bases:
    RESET: 0
    DEFEND: 0
    REGROUP: 0
    FARM_SAFELY: 20
  contributions:
    RESET:
      requester_low_health: 70
      requester_low_mana: 15
      requester_disabled: 45
    DEFEND:
      active_structure_damage: 40
      recent_structure_damage: 20
      repeated_structure_damage: 15
      critical_structure: 25
      requester_already_near_structure: 15
      requester_can_teleport: 10
      allied_defenders_already_present: 15
      requester_would_arrive_outnumbered: -55
      partial_evidence: -10
    REGROUP:
      requester_deep_and_isolated: 35
      enemies_missing: 15
      confirmed_allied_cluster: 30
      partial_evidence: -10
    FARM_SAFELY:
      requester_would_arrive_outnumbered: 35
      requester_deep_and_isolated: 25
      enemies_missing: 20
      enemies_visible_elsewhere: 25
confidence:
  medium_score_floor: 20
  high_score_floor: 65
  alternative_score_gap: 15
stability:
  hysteresis_ms: 30000
  previous_action_bonus: 5
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

  it('exposes the requester-scoped Lost recommendation use case without adding a route', async () => {
    const runtime = await createRuntime(environment, createDependencies());

    expect(runtime.recommendLostAction({ discordUserId: '123456789012345678' })).toEqual({
      status: 'unavailable',
      reason: 'snapshot_missing',
    });
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
