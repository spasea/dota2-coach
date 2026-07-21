export type LostTranslationParams = Readonly<{
  'lost.action.reset': undefined;
  'lost.action.defend': undefined;
  'lost.action.regroup': undefined;
  'lost.action.farm_safely': undefined;
  'lost.reason.requester_low_health': undefined;
  'lost.reason.requester_low_mana': undefined;
  'lost.reason.requester_disabled': undefined;
  'lost.reason.active_structure_damage': undefined;
  'lost.reason.recent_structure_damage': undefined;
  'lost.reason.repeated_structure_damage': Readonly<{ eventCount: number }>;
  'lost.reason.critical_structure': undefined;
  'lost.reason.requester_already_near_structure': undefined;
  'lost.reason.requester_can_teleport': undefined;
  'lost.reason.requester_would_arrive_outnumbered': Readonly<{ enemyCount: number }>;
  'lost.reason.allied_defenders_already_present': Readonly<{ defenderCount: number }>;
  'lost.reason.requester_deep_and_isolated': undefined;
  'lost.reason.enemies_missing': Readonly<{ enemyCount: number }>;
  'lost.reason.enemies_visible_elsewhere': Readonly<{ enemyCount: number }>;
  'lost.reason.confirmed_allied_cluster': Readonly<{ allyCount: number }>;
  'lost.reason.partial_evidence': undefined;
  'lost.guardrail.avoid_solo_defense': undefined;
  'lost.guardrail.do_not_farm_deep': undefined;
  'lost.guardrail.retreat_on_enemy_visibility_drop': undefined;
  'lost.guardrail.regroup_only_with_confirmed_cluster': undefined;
  'lost.unknown.partial_team_coverage': undefined;
  'lost.unknown.timeline_stale': undefined;
  'lost.unknown.timeline_rebaselining': undefined;
  'lost.unknown.requester_history_unavailable': undefined;
  'lost.unknown.building_history_unavailable': undefined;
  'lost.unknown.enemy_observation_ambiguous': undefined;
  'lost.unknown.requester_readiness_unknown': undefined;
  'lost.unknown.teleport_readiness_unknown': undefined;
  'lost.unknown.structure_position_unknown': undefined;
  'lost.unknown.defender_readiness_partial': undefined;
  'lost.unknown.enemy_count_is_lower_bound': undefined;
  'lost.unknown.safe_destination_unknown': undefined;
  'lost.hold.requester_dead': undefined;
  'lost.hold.match_paused': undefined;
  'lost.hold.insufficient_evidence': undefined;
  'lost.hold.insufficient_confidence': undefined;
  'lost.layout.title': Readonly<{ action: string }>;
  'lost.layout.voice_with_reasons': Readonly<{ action: string; reasons: string }>;
  'lost.layout.voice_with_guardrails': Readonly<{ voice: string; guardrails: string }>;
  'lost.layout.best_action': Readonly<{ action: string }>;
  'lost.layout.reason_section': undefined;
  'lost.layout.penalty_section': undefined;
  'lost.layout.unknown_section': undefined;
  'lost.layout.guardrail_section': undefined;
  'lost.layout.list_item': Readonly<{ text: string }>;
  'lost.layout.alternative': Readonly<{ action: string; score: number }>;
}>;

export type LostTranslationKey = keyof LostTranslationParams;

export type LostMessage<Key extends LostTranslationKey = LostTranslationKey> = {
  [MessageKey in Key]: Readonly<{
    key: MessageKey;
    params: LostTranslationParams[MessageKey];
  }>;
}[Key];

export type LostTranslator = (message: LostMessage) => string;

export type LostTranslationCatalog = Readonly<{
  [Key in LostTranslationKey]: (params: LostTranslationParams[Key]) => string;
}>;

export function lostMessage<Key extends LostTranslationKey>(
  key: Key,
  params: LostTranslationParams[Key]
): LostMessage<Key> {
  return Object.freeze({ key, params });
}
