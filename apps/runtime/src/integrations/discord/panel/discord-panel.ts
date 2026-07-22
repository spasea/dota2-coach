import { discordMessage, type DiscordTranslator } from '../application/discord-message.js';

export const DISCORD_PANEL_CUSTOM_IDS = Object.freeze({
  lost: 'coach:v1:action:lost',
  buy: 'coach:v1:action:buy',
  carry: 'coach:v1:role:1',
  mid: 'coach:v1:role:2',
  offlane: 'coach:v1:role:3',
  support: 'coach:v1:role:4',
  hardSupport: 'coach:v1:role:5',
} as const);

export type DiscordPanelCustomId = (typeof DISCORD_PANEL_CUSTOM_IDS)[keyof typeof DISCORD_PANEL_CUSTOM_IDS];
export type DiscordButtonStyle = 'primary' | 'secondary' | 'unsupported';

export type DiscordPanelAction =
  | Readonly<{ kind: 'request_lost' }>
  | Readonly<{ kind: 'buy_disabled' }>
  | Readonly<{ kind: 'set_role'; role: 1 | 2 | 3 | 4 | 5 }>;

export type DiscordPanelButton = Readonly<{
  customId: string;
  label: string;
  style: DiscordButtonStyle;
  disabled: boolean;
}>;

export type DiscordPanelRow = Readonly<{
  buttons: readonly DiscordPanelButton[];
}>;

export type DiscordPanelDefinition = Readonly<{
  content: string;
  rows: readonly DiscordPanelRow[];
}>;

export function createDiscordPanelDefinition(translator: DiscordTranslator): DiscordPanelDefinition {
  return freezePanel({
    content: translator(discordMessage('discord.panel.content', undefined)),
    rows: [
      {
        buttons: [
          button(
            DISCORD_PANEL_CUSTOM_IDS.lost,
            translator(discordMessage('discord.panel.action.lost', undefined)),
            'primary'
          ),
          button(
            DISCORD_PANEL_CUSTOM_IDS.buy,
            translator(discordMessage('discord.panel.action.buy', undefined)),
            'secondary',
            true
          ),
        ],
      },
      {
        buttons: [
          roleButton(DISCORD_PANEL_CUSTOM_IDS.carry, 1, translator),
          roleButton(DISCORD_PANEL_CUSTOM_IDS.mid, 2, translator),
          roleButton(DISCORD_PANEL_CUSTOM_IDS.offlane, 3, translator),
          roleButton(DISCORD_PANEL_CUSTOM_IDS.support, 4, translator),
          roleButton(DISCORD_PANEL_CUSTOM_IDS.hardSupport, 5, translator),
        ],
      },
    ],
  });
}

export function parseDiscordPanelAction(customId: string): DiscordPanelAction | null {
  switch (customId) {
    case DISCORD_PANEL_CUSTOM_IDS.lost:
      return Object.freeze({ kind: 'request_lost' });
    case DISCORD_PANEL_CUSTOM_IDS.buy:
      return Object.freeze({ kind: 'buy_disabled' });
    case DISCORD_PANEL_CUSTOM_IDS.carry:
      return roleAction(1);
    case DISCORD_PANEL_CUSTOM_IDS.mid:
      return roleAction(2);
    case DISCORD_PANEL_CUSTOM_IDS.offlane:
      return roleAction(3);
    case DISCORD_PANEL_CUSTOM_IDS.support:
      return roleAction(4);
    case DISCORD_PANEL_CUSTOM_IDS.hardSupport:
      return roleAction(5);
    default:
      return null;
  }
}

function button(
  customId: DiscordPanelCustomId,
  label: string,
  style: Exclude<DiscordButtonStyle, 'unsupported'>,
  disabled = false
): DiscordPanelButton {
  return { customId, label, style, disabled };
}

function roleButton(customId: DiscordPanelCustomId, role: 1 | 2 | 3 | 4 | 5, translator: DiscordTranslator) {
  return button(customId, translator(discordMessage('discord.role.label', { role })), 'secondary');
}

function roleAction(role: 1 | 2 | 3 | 4 | 5): DiscordPanelAction {
  return Object.freeze({ kind: 'set_role', role });
}

function freezePanel(panel: DiscordPanelDefinition): DiscordPanelDefinition {
  const rows = panel.rows.map((row) =>
    Object.freeze({ buttons: Object.freeze(row.buttons.map((panelButton) => Object.freeze(panelButton))) })
  );

  return Object.freeze({ content: panel.content, rows: Object.freeze(rows) });
}
