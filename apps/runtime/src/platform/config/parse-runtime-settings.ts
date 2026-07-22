import { z } from 'zod';

import { SUPPORTED_COACH_LOCALES, type CoachLocale } from '../i18n/locale.js';
import { ConfigurationError } from './configuration-error.js';

const runtimeSettingsSchema = z.object({
  CLIENT_CONFIG_PATH: z.string().trim().min(1),
  CLIENT_CREDENTIALS_PATH: z.string().trim().min(1),
  COACH_LOCALE: z.enum(SUPPORTED_COACH_LOCALES),
  LOST_POLICY_PATH: z.string().trim().min(1),
  GSI_FRESHNESS_MS: z.coerce.number().int().positive().default(5000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  LOST_CONSOLE_DEBUG_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type RuntimeLogLevel = z.infer<typeof runtimeSettingsSchema>['LOG_LEVEL'];

export type RuntimeSettings = Readonly<{
  clientConfigPath: string;
  clientCredentialsPath: string;
  coachLocale: CoachLocale;
  lostPolicyPath: string;
  gsiFreshnessMs: number;
  host: string;
  lostConsoleDebugEnabled: boolean;
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
    coachLocale: result.data.COACH_LOCALE,
    lostPolicyPath: result.data.LOST_POLICY_PATH,
    gsiFreshnessMs: result.data.GSI_FRESHNESS_MS,
    host: result.data.HOST,
    lostConsoleDebugEnabled: result.data.LOST_CONSOLE_DEBUG_ENABLED,
    logLevel: result.data.LOG_LEVEL,
    port: result.data.PORT,
  });
}
