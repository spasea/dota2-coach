import type { RuntimeAddress } from './create-runtime.js';

export const RUNTIME_LIFECYCLE_NOT_IMPLEMENTED = 'Discord runtime lifecycle is not implemented.';

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

export class RuntimeLifecycleNotImplementedError extends Error {
  readonly code = 'RUNTIME_LIFECYCLE_NOT_IMPLEMENTED';

  constructor() {
    super(RUNTIME_LIFECYCLE_NOT_IMPLEMENTED);
    this.name = 'RuntimeLifecycleNotImplementedError';
  }
}

export type DiscordGatewayState = 'disconnected' | 'reconnecting' | 'resumed';

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

export type RuntimeLifecycle = Readonly<{
  start: () => Promise<RuntimeAddress>;
  stop: () => Promise<void>;
}>;

export type CreateRuntimeLifecycleOptions = Readonly<{
  http: HttpRuntimeLifecycle;
  discord: DiscordServingLifecycle | null;
  recordGatewayStateChanged: (event: DiscordGatewayStateChangedEvent) => void;
  recordRuntimeStarted: (address: RuntimeAddress) => void;
}>;

export function createRuntimeLifecycle(options: CreateRuntimeLifecycleOptions): RuntimeLifecycle {
  void options;

  return Object.freeze({
    start: () => Promise.reject(new RuntimeLifecycleNotImplementedError()),
    stop: () => Promise.reject(new RuntimeLifecycleNotImplementedError()),
  });
}
