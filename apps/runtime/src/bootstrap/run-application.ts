import type {
  DiscordPanelProvisionStage,
  ProvisionDiscordPanelResult,
} from '../integrations/discord/panel/discord-panel-lifecycle.js';
import type { DiscordConfiguration } from '../platform/config/config.types.js';
import type { ConfigurationSource, ConfigurationStage } from '../platform/config/configuration-error.js';
import type { Runtime } from './create-runtime.js';
import { RuntimeLifecycleNotImplementedError, type RuntimeStartupStage } from './runtime-lifecycle.js';

export type RuntimeProcessMode = Readonly<{ kind: 'serve' }> | Readonly<{ kind: 'provision_discord_panel' }>;

export type ServingRuntime = Readonly<Pick<Runtime, 'start' | 'stop'>>;

export type RunApplicationResult =
  Readonly<{ kind: 'provisioned' }> | Readonly<{ kind: 'serving'; runtime: ServingRuntime }>;

export type RunApplicationDependencies = Readonly<{
  resolveProcessMode: (environment: Readonly<Record<string, string | undefined>>) => RuntimeProcessMode;
  loadDiscordConfiguration: (
    environment: Readonly<Record<string, string | undefined>>
  ) => Promise<DiscordConfiguration>;
  provisionDiscordPanel: (
    configuration: Extract<DiscordConfiguration, Readonly<{ enabled: true }>>
  ) => Promise<ProvisionDiscordPanelResult>;
  createServingRuntime: (
    environment: Readonly<Record<string, string | undefined>>,
    configuration: DiscordConfiguration
  ) => Promise<ServingRuntime>;
  recordPanelCreated: (result: ProvisionDiscordPanelResult) => void;
}>;

export type RuntimeProcessFailure =
  | Readonly<{
      code: 'RUNTIME_CONFIGURATION_ERROR';
      source: ConfigurationSource;
      stage: ConfigurationStage;
    }>
  | Readonly<{
      code: 'DISCORD_PANEL_PROVISION_ERROR';
      stage: DiscordPanelProvisionStage;
    }>
  | Readonly<{
      code: 'RUNTIME_STARTUP_ERROR';
      stage: RuntimeStartupStage;
    }>;

export type RunApplicationProcessDependencies = Readonly<{
  execute: () => Promise<RunApplicationResult>;
  registerShutdownSignals: (stop: () => Promise<void>) => void;
  mapFailure: (error: unknown) => RuntimeProcessFailure;
  recordFailure: (failure: RuntimeProcessFailure) => void;
  setExitCode: (exitCode: 1) => void;
}>;

export function runApplication(
  environment: Readonly<Record<string, string | undefined>>,
  dependencies: RunApplicationDependencies
): Promise<RunApplicationResult> {
  void environment;
  void dependencies;
  return Promise.reject(new RuntimeLifecycleNotImplementedError());
}

export function runApplicationProcess(dependencies: RunApplicationProcessDependencies): Promise<void> {
  void dependencies;
  return Promise.reject(new RuntimeLifecycleNotImplementedError());
}
