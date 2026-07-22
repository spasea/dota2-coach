import type { LostMessage, LostTranslationCatalog, LostTranslator } from '../application/lost-translator.js';

const pluralRules = new Intl.PluralRules('ru');

export const RUSSIAN_LOST_CATALOG = Object.freeze({
  'lost.action.reset': () => 'отступи и восстановись',
  'lost.action.defend': () => 'переместись на защиту своей постройки',
  'lost.action.defend_target': ({ structureId }) => `Защищай ${formatStructure(structureId)}`,
  'lost.action.regroup': () => 'сблизься с союзниками',
  'lost.action.regroup_target': ({ heroNames }) => `Сблизься с группой: ${heroNames.map(formatHeroName).join(', ')}`,
  'lost.action.farm_safely': () => 'фарми безопасно и не углубляйся',
  'lost.reason.requester_low_health': () => 'у тебя мало здоровья',
  'lost.reason.requester_low_mana': () => 'у тебя мало маны',
  'lost.reason.requester_disabled': () => 'ты не можешь полноценно действовать',
  'lost.reason.active_structure_damage': () => 'постройка получает урон сейчас',
  'lost.reason.recent_structure_damage': () => 'постройка недавно получала урон',
  'lost.reason.repeated_structure_damage': ({ eventCount }) =>
    `зафиксировано повторных повреждений: ${String(eventCount)}`,
  'lost.reason.critical_structure': () => 'постройка находится в критическом состоянии',
  'lost.reason.requester_already_near_structure': () => 'ты уже рядом с постройкой',
  'lost.reason.requester_can_teleport': () => 'телепорт технически готов',
  'lost.reason.requester_would_arrive_outnumbered': ({ enemyCount }) => `рядом ${formatEnemyCount(enemyCount)}`,
  'lost.reason.allied_defenders_already_present': ({ defenderCount }) => `рядом ${formatDefenderCount(defenderCount)}`,
  'lost.reason.requester_deep_and_isolated': () => 'ты глубоко на чужой стороне и далеко от союзников',
  'lost.reason.enemies_missing': ({ enemyCount }) => `${formatEnemyCount(enemyCount)} не видно`,
  'lost.reason.enemies_visible_elsewhere': ({ enemyCount }) =>
    `${formatEnemyCount(enemyCount)} видны в другой части карты`,
  'lost.reason.confirmed_allied_cluster': ({ allyCount }) => `рядом собрались ${formatAllyCount(allyCount)}`,
  'lost.reason.partial_evidence': () => 'решение опирается на неполные данные',
  'lost.guardrail.avoid_solo_defense': () => 'не защищай постройку в одиночку',
  'lost.guardrail.do_not_farm_deep': () => 'не фарми глубоко на чужой стороне',
  'lost.guardrail.retreat_on_enemy_visibility_drop': () => 'отходи, если противники исчезнут из видимости',
  'lost.guardrail.regroup_only_with_confirmed_cluster': () => 'иди только к подтверждённой группе союзников',
  'lost.unknown.partial_team_coverage': () => 'подключена не вся команда',
  'lost.unknown.timeline_stale': () => 'общая история матча устарела',
  'lost.unknown.timeline_rebaselining': () => 'общая история матча восстанавливается',
  'lost.unknown.requester_history_unavailable': () => 'история твоего состояния недоступна',
  'lost.unknown.building_history_unavailable': () => 'история состояния построек недоступна',
  'lost.unknown.enemy_observation_ambiguous': () => 'наблюдения за противниками неоднозначны',
  'lost.unknown.requester_readiness_unknown': () => 'твоя готовность неизвестна',
  'lost.unknown.teleport_readiness_unknown': () => 'готовность телепорта неизвестна',
  'lost.unknown.structure_position_unknown': () => 'позиция постройки неизвестна',
  'lost.unknown.defender_readiness_partial': () => 'готовность части защитников неизвестна',
  'lost.unknown.enemy_count_is_lower_bound': () => 'видимое число противников является нижней границей',
  'lost.unknown.safe_destination_unknown': () => 'безопасность направления неизвестна',
  'lost.hold.requester_dead': () => 'подожди возрождения и заново оцени карту',
  'lost.hold.match_paused': () => 'матч на паузе — дождись продолжения',
  'lost.hold.insufficient_evidence': () => 'пока не форсируй действие: не хватает надёжной информации',
  'lost.hold.insufficient_confidence': () => 'пока не форсируй действие: нет достаточно уверенного варианта',
  'lost.layout.title': ({ action }) => `I'm lost → ${action}`,
  'lost.layout.voice_addressed_to_individual': ({ displayName, voice }) => `${displayName}, ${voice}`,
  'lost.layout.voice_with_reasons': ({ action, reasons }) => `${action}: ${reasons}.`,
  'lost.layout.voice_with_guardrails': ({ voice, guardrails }) => `${voice} ${guardrails}.`,
  'lost.layout.best_action': ({ action }) => `Лучшее действие: ${action}.`,
  'lost.layout.reason_section': () => 'Почему:',
  'lost.layout.penalty_section': () => 'Риски:',
  'lost.layout.unknown_section': () => 'Неизвестно:',
  'lost.layout.guardrail_section': () => 'Ограничения:',
  'lost.layout.list_item': ({ text }) => `• ${text}.`,
  'lost.layout.alternative': ({ action, score }) => `Альтернатива: ${action} — ${String(score)}.`,
} satisfies LostTranslationCatalog);

