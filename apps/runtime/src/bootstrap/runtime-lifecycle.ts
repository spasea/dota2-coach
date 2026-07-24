import type { DiscordGatewayState } from '../integrations/discord/discord.types.js';
import type { RuntimeAddress } from './create-runtime.js';

export type { DiscordGatewayState } from '../integrations/discord/discord.types.js';

export type RuntimeStartupStage = 'discord_connect' | 'discord_panel_validation' | 'http_bind';

export class RuntimeStartupError extends Error {
  readonly code = 'RUNTIME_STARTUP_ERROR';
  readonly stage: RuntimeStartupStage;

  constructor(stage: RuntimeStartupStage) {
    super(`Runtime startup failed at ${stage}.`);
    this.name = 'RuntimeStartupError';
    this.stage = stage;
  }
}

export type DiscordGatewayStateChangedEvent = Readonly<{
  code: 'DISCORD_GATEWAY_STATE_CHANGED';
  state: DiscordGatewayState;
}>;

export type HttpRuntimeLifecycle = Readonly<{
  start: () => Promise<RuntimeAddress>;
  stop: () => Promise<void>;
}>;

export type DiscordServingLifecycle = Readonly<{
  startAcceptingInteractions: () => void;
  connect: () => Promise<void>;
  validatePanel: () => Promise<void>;
  observeGatewayState: (observer: (state: DiscordGatewayState) => void) => () => void;
  stopAcceptingInteractions: () => void;
  destroy: () => Promise<void>;
}>;

export type SpeechServingLifecycle = Readonly<{
  startRecovering: () => void;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
}>;

export type RuntimeLifecycle = Readonly<{
  start: () => Promise<RuntimeAddress>;
  stop: () => Promise<void>;
}>;

export type CreateRuntimeLifecycleOptions = Readonly<{
  http: HttpRuntimeLifecycle;
  discord: DiscordServingLifecycle | null;
  speech: SpeechServingLifecycle | null;
  recordGatewayStateChanged: (event: DiscordGatewayStateChangedEvent) => void;
  recordRuntimeStarted: (address: RuntimeAddress) => void;
  recordRuntimeStopped: () => void;
}>;

export function createRuntimeLifecycle(options: CreateRuntimeLifecycleOptions): RuntimeLifecycle {
  let startPromise: Promise<RuntimeAddress> | null = null;
  let stopPromise: Promise<void> | null = null;
  let removeGatewayObserver: (() => void) | null = null;

  return Object.freeze({
    start: () => {
      startPromise ??= startRuntime(options, (removeObserver) => {
        removeGatewayObserver = removeObserver;
      });
      return startPromise;
    },
    stop: () => {
      stopPromise ??= stopRuntime(options, removeGatewayObserver);
      return stopPromise;
    },
  });
}

async function startRuntime(
  options: CreateRuntimeLifecycleOptions,
  retainGatewayObserver: (removeObserver: () => void) => void
): Promise<RuntimeAddress> {
  if (options.discord === null) {
    const address = await startHttp(options.http);
    safelyRecordLifecycleEvent(() => options.recordRuntimeStarted(address));
    return address;
  }

  let removeObserver: () => void = () => undefined;

  try {
    removeObserver = options.discord.observeGatewayState((state) => {
      try {
        options.recordGatewayStateChanged(Object.freeze({ code: 'DISCORD_GATEWAY_STATE_CHANGED', state }));
      } catch {
        return;
      }
    });
    retainGatewayObserver(removeObserver);
    options.discord.startAcceptingInteractions();
    await options.discord.connect();
  } catch {
    await rollbackDiscord(options.discord, removeObserver);
    throw new RuntimeStartupError('discord_connect');
  }

  try {
    await options.discord.validatePanel();
  } catch {
    await rollbackDiscord(options.discord, removeObserver);
    throw new RuntimeStartupError('discord_panel_validation');
  }

  let address: RuntimeAddress;

  try {
    address = await options.http.start();
  } catch {
    await rollbackDiscord(options.discord, removeObserver);
    throw new RuntimeStartupError('http_bind');
  }

  safelyRecordLifecycleEvent(() => options.recordRuntimeStarted(address));
  return address;
}

async function startHttp(http: HttpRuntimeLifecycle): Promise<RuntimeAddress> {
  try {
    return await http.start();
  } catch {
    throw new RuntimeStartupError('http_bind');
  }
}

async function rollbackDiscord(discord: DiscordServingLifecycle, removeGatewayObserver: () => void): Promise<void> {
  try {
    discord.stopAcceptingInteractions();
  } catch {
    // Startup retains its original safe failure even when rollback is partial.
  }

  try {
    removeGatewayObserver();
  } catch {
    // Gateway observation is best-effort during rollback.
  }

  try {
    await discord.destroy();
  } catch {
    // Startup retains its original safe failure even when rollback is partial.
  }
}

async function stopRuntime(
  options: CreateRuntimeLifecycleOptions,
  removeGatewayObserver: (() => void) | null
): Promise<void> {
  let firstFailure: Error | undefined;

  if (options.discord !== null) {
    try {
      options.discord.stopAcceptingInteractions();
    } catch (error) {
      firstFailure = toShutdownError(error);
    }
  }

  try {
    await options.http.stop();
  } catch (error) {
    firstFailure ??= toShutdownError(error);
  }

  if (options.discord !== null) {
    try {
      removeGatewayObserver?.();
    } catch (error) {
      firstFailure ??= toShutdownError(error);
    }

    try {
      await options.discord.destroy();
    } catch (error) {
      firstFailure ??= toShutdownError(error);
    }
  }

  if (firstFailure !== undefined) {
    throw firstFailure;
  }

  safelyRecordLifecycleEvent(options.recordRuntimeStopped);
}

function toShutdownError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Runtime shutdown failed.');
}

function safelyRecordLifecycleEvent(record: () => void): void {
  try {
    record();
  } catch {
    return;
  }
}
