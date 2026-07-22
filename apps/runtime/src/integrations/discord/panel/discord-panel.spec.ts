import { describe, expect, it } from '@jest/globals';

import { createRussianDiscordTranslator } from '../infrastructure/russian-discord-translator.js';
import {
  createDiscordPanelDefinition,
  DISCORD_PANEL_CUSTOM_IDS,
  parseDiscordPanelAction,
  type DiscordPanelAction,
} from './discord-panel.js';

describe('Discord control panel', () => {
  it('builds the immutable canonical Russian two-row panel', () => {
    const panel = createDiscordPanelDefinition(createRussianDiscordTranslator());

    expect(panel).toEqual({
      content: 'Dota Coach\nВыбери действие или роль на текущий матч.',
      rows: [
        {
          buttons: [
            {
              customId: DISCORD_PANEL_CUSTOM_IDS.lost,
              label: "I'm lost",
              style: 'primary',
              disabled: false,
            },
            {
              customId: DISCORD_PANEL_CUSTOM_IDS.buy,
              label: 'Buy',
              style: 'secondary',
              disabled: true,
            },
          ],
        },
        {
          buttons: [
            roleButton(DISCORD_PANEL_CUSTOM_IDS.carry, '1 Carry'),
            roleButton(DISCORD_PANEL_CUSTOM_IDS.mid, '2 Mid'),
            roleButton(DISCORD_PANEL_CUSTOM_IDS.offlane, '3 Offlane'),
            roleButton(DISCORD_PANEL_CUSTOM_IDS.support, '4 Support'),
            roleButton(DISCORD_PANEL_CUSTOM_IDS.hardSupport, '5 Hard Support'),
          ],
        },
      ],
    });
    expect(Object.isFrozen(panel)).toBe(true);
    expect(Object.isFrozen(panel.rows)).toBe(true);
    expect(panel.rows.every((row) => Object.isFrozen(row) && Object.isFrozen(row.buttons))).toBe(true);
    expect(panel.rows.flatMap((row) => row.buttons).every(Object.isFrozen)).toBe(true);
  });

  it.each([
    [DISCORD_PANEL_CUSTOM_IDS.lost, { kind: 'request_lost' }],
    [DISCORD_PANEL_CUSTOM_IDS.buy, { kind: 'buy_disabled' }],
    [DISCORD_PANEL_CUSTOM_IDS.carry, { kind: 'set_role', role: 1 }],
    [DISCORD_PANEL_CUSTOM_IDS.mid, { kind: 'set_role', role: 2 }],
    [DISCORD_PANEL_CUSTOM_IDS.offlane, { kind: 'set_role', role: 3 }],
    [DISCORD_PANEL_CUSTOM_IDS.support, { kind: 'set_role', role: 4 }],
    [DISCORD_PANEL_CUSTOM_IDS.hardSupport, { kind: 'set_role', role: 5 }],
  ] satisfies readonly (readonly [string, DiscordPanelAction])[])('parses %s', (customId, expected) => {
    const action = parseDiscordPanelAction(customId);

    expect(action).toEqual(expected);
    expect(Object.isFrozen(action)).toBe(true);
  });

  it.each(['coach:v2:action:lost', 'coach:v1:role:6', 'coach:v1:action:unknown', '', 'unrelated'])(
    'rejects unsupported custom ID %s',
    (customId) => {
      expect(parseDiscordPanelAction(customId)).toBeNull();
    }
  );
});

function roleButton(customId: string, label: string) {
  return {
    customId,
    label,
    style: 'secondary',
    disabled: false,
  };
}