export function createRussianLostTranslator(): LostTranslator {
  return (message) => translateMessage(message);
}

function translateMessage(message: LostMessage): string {
  const formatter = RUSSIAN_LOST_CATALOG[message.key] as (params: never) => string;

  return formatter(message.params as never);
}

function formatEnemyCount(count: number): string {
  return `${String(count)} ${selectPlural(count, 'противник', 'противника', 'противников')}`;
}

function formatDefenderCount(count: number): string {
  return `${String(count)} ${selectPlural(count, 'союзный защитник', 'союзных защитника', 'союзных защитников')}`;
}

function formatAllyCount(count: number): string {
  return `${String(count)} ${selectPlural(count, 'союзник', 'союзника', 'союзников')}`;
}

const towerLaneLabels: Readonly<Record<string, string>> = Object.freeze({
  top: 'верхнюю',
  mid: 'центральную',
  bot: 'нижнюю',
});
const barracksLaneLabels: Readonly<Record<string, string>> = Object.freeze({
  top: 'верхние',
  mid: 'центральные',
  bot: 'нижние',
});

function formatStructure(structureId: string): string {
  const [, structureKind, detail, lane] = structureId.split(':');

  if (structureKind === 'ancient') {
    return 'трон';
  }
  if (structureKind === 'tower') {
    return formatTower(detail, lane);
  }
  if (structureKind === 'barracks') {
    return formatBarracks(lane);
  }

  return 'постройку';
}

function formatTower(tier: string | undefined, lane: string | undefined): string {
  const towerName = tier === undefined ? 'башню' : `T${tier}`;
  const laneLabel = lane === undefined ? undefined : towerLaneLabels[lane];

  return laneLabel === undefined ? towerName : `${laneLabel} ${towerName}`;
}

function formatBarracks(lane: string | undefined): string {
  const laneLabel = lane === undefined ? undefined : barracksLaneLabels[lane];

  return laneLabel === undefined ? 'казармы' : `${laneLabel} казармы`;
}

function formatHeroName(heroName: string): string {
  return heroName
    .replace(/^npc_dota_hero_/, '')
    .split('_')
    .filter((part) => part.length > 0)
    .map(capitalize)
    .join(' ');
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function selectPlural(count: number, one: string, few: string, many: string): string {
  const category = pluralRules.select(count);

  if (category === 'one') {
    return one;
  }

  return category === 'few' ? few : many;
}
