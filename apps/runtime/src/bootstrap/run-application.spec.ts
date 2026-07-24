import { describe, expect, it } from '@jest/globals';

import {
  runApplication,
  runApplicationProcess,
  type RunApplicationDependencies,
  type RunApplicationProcessDependencies,
  type RuntimeProcessFailure,
  type RuntimeProcessMode,
} from './run-application.js';

const environment = Object.freeze({
  DISCORD_CONFIG_PATH: '/etc/dota2-coach/discord.yaml',
  DISCORD_CREATE_PANEL: 'false',
});
const panelResult = Object.freeze({
  guildId: '123456789012345678',
  channelId: '234567890123456789',
  controlMessageId: '345678901234567890',
});
const provisioningDiscordConfiguration = Object.freeze({
  schemaVersion: 1 as const,
  enabled: true as const,
  guildId: panelResult.guildId,
  textChannelId: panelResult.channelId,
  controlMessageId: null,
  actionDebounceMs: 5_000,
  botToken: 'private-test-token',
});
const servingDiscordConfiguration = Object.freeze({
  ...provisioningDiscordConfiguration,
  controlMessageId: panelResult.controlMessageId,
});
const disabledSpeechConfiguration = Object.freeze({
  schemaVersion: 1 as const,
  enabled: false as const,
});

describe('application process orchestration', () => {
  it('runs one-shot provisioning without constructing or starting the serving runtime', async () => {
    const fixture = createApplicationFixture({ kind: 'provision_discord_panel' });

    const result = await runApplication(environment, fixture.dependencies);

    expect(result).toEqual({ kind: 'provisioned' });
    expect(fixture.operations).toEqual([
      'resolve_mode',
      'load_discord_configuration',
      'provision_panel',
      'record_panel_created',
    ]);
  });

  it('starts serving without invoking the one-shot provisioner', async () => {
    const fixture = createApplicationFixture({ kind: 'serve' });

    const result = await runApplication(environment, fixture.dependencies);

    expect(result).toEqual({ kind: 'serving', runtime: fixture.runtime });
    expect(fixture.operations).toEqual([
      'resolve_mode',
      'load_discord_configuration',
      'load_speech_configuration',
      'create_serving_runtime',
      'start_serving_runtime',
    ]);
  });

  it('does not construct serving resources after provisioning failure', async () => {
    const provisionError = new Error('raw provisioning failure');
    const fixture = createApplicationFixture({ kind: 'provision_discord_panel' }, { provisionError });

    await expect(runApplication(environment, fixture.dependencies)).rejects.toBe(provisionError);

    expect(fixture.operations).toEqual(['resolve_mode', 'load_discord_configuration', 'provision_panel']);
  });

  it('returns from successful provisioning without registering long-lived signals', async () => {
    const fixture = createProcessFixture({ kind: 'provisioned' });

    await expect(runApplicationProcess(fixture.dependencies)).resolves.toBeUndefined();

    expect(fixture.operations).toEqual(['execute']);
  });

  it('registers shutdown signals only after the serving runtime has started', async () => {
    const application = createApplicationFixture({ kind: 'serve' });
    const fixture = createProcessFixture({ kind: 'serving', runtime: application.runtime });

    await runApplicationProcess(fixture.dependencies);

    expect(fixture.operations).toEqual(['execute', 'register_signals']);
  });

  it('maps a provisioning failure to a safe record and process exit code 1', async () => {
    const rawFailure = new Error('token=private raw Discord response');
    const failure = Object.freeze({
      code: 'DISCORD_PANEL_PROVISION_ERROR' as const,
      stage: 'connect',
    });
    const fixture = createProcessFixture(undefined, { failure, rawFailure });

    await expect(runApplicationProcess(fixture.dependencies)).resolves.toBeUndefined();

    expect(fixture.operations).toEqual(['execute', 'map_failure', 'record_failure', 'set_exit_code:1']);
    expect(fixture.recordedFailures).toEqual([failure]);
    expect(JSON.stringify(fixture.recordedFailures)).not.toContain(rawFailure.message);
  });
});

type ApplicationFixtureOptions = Readonly<{
  provisionError?: Error;
}>;

function createApplicationFixture(mode: RuntimeProcessMode, options: ApplicationFixtureOptions = {}) {
  const operations: string[] = [];
  const runtime = Object.freeze({
    start: () => {
      operations.push('start_serving_runtime');
      return Promise.resolve(Object.freeze({ host: '127.0.0.1', port: 3000 }));
    },
    stop: () => Promise.resolve(),
  });
  const dependencies: RunApplicationDependencies = Object.freeze({
    resolveProcessMode: () => {
      operations.push('resolve_mode');
      return mode;
    },
    loadDiscordConfiguration: () => {
      operations.push('load_discord_configuration');
      return Promise.resolve(
        mode.kind === 'provision_discord_panel' ? provisioningDiscordConfiguration : servingDiscordConfiguration
      );
    },
    loadSpeechConfiguration: () => {
      operations.push('load_speech_configuration');
      return Promise.resolve(disabledSpeechConfiguration);
    },
    provisionDiscordPanel: () => {
      operations.push('provision_panel');
      return options.provisionError === undefined
        ? Promise.resolve(panelResult)
        : Promise.reject(options.provisionError);
    },
    createServingRuntime: () => {
      operations.push('create_serving_runtime');
      return Promise.resolve(runtime);
    },
    recordPanelCreated: () => {
      operations.push('record_panel_created');
    },
  });

  return { dependencies, operations, runtime };
}

type ProcessFixtureOptions = Readonly<{
  failure?: RuntimeProcessFailure;
  rawFailure?: Error;
}>;

function createProcessFixture(
  result: Awaited<ReturnType<RunApplicationProcessDependencies['execute']>> | undefined,
  options: ProcessFixtureOptions = {}
) {
  const operations: string[] = [];
  const recordedFailures: RuntimeProcessFailure[] = [];
  const dependencies: RunApplicationProcessDependencies = Object.freeze({
    execute: () => {
      operations.push('execute');
      return options.rawFailure === undefined ? Promise.resolve(result!) : Promise.reject(options.rawFailure);
    },
    registerShutdownSignals: () => {
      operations.push('register_signals');
    },
    mapFailure: () => {
      operations.push('map_failure');

      if (options.failure === undefined) {
        throw new Error('Test fixture requires a mapped failure.');
      }

      return options.failure;
    },
    recordFailure: (failure) => {
      operations.push('record_failure');
      recordedFailures.push(failure);
    },
    setExitCode: (exitCode) => {
      operations.push(`set_exit_code:${exitCode}`);
    },
  });

  return { dependencies, operations, recordedFailures };
}
