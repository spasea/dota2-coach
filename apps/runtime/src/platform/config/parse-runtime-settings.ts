import { z } from 'zod';

import { ConfigurationError } from './configuration-error.js';

const runtimeSettingsSchema = z.object({
  CLIENT_CONFIG_PATH: z.string().trim().min(1),
  CLIENT_CREDENTIALS_PATH: z.string().trim().min(1),
  LOST_POLICY_PATH: z.string().trim().min(1),
  GSI_FRESHNESS_MS: z.coerce.number().int().positive().default(5000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type RuntimeLogLevel = z.infer<typeof runtimeSettingsSchema>['LOG_LEVEL'];

export type RuntimeSettings = Readonly<{
  clientConfigPath: string;
  clientCredentialsPath: string;
  lostPolicyPath: string;
  gsiFreshnessMs: number;
  host: string;
  logLevel: RuntimeLogLevel;
  port: number;
}>;

export function parseRuntimeSettings(environment: Readonly<Record<string, string | undefined>>): RuntimeSettings {
  const result = runtimeSettingsSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigurationError({ source: 'process', stage: 'validation' });
  }

  return Object.freeze({
    clientConfigPath: result.data.CLIENT_CONFIG_PATH,
    clientCredentialsPath: result.data.CLIENT_CREDENTIALS_PATH,
    lostPolicyPath: result.data.LOST_POLICY_PATH,
    gsiFreshnessMs: result.data.GSI_FRESHNESS_MS,
    host: result.data.HOST,
    logLevel: result.data.LOG_LEVEL,
    port: result.data.PORT,
  });
}
