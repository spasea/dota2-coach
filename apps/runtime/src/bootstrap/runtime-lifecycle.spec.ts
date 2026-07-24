import { describe, expect, it } from '@jest/globals';

import {
  createRuntimeLifecycle,
  type CreateRuntimeLifecycleOptions,
  type DiscordGatewayState,
  type DiscordGatewayStateChangedEvent,
  type DiscordServingLifecycle,
  type SpeechServingLifecycle,
} from './runtime-lifecycle.js';

describe('HTTP and Discord runtime lifecycle', () => {
  it('preserves the HTTP-only lifecycle when Discord is disabled', async () => {
    const fixture = createLifecycleFixture({ discordEnabled: false });

    await fixture.lifecycle.start();
    await fixture.lifecycle.stop();

    expect(fixture.operations).toEqual(['http_start', 'runtime_started', 'http_stop', 'runtime_stopped']);
  });

  it('starts enabled Discord before exposing HTTP readiness', async () => {
    const fixture = createLifecycleFixture();

    await fixture.lifecycle.start();

    expect(fixture.operations).toEqual([
      'start_accepting_interactions',
      'discord_connect',
      'validate_panel',
      'http_start',
      'runtime_started',
    ]);
  });

  it('starts speech recovery after Discord text readiness without awaiting voice before HTTP bind', async () => {
    const fixture = createLifecycleFixture({ speechEnabled: true });

    await fixture.lifecycle.start();

    expect(fixture.operations).toEqual([
      'start_accepting_interactions',
      'discord_connect',
      'validate_panel',
      'speech_start_recovering',
      'http_start',
      'runtime_started',
    ]);
  });

  it.each([
    ['Discord connection', { connectError: new Error('raw token failure') }, 'discord_connect'],
    ['panel validation', { validationError: new Error('raw panel payload') }, 'discord_panel_validation'],
    ['HTTP binding', { httpStartError: new Error('raw bind details') }, 'http_bind'],
  ] as const)('maps %s failure to a bounded startup stage', async (_caseName, options, expectedStage) => {
    const fixture = createLifecycleFixture(options);

    const result = await fixture.lifecycle.start().catch((error: unknown) => error);

    expect(result).toMatchObject({ code: 'RUNTIME_STARTUP_ERROR', stage: expectedStage });
    expect(String(result)).not.toContain(Object.values(options)[0]?.message);
    expect(fixture.operations).not.toContain('runtime_started');
  });

  it('rolls back Discord and leaves HTTP unbound after panel validation failure', async () => {
    const fixture = createLifecycleFixture({ validationError: new Error('validation') });

    await expect(fixture.lifecycle.start()).rejects.toBeDefined();

    expect(fixture.operations).toEqual([
      'start_accepting_interactions',
      'discord_connect',
      'validate_panel',
      'stop_accepting_interactions',
      'discord_destroy',
    ]);
  });

  it('maps interaction-listener setup failure to Discord connect and rolls back', async () => {
    const fixture = createLifecycleFixture({ startAcceptingError: new Error('raw listener setup failure') });

    const result = await fixture.lifecycle.start().catch((error: unknown) => error);

    expect(result).toMatchObject({ code: 'RUNTIME_STARTUP_ERROR', stage: 'discord_connect' });
    expect(String(result)).not.toContain('raw listener setup failure');
    expect(fixture.operations).toEqual([
      'start_accepting_interactions',
      'stop_accepting_interactions',
      'discord_destroy',
    ]);
  });

  it('destroys Discord after HTTP bind failure', async () => {
    const fixture = createLifecycleFixture({ httpStartError: new Error('bind') });

    await expect(fixture.lifecycle.start()).rejects.toBeDefined();

    expect(fixture.operations).toEqual([
      'start_accepting_interactions',
      'discord_connect',
      'validate_panel',
      'http_start',
      'stop_accepting_interactions',
      'discord_destroy',
    ]);
  });

  it('rolls back speech before Discord after HTTP bind failure', async () => {
    const fixture = createLifecycleFixture({
      speechEnabled: true,
      httpStartError: new Error('bind'),
    });

    await expect(fixture.lifecycle.start()).rejects.toBeDefined();

    expect(fixture.operations).toEqual([
      'start_accepting_interactions',
      'discord_connect',
      'validate_panel',
      'speech_start_recovering',
      'http_start',
      'stop_accepting_interactions',
      'speech_stop',
      'speech_destroy',
      'discord_destroy',
    ]);
  });

  it('preserves the original safe startup failure when rollback cleanup also fails', async () => {
    const fixture = createLifecycleFixture({
      validationError: new Error('private validation details'),
      destroyError: new Error('private destroy details'),
    });

    const result = await fixture.lifecycle.start().catch((error: unknown) => error);

    expect(result).toMatchObject({ code: 'RUNTIME_STARTUP_ERROR', stage: 'discord_panel_validation' });
    expect(String(result)).not.toContain('private validation details');
    expect(String(result)).not.toContain('private destroy details');
    expect(fixture.operations.at(-1)).toBe('discord_destroy');
  });

  it('stops interaction intake before HTTP and Discord cleanup', async () => {
    const fixture = createLifecycleFixture();

    await fixture.lifecycle.start();
    fixture.operations.length = 0;
    await fixture.lifecycle.stop();

    expect(fixture.operations).toEqual([
      'stop_accepting_interactions',
      'http_stop',
      'discord_destroy',
      'runtime_stopped',
    ]);
  });

  it('stops admission and active speech before HTTP, then destroys voice before Discord', async () => {
    const fixture = createLifecycleFixture({ speechEnabled: true });

    await fixture.lifecycle.start();
    fixture.operations.length = 0;
    await fixture.lifecycle.stop();

    expect(fixture.operations).toEqual([
      'stop_accepting_interactions',
      'speech_stop',
      'http_stop',
      'speech_destroy',
      'discord_destroy',
      'runtime_stopped',
    ]);
  });

  it.each([
    ['interaction intake', { stopAcceptingError: new Error('stop intake') }],
    ['HTTP cleanup', { httpStopError: new Error('stop HTTP') }],
    ['Discord cleanup', { destroyError: new Error('stop Discord') }],
  ] as const)('attempts all shutdown cleanup after %s failure', async (_caseName, options) => {
    const fixture = createLifecycleFixture(options);

    await fixture.lifecycle.start();
    fixture.operations.length = 0;
    await expect(fixture.lifecycle.stop()).rejects.toBeDefined();

    expect(fixture.operations).toEqual(['stop_accepting_interactions', 'http_stop', 'discord_destroy']);
  });

  it('makes concurrent and repeated stop calls idempotent', async () => {
    const fixture = createLifecycleFixture();

    await fixture.lifecycle.start();
    fixture.operations.length = 0;
    await Promise.all([fixture.lifecycle.stop(), fixture.lifecycle.stop()]);
    await fixture.lifecycle.stop();

    expect(fixture.operations).toEqual([
      'stop_accepting_interactions',
      'http_stop',
      'discord_destroy',
      'runtime_stopped',
    ]);
  });

  it('does not introduce an in-flight interaction drain dependency', async () => {
    const fixture = createLifecycleFixture();

    await fixture.lifecycle.start();

    await expect(fixture.lifecycle.stop()).resolves.toBeUndefined();
  });

  it('records only the approved safe Gateway lifecycle states', async () => {
    const fixture = createLifecycleFixture();

    await fixture.lifecycle.start();
    fixture.emitGatewayState('disconnected');
    fixture.emitGatewayState('reconnecting');
    fixture.emitGatewayState('resumed');

    expect(fixture.gatewayEvents).toEqual([
      { code: 'DISCORD_GATEWAY_STATE_CHANGED', state: 'disconnected' },
      { code: 'DISCORD_GATEWAY_STATE_CHANGED', state: 'reconnecting' },
      { code: 'DISCORD_GATEWAY_STATE_CHANGED', state: 'resumed' },
    ]);
  });

  it('does not stop HTTP, reconnect, or register another listener after disconnect', async () => {
    const fixture = createLifecycleFixture();

    await fixture.lifecycle.start();
    fixture.operations.length = 0;
    fixture.emitGatewayState('disconnected');

    expect(fixture.operations).toEqual(['gateway_state:disconnected']);
  });

  it('contains failures from the Gateway lifecycle log sink', async () => {
    const fixture = createLifecycleFixture({ gatewayRecordError: new Error('raw log sink failure') });

    await fixture.lifecycle.start();

    expect(() => fixture.emitGatewayState('disconnected')).not.toThrow();
  });
});

