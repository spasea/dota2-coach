import { describe, expect, it } from '@jest/globals';

import { ConfigurationError } from './configuration-error.js';
import { parseApplicationSettings, parseRuntimeSettings } from './parse-runtime-settings.js';

const requiredEnvironment = {
  CLIENT_CONFIG_PATH: '/etc/dota2-coach/clients.yaml',
  CLIENT_CREDENTIALS_PATH: '/run/secrets/dota2-coach/client-credentials.yaml',
  COACH_LOCALE: 'ru',
  LOST_POLICY_PATH: '/etc/dota2-coach/lost-policy.yaml',
};

describe('runtime process settings', () => {
  it('loads provisioning-safe common settings without client or Lost configuration', () => {
    const settings = parseApplicationSettings({ COACH_LOCALE: 'ru', LOG_LEVEL: 'warn' });

    expect(settings).toEqual({ coachLocale: 'ru', logLevel: 'warn' });
    expect(Object.isFrozen(settings)).toBe(true);
  });

  it('applies the approved network and logging defaults', () => {
    const settings = parseRuntimeSettings(requiredEnvironment);

    expect(settings).toEqual({
      clientConfigPath: requiredEnvironment.CLIENT_CONFIG_PATH,
      clientCredentialsPath: requiredEnvironment.CLIENT_CREDENTIALS_PATH,
      coachLocale: 'ru',
      lostPolicyPath: requiredEnvironment.LOST_POLICY_PATH,
      gsiFreshnessMs: 5000,
      host: '0.0.0.0',
      lostConsoleDebugEnabled: false,
      logLevel: 'info',
      port: 3000,
    });
    expect(Object.isFrozen(settings)).toBe(true);
  });

  it('accepts explicit process settings', () => {
    const settings = parseRuntimeSettings({
      ...requiredEnvironment,
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      LOST_CONSOLE_DEBUG_ENABLED: 'true',
      PORT: '3100',
      GSI_FRESHNESS_MS: '7000',
    });

    expect(settings).toMatchObject({
      gsiFreshnessMs: 7000,
      host: '127.0.0.1',
      lostConsoleDebugEnabled: true,
      logLevel: 'debug',
      port: 3100,
    });
  });

  it.each([
    ['missing public config path', { CLIENT_CREDENTIALS_PATH: requiredEnvironment.CLIENT_CREDENTIALS_PATH }],
    ['blank private config path', { ...requiredEnvironment, CLIENT_CREDENTIALS_PATH: ' ' }],
    ['missing coach locale', { ...requiredEnvironment, COACH_LOCALE: undefined }],
    ['unsupported coach locale', { ...requiredEnvironment, COACH_LOCALE: 'en' }],
    ['regional locale alias', { ...requiredEnvironment, COACH_LOCALE: 'ru-RU' }],
    ['missing Lost policy path', { ...requiredEnvironment, LOST_POLICY_PATH: undefined }],
    ['invalid port', { ...requiredEnvironment, PORT: 'not-a-port' }],
    ['zero port', { ...requiredEnvironment, PORT: '0' }],
    ['out-of-range port', { ...requiredEnvironment, PORT: '65536' }],
    ['invalid log level', { ...requiredEnvironment, LOG_LEVEL: 'verbose' }],
    ['invalid Lost console debug flag', { ...requiredEnvironment, LOST_CONSOLE_DEBUG_ENABLED: 'yes' }],
    ['invalid freshness', { ...requiredEnvironment, GSI_FRESHNESS_MS: 'not-a-number' }],
    ['zero freshness', { ...requiredEnvironment, GSI_FRESHNESS_MS: '0' }],
    ['fractional freshness', { ...requiredEnvironment, GSI_FRESHNESS_MS: '1000.5' }],
  ])('fails safely for %s', (_caseName, environment) => {
    const result = (() => {
      try {
        return parseRuntimeSettings(environment);
      } catch (error: unknown) {
        return error;
      }
    })();

    expect(result).toBeInstanceOf(ConfigurationError);
    expect(result).toMatchObject({ source: 'process', stage: 'validation' });
    expect(String(result)).not.toContain(JSON.stringify(environment));
  });
});
