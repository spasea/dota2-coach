export type RawGsiProvider = Readonly<{
  timestamp?: unknown;
}>;

export type RawGsiMap = Readonly<{
  matchid?: unknown;
  game_state?: unknown;
  game_time?: unknown;
  clock_time?: unknown;
  paused?: unknown;
  radiant_score?: unknown;
  dire_score?: unknown;
}>;

export type RawGsiPlayer = Readonly<{
  team_name?: unknown;
  team_slot?: unknown;
  gold?: unknown;
  last_hits?: unknown;
  denies?: unknown;
  gpm?: unknown;
  xpm?: unknown;
  gold_from_hero_kills?: unknown;
  gold_from_creep_kills?: unknown;
  gold_from_income?: unknown;
  gold_from_shared?: unknown;
}>;

export type RawGsiHero = Readonly<{
  name?: unknown;
  xpos?: unknown;
  ypos?: unknown;
  alive?: unknown;
  health_percent?: unknown;
  mana_percent?: unknown;
  level?: unknown;
  xp?: unknown;
}>;

export type RawGsiMinimapMarker = Readonly<{
  image?: unknown;
  team?: unknown;
  unitname?: unknown;
  xpos?: unknown;
  ypos?: unknown;
}>;

export type RawGsiBuilding = Readonly<{
  health?: unknown;
  max_health?: unknown;
}>;

export type RawGsiEvent = Readonly<{
  event_type?: unknown;
  game_time?: unknown;
  data?: unknown;
  player_id?: unknown;
  team?: unknown;
  bounty_value?: unknown;
  team_gold?: unknown;
  killed_by_team?: unknown;
  killer_player_id?: unknown;
  snatched?: unknown;
}>;

export type RawGsiSnapshot = Readonly<{
  provider?: unknown;
  map?: unknown;
  player?: unknown;
  hero?: unknown;
  minimap?: unknown;
  buildings?: unknown;
  events?: unknown;
}>;
