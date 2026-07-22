import { describe, expect, it } from '@jest/globals';

import { createConfidentCandidate } from '../domain/lost-decision.spec-fixtures.js';
import { buildLostPresentation } from './build-lost-presentation.js';

describe('Lost presentation builder', () => {
  it('maps a selected decision to typed messages and limits voice to two strongest reasons', () => {
    const primary = createConfidentCandidate('RESET', 130, 'high', {
      reasons: [
        { code: 'requester_low_health', value: 18, contribution: 70 },
        { code: 'requester_disabled', value: true, contribution: 45 },
        { code: 'requester_low_mana', value: 10, contribution: 15 },
      ],
    });
    const alternative = createConfidentCandidate('FARM_SAFELY', 20);

    const presentation = buildLostPresentation({
      selection: { status: 'selected', primary, alternative },
      coverage: 0.4,
      unknowns: ['partial_team_coverage'],
      guardrails: [],
    });

    expect(presentation).toMatchObject({
      action: 'RESET',
      confidence: 'high',
      coverage: 0.4,
      voiceLead: { key: 'lost.action.reset', params: undefined },
      voiceReasons: [
        { key: 'lost.reason.requester_low_health', params: undefined },
        { key: 'lost.reason.requester_disabled', params: undefined },
      ],
      unknowns: [{ key: 'lost.unknown.partial_team_coverage', params: undefined }],
    });
    expect(presentation.primary?.reasons).toEqual([
      { key: 'lost.reason.requester_low_health', params: undefined },
      { key: 'lost.reason.requester_disabled', params: undefined },
      { key: 'lost.reason.requester_low_mana', params: undefined },
    ]);
    expect(presentation.alternative?.action).toEqual({ key: 'lost.action.farm_safely', params: undefined });
  });

  it('preserves count parameters and safety guardrails without localized copy', () => {
    const primary = createConfidentCandidate('FARM_SAFELY', 80, 'medium', {
      reasons: [
        { code: 'requester_would_arrive_outnumbered', value: 3, contribution: 35 },
        { code: 'enemies_visible_elsewhere', value: 3, contribution: 25 },
      ],
      guardrails: ['avoid_solo_defense', 'retreat_on_enemy_visibility_drop'],
    });

    const presentation = buildLostPresentation({
      selection: { status: 'selected', primary, alternative: null },
      coverage: 0.2,
      unknowns: ['partial_team_coverage'],
      guardrails: primary.guardrails,
    });

    expect(presentation.primary?.reasons).toEqual([
      { key: 'lost.reason.requester_would_arrive_outnumbered', params: { enemyCount: 3 } },
      { key: 'lost.reason.enemies_visible_elsewhere', params: { enemyCount: 3 } },
    ]);
    expect(presentation.guardrails).toEqual([
      { key: 'lost.guardrail.avoid_solo_defense', params: undefined },
      { key: 'lost.guardrail.retreat_on_enemy_visibility_drop', params: undefined },
    ]);
  });

  it.each([
    [
      createConfidentCandidate('DEFEND', 80, 'high', {
        target: { kind: 'structure', structureId: 'radiant:tower:2:bot' },
      }),
      { key: 'lost.action.defend_target', params: { structureId: 'radiant:tower:2:bot' } },
    ],
    [
      createConfidentCandidate('REGROUP', 70, 'high', {
        target: {
          kind: 'allied_cluster',
          heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_crystal_maiden'],
        },
      }),
      {
        key: 'lost.action.regroup_target',
        params: { heroNames: ['npc_dota_hero_axe', 'npc_dota_hero_crystal_maiden'] },
      },
    ],
  ] as const)('includes the selected %s destination in primary and voice messages', (primary, expectedMessage) => {
    const presentation = buildLostPresentation({
      selection: { status: 'selected', primary, alternative: null },
      coverage: 0.4,
      unknowns: [],
      guardrails: [],
    });

    expect(presentation.primary?.action).toEqual(expectedMessage);
    expect(presentation.voiceLead).toEqual(expectedMessage);
  });

  it.each([
    ['requester_dead', 'lost.hold.requester_dead'],
    ['match_paused', 'lost.hold.match_paused'],
    ['insufficient_evidence', 'lost.hold.insufficient_evidence'],
    ['insufficient_confidence', 'lost.hold.insufficient_confidence'],
  ] as const)('maps %s HOLD_AND_WAIT to %s', (reason, expectedKey) => {
    expect(
      buildLostPresentation({
        selection: { status: 'hold', reason },
        coverage: 0.2,
        unknowns: [],
        guardrails: [],
      })
    ).toMatchObject({
      action: 'HOLD_AND_WAIT',
      primary: null,
      alternative: null,
      confidence: 'high',
      voiceLead: { key: expectedKey, params: undefined },
    });
  });
});
