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
export type DiscordButtonStyle = 'primary' | 'secondary';

export type DiscordPanelAction =
  | Readonly<{ kind: 'request_lost' }>
  | Readonly<{ kind: 'buy_disabled' }>
  | Readonly<{ kind: 'set_role'; role: 1 | 2 | 3 | 4 | 5 }>;

export type DiscordPanelButton = Readonly<{
  customId: DiscordPanelCustomId;
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
  void locale;
  throw new Error('Discord panel definition is not implemented.');
}

export function parseDiscordPanelAction(customId: string): DiscordPanelAction | null {
  void customId;
  throw new Error('Discord panel action parsing is not implemented.');
}
