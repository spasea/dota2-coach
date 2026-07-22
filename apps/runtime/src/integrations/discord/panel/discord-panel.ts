import type { CoachLocale } from '../../../platform/i18n/locale.js';

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

export function createDiscordPanelDefinition(locale: CoachLocale): DiscordPanelDefinition {
  const copy = resolvePanelCopy(locale);

  return freezePanel({
    content: copy.content,
    rows: [
      {
        buttons: [
          button(DISCORD_PANEL_CUSTOM_IDS.lost, copy.lost, 'primary'),
          button(DISCORD_PANEL_CUSTOM_IDS.buy, copy.buy, 'secondary', true),
        ],
      },
      {
        buttons: [
          button(DISCORD_PANEL_CUSTOM_IDS.carry, copy.carry, 'secondary'),
          button(DISCORD_PANEL_CUSTOM_IDS.mid, copy.mid, 'secondary'),
          button(DISCORD_PANEL_CUSTOM_IDS.offlane, copy.offlane, 'secondary'),
          button(DISCORD_PANEL_CUSTOM_IDS.support, copy.support, 'secondary'),
          button(DISCORD_PANEL_CUSTOM_IDS.hardSupport, copy.hardSupport, 'secondary'),
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

type PanelCopy = Readonly<{
  content: string;
  lost: string;
  buy: string;
  carry: string;
  mid: string;
  offlane: string;
  support: string;
  hardSupport: string;
}>;

function resolvePanelCopy(locale: CoachLocale): PanelCopy {
  switch (locale) {
    case 'ru':
      return Object.freeze({
        content: 'Dota Coach\nВыбери действие или роль на текущий матч.',
        lost: "I'm lost",
        buy: 'Buy',
        carry: '1 Carry',
        mid: '2 Mid',
        offlane: '3 Offlane',
        support: '4 Support',
        hardSupport: '5 Hard Support',
      });
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

function roleAction(role: 1 | 2 | 3 | 4 | 5): DiscordPanelAction {
  return Object.freeze({ kind: 'set_role', role });
}

function freezePanel(panel: DiscordPanelDefinition): DiscordPanelDefinition {
  const rows = panel.rows.map((row) =>
    Object.freeze({ buttons: Object.freeze(row.buttons.map((panelButton) => Object.freeze(panelButton))) })
  );

  return Object.freeze({ content: panel.content, rows: Object.freeze(rows) });
}
