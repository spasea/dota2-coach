export const heartbeatGsiSnapshot = {
  provider: {
    timestamp: 1_784_393_633,
  },
  player: {},
  events: [],
} as const;

export const fullGsiSnapshot = {
  provider: {
    timestamp: 1_784_393_945,
  },
  map: {
    matchid: '8902657168',
    game_time: 129,
    clock_time: 0,
    radiant_score: 0,
    dire_score: 0,
    game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
    paused: false,
  },
  player: {
    team_name: 'radiant',
    team_slot: 4,
    gold: 117,
    last_hits: 0,
    denies: 0,
    gpm: 10_442,
    xpm: 0,
    gold_from_hero_kills: 0,
    gold_from_creep_kills: 0,
    gold_from_income: 2,
    gold_from_shared: 0,
  },
  hero: {
    name: 'npc_dota_hero_invoker',
    xpos: 427,
    ypos: -1_838,
    alive: true,
    health_percent: 100,
    mana_percent: 100,
    level: 1,
    xp: 0,
  },
  minimap: {
    o0: {
      image: 'minimap_herocircle_self',
      team: 2,
      unitname: 'npc_dota_hero_invoker',
      xpos: 427,
      ypos: -1_838,
    },
    o1: {
      image: 'minimap_heroimage',
      team: 3,
      unitname: 'npc_dota_hero_windrunner',
      xpos: 1_920,
      ypos: 2_560,
    },
    o2: {
      image: 'minimap_enemyicon',
      team: 3,
      unitname: 'npc_dota_hero_windrunner',
      xpos: 1_944,
      ypos: 2_544,
    },
    o3: {
      image: 'minimap_tower45',
      team: 2,
      unitname: 'dota_goodguys_tower1_top',
      xpos: -6_000,
      ypos: 1_800,
    },
  },
  buildings: {
    radiant: {
      dota_goodguys_tower2_top: {
        health: 2_500,
        max_health: 2_500,
      },
      dota_goodguys_tower1_top: {
        health: 1_800,
        max_health: 1_800,
      },
    },
  },
  events: [
    {
      game_time: 28,
      event_type: 'generic_event',
      data: '{"type":"CHAT_MESSAGE_ITEM_PURCHASE","value":42,"playerid1":3,"playerid2":-1,"time":-41.6666641,"unsupported":"discard"}',
    },
    {
      game_time: 129,
      event_type: 'bounty_rune_pickup',
      player_id: 3,
      team: 'radiant',
      bounty_value: 40,
      team_gold: 200,
    },
    {
      game_time: 1_508,
      event_type: 'roshan_killed',
      killed_by_team: 'dire',
      killer_player_id: 9,
    },
    {
      game_time: 1_509,
      event_type: 'aegis_picked_up',
      player_id: 5,
      snatched: false,
    },
    {
      game_time: 1_510,
      event_type: 'chat_message',
      player_id: 5,
      message: 'synthetic-discard-me',
    },
  ],
} as const;

export const malformedNestedGsiSnapshot = {
  provider: {
    timestamp: '1784393945',
  },
  map: {
    matchid: '8902657168',
    game_time: '129',
    clock_time: Number.POSITIVE_INFINITY,
    radiant_score: null,
    dire_score: [],
    game_state: 42,
    paused: 'false',
  },
  player: {
    team_name: 'radiant',
    team_slot: '4',
    gold: 117,
    last_hits: '0',
    denies: false,
    gpm: Number.NaN,
  },
  hero: {
    name: 'npc_dota_hero_invoker',
    xpos: '427',
    ypos: -1_838,
    alive: 'true',
    health_percent: 100,
    mana_percent: {},
    level: 1,
    xp: '0',
  },
  events: [
    {
      game_time: 130,
      event_type: 'generic_event',
      data: '{invalid-json',
    },
    {
      game_time: 131,
      event_type: 'chat_message',
      message: 'synthetic-discard-me',
    },
    {
      game_time: 132,
      event_type: 'unsupported_event',
    },
  ],
} as const;
