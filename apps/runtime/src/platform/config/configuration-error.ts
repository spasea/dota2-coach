export type ConfigurationSource = 'process' | 'clients' | 'credentials' | 'combined';
export type ConfigurationStage = 'source' | 'syntax' | 'validation';

type ConfigurationErrorContext = Readonly<{
  source: ConfigurationSource;
  stage: ConfigurationStage;
}>;

export class ConfigurationError extends Error {
  readonly code = 'RUNTIME_CONFIGURATION_ERROR';
  readonly source: ConfigurationSource;
  readonly stage: ConfigurationStage;

  constructor(context: ConfigurationErrorContext) {
    super(`Runtime configuration ${context.source} ${context.stage} failed.`);
    this.name = 'ConfigurationError';
    this.source = context.source;
    this.stage = context.stage;
  }
}
