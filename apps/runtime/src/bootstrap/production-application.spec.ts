import { describe, expect, it } from '@jest/globals';

import { DiscordPanelProvisionError } from '../integrations/discord/panel/discord-panel-lifecycle.js';
import { ConfigurationError } from '../platform/config/configuration-error.js';
import { mapRuntimeProcessFailure } from './production-application.js';
import { RuntimeStartupError } from './runtime-lifecycle.js';

describe('production process failure mapping', () => {
  it.each([
    [
      new ConfigurationError({ source: 'discord_credentials', stage: 'validation' }),
      { code: 'RUNTIME_CONFIGURATION_ERROR', source: 'discord_credentials', stage: 'validation' },
    ],
    [new DiscordPanelProvisionError('pin'), { code: 'DISCORD_PANEL_PROVISION_ERROR', stage: 'pin' }],
    [new RuntimeStartupError('discord_connect'), { code: 'RUNTIME_STARTUP_ERROR', stage: 'discord_connect' }],
  ] as const)('preserves a bounded known failure', (error, expected) => {
    expect(mapRuntimeProcessFailure(error)).toEqual(expected);
  });

  it('maps an unexpected failure without exposing its message', () => {
    const failure = mapRuntimeProcessFailure(new Error('token=private raw payload user=567890123456789012'));

    expect(failure).toEqual({ code: 'RUNTIME_STARTUP_ERROR', stage: 'http_bind' });
    expect(JSON.stringify(failure)).not.toContain('private');
    expect(JSON.stringify(failure)).not.toContain('567890123456789012');
  });
});
