import { describe, expect, it } from '@jest/globals';

import {
  createResolveDiscordLostActionScope,
  projectDiscordLostActionScope,
} from './resolve-discord-lost-action-scope.js';

describe('Discord Lost action preflight', () => {
  it('projects only immutable requester and match scope from a ready context', () => {
    const scope = projectDiscordLostActionScope({
      matchId: 'match-01',
      requester: {
        identity: {
          clientId: 'client-01',
          discordUserId: '123456789012345678',
        },
      },
    });

    expect(scope).toEqual({
      matchId: 'match-01',
      clientId: 'client-01',
      discordUserId: '123456789012345678',
    });
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it('preserves Match unavailability without retaining a context', () => {
    const queries: string[] = [];
    const resolveScope = createResolveDiscordLostActionScope((query) => {
      queries.push(query.discordUserId);
      return Object.freeze({ status: 'snapshot_stale' });
    });

    expect(resolveScope('123456789012345678')).toEqual({ status: 'snapshot_stale' });
    expect(queries).toEqual(['123456789012345678']);
  });
});
