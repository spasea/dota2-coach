import type { Role } from '../../../modules/match/public.js';
import type { DiscordMessage, DiscordTranslationCatalog, DiscordTranslator } from '../application/discord-message.js';

const roleLabels: Readonly<Record<Role, string>> = Object.freeze({
  1: '1 Carry',
  2: '2 Mid',
  3: '3 Offlane',
  4: '4 Support',
  5: '5 Hard Support',
});

const russianDiscordCatalog: DiscordTranslationCatalog = Object.freeze({
  'discord.panel.content': () => 'Dota Coach\nВыбери действие или роль на текущий матч.',
  'discord.panel.action.lost': () => "I'm lost",
  'discord.panel.action.buy': () => 'Buy',
  'discord.role.label': ({ role }) => roleLabels[role],
  'discord.error.invalid_source': () => 'Эта кнопка не относится к текущей панели. Используй закреплённое сообщение.',
  'discord.error.identity_unmapped': () => 'Твой Discord не привязан к игровому клиенту.',
  'discord.error.gsi_unavailable': () => 'Не вижу свежих данных из игры. Проверь GSI.',
  'discord.error.match_unavailable': () => 'Сейчас не вижу активный матч для тебя.',
  'discord.error.match_changed': () => 'Матч успел измениться. Нажми ещё раз.',
  'discord.lost.duplicate': () => 'Запрос уже был принят. Подожди немного.',
  'discord.buy.disabled': () => 'Buy пока не готов.',
  'discord.lost.delivered': () => 'Совет отправлен в канал.',
  'discord.lost.unavailable': () => 'Сейчас не могу собрать безопасный совет.',
  'discord.lost.delivery_failed': () => 'Не удалось отправить совет. Попробуй ещё раз.',
  'discord.lost.public_header': ({ displayName, role }) => `${displayName} · роль ${roleLabels[role]}`,
  'discord.lost.public_metrics': ({ primaryScore, confidence, coverageCount }) =>
    `Score: ${primaryScore ?? '—'} · Confidence: ${confidence} · Coverage: ${coverageCount}/5`,
  'discord.role.updated': ({ role }) => `Роль на этот матч: ${roleLabels[role]}.`,
  'discord.error.unexpected': () => 'Что-то пошло не так. Попробуй ещё раз.',
});

export function createRussianDiscordTranslator(): DiscordTranslator {
  return translateMessage;
}

function translateMessage(message: DiscordMessage): string {
  const formatter = russianDiscordCatalog[message.key] as (params: never) => string;

  return formatter(message.params as never);
}
