import { describe, expect, it } from '@jest/globals';

import { lostMessage } from '../application/lost-translator.js';
import { createLostTranslator } from './create-lost-translator.js';

describe('Russian Lost translator', () => {
  const translate = createLostTranslator('ru');

  it.each([
    lostMessage('lost.action.reset', undefined),
    lostMessage('lost.hold.insufficient_evidence', undefined),
    lostMessage('lost.layout.best_action', { action: 'RESET' }),
  ])('translates $key to non-empty copy', (message) => {
    expect(translate(message).trim()).not.toHaveLength(0);
  });

  it.each([
    'lost.reason.requester_would_arrive_outnumbered',
    'lost.reason.enemies_missing',
    'lost.reason.enemies_visible_elsewhere',
  ] as const)('applies Russian enemy plural rules for %s', (key) => {
    const translations = [1, 2, 5].map((enemyCount) => translate(lostMessage(key, { enemyCount })));

    expect(new Set(translations).size).toBe(3);
    expect(translations).toEqual([
      expect.stringContaining('1'),
      expect.stringContaining('2'),
      expect.stringContaining('5'),
    ]);
  });
});
