import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const knownGsiToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
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
    coach_alias: Smoke Test Player
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
`;

function waitForLog(child, lines, message, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for log message: ${message}`));
    }, timeoutMs);
    const handleLine = (line) => {
      try {
        const entry = JSON.parse(line);

        if (entry.msg === message) {
          cleanup();
          resolve(entry);
        }
      } catch {
        // Non-JSON process output cannot satisfy a structured log expectation.
      }
    };
    const handleExit = (code, signal) => {
      cleanup();
      reject(new Error(`Runtime exited before ${message}: code=${String(code)} signal=${String(signal)}`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      lines.off('line', handleLine);
      child.off('exit', handleExit);
    };

    lines.on('line', handleLine);
    child.once('exit', handleExit);
  });
}

async function waitForExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null) {
    return [child.exitCode, child.signalCode];
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.off('exit', handleExit);
      reject(new Error('Timed out waiting for runtime exit.'));
    }, timeoutMs);
    const handleExit = (code, signal) => {
      clearTimeout(timeout);
      resolve([code, signal]);
    };

    child.once('exit', handleExit);
  });
}

function spawnRuntime(environment) {
  return spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'dota2-coach-smoke-'));
const clientConfigPath = join(temporaryDirectory, 'clients.yaml');
const clientCredentialsPath = join(temporaryDirectory, 'client-credentials.yaml');
const lostPolicyPath = join(temporaryDirectory, 'lost-policy.yaml');
let runtimeProcess;
let invalidRuntimeProcess;

try {
  await Promise.all([
    writeFile(clientConfigPath, clientsYaml, 'utf8'),
    writeFile(clientCredentialsPath, credentialsYaml, 'utf8'),
    writeFile(lostPolicyPath, lostPolicyYaml, 'utf8'),
  ]);

  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const portProbeAddress = portProbe.address();

  assert.ok(typeof portProbeAddress === 'object' && portProbeAddress !== null);
  const runtimePort = portProbeAddress.port;

  portProbe.close();
  await once(portProbe, 'close');

  runtimeProcess = spawnRuntime({
    ...process.env,
    CLIENT_CONFIG_PATH: clientConfigPath,
    CLIENT_CREDENTIALS_PATH: clientCredentialsPath,
    COACH_LOCALE: 'ru',
    LOST_POLICY_PATH: lostPolicyPath,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'info',
    PORT: String(runtimePort),
  });
  const outputLines = [];
  const lines = createInterface({ input: runtimeProcess.stdout });
  lines.on('line', (line) => outputLines.push(line));
  const startedEntry = await waitForLog(runtimeProcess, lines, 'runtime started');
  const baseUrl = `http://127.0.0.1:${String(startedEntry.port)}`;

  const healthResponse = await fetch(`${baseUrl}/health`);
  const gsiResponse = await fetch(`${baseUrl}/gsi`, {
    body: JSON.stringify({
      auth: { token: knownGsiToken },
      provider: { timestamp: 1_753_002_000 },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { status: 'ok' });
  assert.equal(gsiResponse.status, 200);
  assert.equal(await gsiResponse.text(), '');

  runtimeProcess.kill('SIGTERM');
  const [exitCode, signal] = await waitForExit(runtimeProcess);

  assert.equal(exitCode, 0);
  assert.equal(signal, null);
  assert.ok(outputLines.some((line) => line.includes('runtime stopped')));

  invalidRuntimeProcess = spawnRuntime({
    ...process.env,
    CLIENT_CONFIG_PATH: '',
    CLIENT_CREDENTIALS_PATH: '',
  });
  const [invalidExitCode] = await waitForExit(invalidRuntimeProcess);

  assert.equal(invalidExitCode, 1);
} finally {
  if (runtimeProcess?.exitCode === null) {
    runtimeProcess.kill('SIGKILL');
  }

  if (invalidRuntimeProcess?.exitCode === null) {
    invalidRuntimeProcess.kill('SIGKILL');
  }

  await rm(temporaryDirectory, { force: true, recursive: true });
}
