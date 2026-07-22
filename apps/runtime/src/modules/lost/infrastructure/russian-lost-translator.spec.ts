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
    ['radiant:tower:2:bot', 'Защищай нижнюю T2'],
    ['dire:tower:3:top', 'Защищай верхнюю T3'],
    ['radiant:tower:4', 'Защищай T4'],
    ['radiant:barracks:melee:top', 'Защищай верхние казармы'],
    ['dire:barracks:range:mid', 'Защищай центральные казармы'],
    ['radiant:ancient', 'Защищай трон'],
  ])('renders %s with familiar Dota structure notation', (structureId, expected) => {
    expect(translate(lostMessage('lost.action.defend_target', { structureId }))).toBe(expected);
  });

  it('renders the selected REGROUP heroes without exposing canonical GSI prefixes', () => {
    expect(
      translate(
        lostMessage('lost.action.regroup_target', {
          heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_crystal_maiden'],
        })
      )
    ).toBe('Сблизься с группой: Axe, Crystal Maiden');
  });

  it('addresses the complete voice recommendation to an individual player', () => {
    expect(
      translate(
        lostMessage('lost.layout.voice_addressed_to_individual', {
          displayName: 'Lich',
          voice: 'Защищай нижнюю T2: постройка получает урон сейчас.',
        })
      )
    ).toBe('Lich, Защищай нижнюю T2: постройка получает урон сейчас.');
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