type LifecycleFixtureOptions = Readonly<{
  discordEnabled?: boolean;
  speechEnabled?: boolean;
  connectError?: Error;
  startAcceptingError?: Error;
  validationError?: Error;
  httpStartError?: Error;
  stopAcceptingError?: Error;
  httpStopError?: Error;
  destroyError?: Error;
  gatewayRecordError?: Error;
}>;

function createLifecycleFixture(options: LifecycleFixtureOptions = {}) {
  const operations: string[] = [];
  const gatewayEvents: DiscordGatewayStateChangedEvent[] = [];
  let gatewayObserver: ((state: DiscordGatewayState) => void) | null = null;
  const discord: DiscordServingLifecycle = Object.freeze({
    startAcceptingInteractions: () => {
      operations.push('start_accepting_interactions');

      if (options.startAcceptingError !== undefined) {
        throw options.startAcceptingError;
      }
    },
    connect: () => {
      operations.push('discord_connect');
      return options.connectError === undefined ? Promise.resolve() : Promise.reject(options.connectError);
    },
    validatePanel: () => {
      operations.push('validate_panel');
      return options.validationError === undefined ? Promise.resolve() : Promise.reject(options.validationError);
    },
    observeGatewayState: (observer) => {
      gatewayObserver = observer;
      return () => {
        gatewayObserver = null;
      };
    },
    stopAcceptingInteractions: () => {
      operations.push('stop_accepting_interactions');

      if (options.stopAcceptingError !== undefined) {
        throw options.stopAcceptingError;
      }
    },
    destroy: () => {
      operations.push('discord_destroy');
      return options.destroyError === undefined ? Promise.resolve() : Promise.reject(options.destroyError);
    },
  });
  const speech: SpeechServingLifecycle = Object.freeze({
    startRecovering: () => {
      operations.push('speech_start_recovering');
    },
    stop: () => {
      operations.push('speech_stop');
      return Promise.resolve();
    },
    destroy: () => {
      operations.push('speech_destroy');
      return Promise.resolve();
    },
  });
  const lifecycleOptions: CreateRuntimeLifecycleOptions = Object.freeze({
    http: Object.freeze({
      start: () => {
        operations.push('http_start');
        return options.httpStartError === undefined
          ? Promise.resolve(Object.freeze({ host: '127.0.0.1', port: 3000 }))
          : Promise.reject(options.httpStartError);
      },
      stop: () => {
        operations.push('http_stop');
        return options.httpStopError === undefined ? Promise.resolve() : Promise.reject(options.httpStopError);
      },
    }),
    discord: options.discordEnabled === false ? null : discord,
    speech: options.speechEnabled === true ? speech : null,
    recordGatewayStateChanged: (event) => {
      operations.push(`gateway_state:${event.state}`);

      if (options.gatewayRecordError !== undefined) {
        throw options.gatewayRecordError;
      }

      gatewayEvents.push(event);
    },
    recordRuntimeStarted: () => {
      operations.push('runtime_started');
    },
    recordRuntimeStopped: () => {
      operations.push('runtime_stopped');
    },
  });
  const lifecycle = createRuntimeLifecycle(lifecycleOptions);

  return {
    emitGatewayState: (state: DiscordGatewayState) => {
      if (gatewayObserver === null) {
        throw new Error('Gateway observer is not registered.');
      }

      gatewayObserver(state);
    },
    gatewayEvents,
    lifecycle,
    operations,
  };
}
