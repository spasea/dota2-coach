# Исследование Dota 2 GSI: `gsi_valid_turbo_match.json`

## Область исследования и правила интерпретации

Источник — только `tmp/gsi_valid_turbo_match.json`: 2 125 последовательных GSI snapshot одного матча `8902657168`, 106 MiB, provider version `48`. Захват охватывает поиск/загрузку матча, выбор героя, pre-game, весь матч и post-game. Локальный игрок играл за Radiant на Invoker; финальный счёт 50:61, победил Dire.

Термины в отчёте:

- **Confirmed** — значение или связь непосредственно наблюдается в raw JSON либо проверяется без исключений на всём dataset.
- **Derived** — значение можно достаточно надёжно вычислить из нескольких raw-полей/последовательных snapshot.
- **Unknown** — данных недостаточно, чтобы выбрать одну интерпретацию.
- **Unavailable in this dataset** — поле/сигнал не присутствует или всегда пуст. Это не утверждение, что его невозможно получить при любой конфигурации GSI или в любой версии Dota 2.

Идентификаторы Valve (`value`, `playerid*`, channel types) не подписаны схемой. Поэтому далее явно разделены фактически проверенные соответствия и гипотезы. В частности, факт, что файл называется turbo, сам по себе не используется как доказательство режима: в payload нет `game_mode`, `lobby_type` или строки `turbo`.

## Короткий итог

Этот GSI достаточно богат для **real-time coach локального игрока**: положение/состояние героя, KDA и экономика, cooldown локальных способностей и предметов, локальный инвентарь, здоровье своих строений, союзные позиции, частично наблюдаемые враги, крипы, варды, Roshan и глобальная лента важных событий.

Он не является полной spectator/replay telemetry. Главные ограничения: minimap не содержит стабильных entity ID и здоровья юнитов; враги и их объекты подчинены видимости; подробное состояние есть только у локального героя; `events` — короткое скользящее окно, а не история; специализированные providers `draft`, `roshan`, `couriers`, `neutralitems` пусты; нет game mode, MMR, net worth всех игроков, чужих inventories/abilities, combat log и точного ownership большинства сущностей.

Для практического AI Coach архитектура должна состоять из:

1. snapshot normalizer;
2. собственного append-only event store с дедупликацией;
3. entity tracker поверх minimap с вероятностным сопоставлением объектов;
4. state/feature engine для derived-метрик;
5. внешних справочников Valve для item/hero/ability IDs, цен, cooldown и карты.

---

## 1. Общая структура snapshot и жизненный цикл `game_state`

### Root shape

Корень файла — JSON array из 2 125 snapshot. Snapshot имеет условную форму:

```json
{
  "provider": { "...": "..." },
  "map": { "...": "..." },
  "player": { "...": "..." },
  "hero": { "...": "..." },
  "abilities": { "ability0": {}, "...": {} },
  "items": { "slot0": {}, "...": {} },
  "buildings": { "radiant": {} },
  "wearables": { "wearable0": 0 },
  "events": [],
  "league": {},
  "roshan": {},
  "couriers": {},
  "neutralitems": {},
  "minimap": { "o0": {}, "o1": {} },
  "draft": {},
  "previously": {},
  "added": {}
}
```

Почти все секции optional и зависят от состояния. Первый и последний snapshot — heartbeat: `provider`, пустые `player`, `league`, `draft`, `roshan`, `couriers`, `neutralitems`, пустой `events`; `map` уже отсутствует.

### Наблюдавшийся lifecycle

| Индексы snapshot | `game_state` | Количество | `game_time` | `clock_time` | Что появляется |
|---:|---|---:|---:|---:|---|
| 0–7 | отсутствует | 8 | — | — | heartbeat; на 7-м распознан match/league |
| 8–10 | `DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD` | 3 | 11–14 | −38…−35 | `map`, `player`, placeholder hero |
| 11–31 | `DOTA_GAMERULES_STATE_HERO_SELECTION` | 21 | 15–36 | −44…0 | выбранный hero ID, cosmetics, первые purchase events |
| 32–44 | `DOTA_GAMERULES_STATE_STRATEGY_TIME` | 13 | 37–51 | −14…0 | настоящее имя героя, roster на minimap |
| 45–59 | `DOTA_GAMERULES_STATE_TEAM_SHOWCASE` | 15 | 52–67 | −15…0 | showcase, roster/minimap |
| 60 | `DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD` | 1 | 68 | 0 | все 18 своих строений, большой minimap |
| 61–109 | `DOTA_GAMERULES_STATE_PRE_GAME` | 49 | 70–127 | −58…0 | полный runtime hero, 8 abilities, 23 item slots |
| 110–2114 | `DOTA_GAMERULES_STATE_GAME_IN_PROGRESS` | 2 005 | 129–2551 | 0–2422 | основной realtime поток |
| 2115–2122 | `DOTA_GAMERULES_STATE_POST_GAME` | 8 | 2552–2560 | 2422 | winner, финальные значения; clock frozen |
| 2123–2124 | отсутствует | 2 | — | — | секции матча удалены, снова heartbeat |

Есть два важных reset/offset:

- `clock_time` внутри selection/showcase/pre-game несколько раз начинается с отрицательного значения и доходит до нуля; он не монотонен через границы всех states.
- Во время игры `game_time - clock_time` равен 128 или 129 секунд из-за округления. Для игрового таймера следует использовать `clock_time`, для дедупликации payload — `provider.timestamp` и/или `game_time`.

Частота не строго 1 Hz: между provider timestamps наблюдаются интервалы 0 s (2 раза), 1 s (1 675), 2 s (438), 4 s (1), 9 s (1), а до распознанного матча — 30–31 s. Поэтому скорость нельзя считать как «delta на snapshot» без деления на реальное время.

### Полнота секций по state

| State | Hero | Abilities | Items | Buildings | Minimap | Events |
|---|---|---|---|---|---:|---:|
| WAIT | `{id:0}` | пусто | пусто | `{radiant:{}}` | ровно 2 | 0 |
| HERO_SELECTION | сначала ID 0, затем ID 74 | пусто | пусто | пусто | 2–5 | 0–2 |
| STRATEGY_TIME | ID/name/facet | пусто | пусто | пусто | 5–15 | 2–3 |
| TEAM_SHOWCASE | ID/name/facet | пусто | пусто | пусто | 13–16 | 3–5 |
| WAIT_FOR_MAP | partial | пусто | пусто | 18 | 98 | 3 |
| PRE_GAME | полный | 8 | 23 | 18 | 105–120 | 1–5 |
| GAME | полный | 8 | 23 | 18 → 1 | 121–186 | 0–16 |
| POST_GAME | полный | 8 | 23 | 1 → 0 | 245–252 | 5–7 |

**Применение для Coach:** state machine должна gate-ить подсказки. Draft/strategy-подсказки нельзя строить из runtime abilities до `PRE_GAME`; lane/combat coaching активируется в `GAME_IN_PROGRESS`; в `POST_GAME` данные подходят для summary, но `clock_time` уже не движется.

**Ограничения:** отсутствуют явные pause intervals в этом матче (`paused` всегда false), reconnect/disconnect, rematch и state transitions при abandon — такую обработку dataset не проверяет.

---

## 2. Provider, map и временные шкалы

### `provider`

| Поле | Тип | Наблюдаемое значение/динамика |
|---|---|---|
| `name` | string | постоянно `"Dota 2"` |
| `appid` | number/integer | постоянно `570` |
| `version` | number/integer | постоянно `48` |
| `timestamp` | number/integer | Unix-like seconds, 1784393633…1784396408, растёт по heartbeat |

Пример:

```json
{"name":"Dota 2","appid":570,"version":48,"timestamp":1784393886}
```

`name/appid/version` постоянны в записи; `timestamp` — transport wall-clock. Он полезен для latency, пропусков snapshot и реальной длительности, но не для игрового таймера.

### `map`

Полный observed shape:

| Поле | Тип | Динамика |
|---|---|---|
| `name` | string | имя карты; постоянное в матче |
| `matchid` | string | `"8902657168"`; постоянное |
| `game_time` | number/integer | общий engine time; растёт через states |
| `clock_time` | number/integer | UI match clock; отрицателен до старта, 0…2422 в игре |
| `daytime` | boolean | переключается; в игре 1 031 false / 974 true snapshot |
| `nightstalker_night` | boolean | всегда false здесь |
| `radiant_score` | number/integer | растёт до 50 |
| `dire_score` | number/integer | растёт до 61 |
| `game_state` | string | lifecycle выше |
| `paused` | boolean | всегда false в этом матче |
| `win_team` | string | пусто большую часть матча; `"dire"` с последнего GAME snapshot и в POST |
| `customgamename` | string | всегда `""` |
| `ward_purchase_cooldown` | number/integer | меняется; убывает и периодически повышается |

Пример финала:

```json
{
  "matchid":"8902657168",
  "game_time":2552,
  "clock_time":2422,
  "radiant_score":50,
  "dire_score":61,
  "game_state":"DOTA_GAMERULES_STATE_POST_GAME",
  "paused":false,
  "win_team":"dire"
}
```

**Direct:** state, scores, day/night, winner, clocks, ward shop cooldown.  
**Derived:** duration, phase durations, kill-rate, score differential, day/night transitions, estimated dropped-update intervals.  
**Постоянное:** map name, match ID, custom game name в этом матче.  
**Только отдельные states:** `win_team` информативен только в самом конце; отрицательный `clock_time` — pre-game states.  
**Unavailable/Unknown:** game mode/turbo flag, lobby type, patch build, server region, pause/reconnect semantics, точный смысл скачков `ward_purchase_cooldown` без внешней спецификации.

---

## 3. Local player

### Полный shape

| Группа | Поля | Типы |
|---|---|---|
| Identity | `steamid`, `accountid`, `name`, `activity`, `team_name` | string |
| Slots | `player_slot`, `team_slot` | number/integer |
| Combat | `kills`, `deaths`, `assists`, `last_hits`, `denies`, `kill_streak`, `commands_issued` | number/integer |
| Kill aggregation | `kill_list` | object `<string, number>` |
| Gold | `gold`, `gold_reliable`, `gold_unreliable`, `gold_from_hero_kills`, `gold_from_creep_kills`, `gold_from_summon_kills`, `gold_from_income`, `gold_from_shared` | number/integer |
| Rates | `gpm`, `xpm` | number |

Реальный финальный пример (сокращён только identity):

```json
{
  "activity":"playing",
  "team_name":"radiant",
  "player_slot":2,
  "team_slot":4,
  "kills":7,
  "deaths":10,
  "assists":14,
  "last_hits":162,
  "denies":4,
  "kill_streak":0,
  "commands_issued":6962,
  "gold":9881,
  "gold_reliable":2065,
  "gold_unreliable":7816,
  "gold_from_hero_kills":21124,
  "gold_from_creep_kills":9556,
  "gold_from_summon_kills":280,
  "gold_from_income":7652,
  "gold_from_shared":7695,
  "gpm":1145,
  "xpm":1595,
  "kill_list":{"victimid_5":2,"victimid_6":1,"victimid_7":3,"victimid_9":1}
}
```

Проверенные инварианты на всех snapshot, где player заполнен:

- `gold == gold_reliable + gold_unreliable` — без исключений;
- сумма значений `kill_list` равна `kills` — без исключений;
- local purchase events используют `playerid1 = 4`, что совпадает с `team_slot = 4`, а **не** с `player_slot = 2`.

Во время GAME: +7 kills, +10 deaths, +14 assists, +134 LH, +4 denies; `commands_issued` менялся 380 раз. Gold может как расти, так и падать; его source counters только растут. `gpm/xpm` колеблются и не являются накопительными суммами. Очень ранний `gpm` (например 10442 на clock 0) нестабилен и не должен использоваться без warm-up.

**Direct:** локальные KDA/LH/denies, текущий gold и его buckets, rates, team/slots, итоговые victim counts.  
**Derived:** gold delta/spend estimate, farm rate в окне, LH/min, death/kill timeline через events, input activity proxy из `commands_issued`, reliable-gold risk.  
**Постоянное:** identity, команда, slots в этом матче.  
**State-specific:** полный player появляется уже в WAIT, но meaningful runtime counters — PRE/GAME/POST.  
**Ограничения:** это только local player. Нет net worth готовым полем, MMR, rank, role/lane, чужих KDA/gold/LH; `commands_issued` не раскрывает команды. Gold source counters могут отражать gross income и не обязаны складываться в current gold.

**Что строить:** персональный economy/farm coach, death-cost/risk alerts, темп LH, buy timing локальных предметов, post-game decomposition. Нельзя честно ранжировать net worth всех десяти игроков только из этой секции.

---

## 4. Local hero

### Полный observed shape

| Группа | Поля | Тип |
|---|---|---|
| Identity/build | `id`, `name`, `facet` | number, string, number |
| Progress | `level`, `xp`, `attributes_level`, `talent_1`…`talent_8` | number; talents boolean |
| Position | `xpos`, `ypos` | number |
| Life | `alive`, `respawn_seconds`, `buyback_cost`, `buyback_cooldown` | boolean, number |
| HP | `health`, `max_health`, `health_percent` | number |
| Mana | `mana`, `max_mana`, `mana_percent` | number |
| Status | `silenced`, `stunned`, `disarmed`, `magicimmune`, `hexed`, `muted`, `break`, `smoked`, `has_debuff` | boolean |
| Upgrades | `aghanims_scepter`, `aghanims_shard` | boolean |
| Persistent modifiers | `permanent_buffs` | object `<modifier_name, {stack_count:number}>` |

Первый полный PRE_GAME герой:

```json
{
  "id":74,"name":"npc_dota_hero_invoker","facet":0,
  "xpos":-7093,"ypos":-6143,"level":1,"xp":0,
  "alive":true,"health":692,"max_health":692,"health_percent":100,
  "mana":423,"max_mana":423,"mana_percent":100,
  "buyback_cost":0,"buyback_cooldown":0,
  "aghanims_scepter":false,"aghanims_shard":false,
  "permanent_buffs":{}
}
```

Финал: level 30, XP 64400, dead, respawn 60, buyback cost 7392, HP 0, max mana 2454, shard true, все восемь talents true.

Observed true хотя бы раз: `silenced` (3 frames), `stunned` (9), `disarmed` (20), `hexed` (3), `muted` (3), `has_debuff` (171), shard (568). Всегда false: `magicimmune`, `break`, `smoked`, Aghanim's Scepter. «Всегда false» означает лишь, что сценарий не был записан.

`health_percent == floor(100*health/max_health)` и то же для mana — без ошибок. Но был transient snapshot при `game_time=1049`: `alive=true`, `health=0`, `respawn_seconds=0`. Поэтому death detection следует основывать на `alive`/events, а не только HP.

Непустые `permanent_buffs`:

- `modifier_bounty_hunter_track_gold`: stack 50…760, наблюдался 1 603 frames, пять повышений;
- `modifier_item_aghanims_shard`: `stack_count:0`, 576 frames;
- `modifier_item_moon_shard_consumed`: `stack_count:0`, 68 frames.

**Direct:** точное локальное состояние, позиция, HP/mana, disable flags, death timer, buyback price/cooldown, talents/upgrades.  
**Derived:** health/mana velocity, time-to-full, danger thresholds, death windows, talent timings, movement trajectory/speed, disable duration по серии snapshots, estimated buyback affordability (`gold >= buyback_cost`, с оговоркой reliable/unreliable mechanics).  
**Постоянное:** hero ID/name/facet после выбора.  
**State-specific:** runtime stats только PRE/GAME/POST; во время HERO_SELECTION имя некоторое время пусто.  
**Unavailable:** attributes (STR/AGI/INT), armor, damage, move speed, attack range, vision, spell amp/resist, exact debuff names/durations, facing, teleport/channel, current target, location label, death cause готовым полем.

**Что строить:** ресурсы/позиционирование/disable/buyback coach, локальные timings и post-fight review. Для damage prediction нужен внешний hero/item/ability model.

---

## 5. Abilities

`abilities` — object с ключами `ability0`…`ability7`. Shape каждой записи:

| Поле | Тип |
|---|---|
| `name` | string |
| `level` | number/integer |
| `can_cast` | boolean |
| `passive` | boolean |
| `ability_active` | boolean |
| `cooldown`, `max_cooldown` | number |
| `ultimate` | boolean |

PRE_GAME пример: slots 0–2 — `invoker_quas/wex/exort` level 0; slots 3–4 — `invoker_empty1/2`; slot 5 — `invoker_invoke` level 1; 6 — `plus_high_five`; 7 — `plus_guild_banner`.

Для Invoker ключ slot не является стабильной identity. В GAME `ability3` принимал девять разных имён: `alacrity`, `chaos_meteor`, `cold_snap`, `deafening_blast`, `emp`, `forge_spirit`, `ghost_walk`, `sun_strike`, `tornado`; `ability4` — тот же динамический набор плюс `invoker_empty1`. Например в финале slot 3 — Chaos Meteor с cooldown 32/51, slot 4 — Tornado.

Во время GAME `previously` фиксировал: 200 смен имени ability, 1 385 cooldown changes, 126 `can_cast`, 24 level changes, 230 `max_cooldown`, один passive transition.

**Direct:** текущий набор локальных кнопок, levels, cooldowns, castability, active/passive/ultimate flags.  
**Derived:** skill build, availability windows, invocation sequence Invoker, cooldown efficiency, missed-cast opportunity heuristics.  
**Постоянное:** только identity постоянных slots; invoked slots динамичны.  
**State-specific:** секция пустая до PRE_GAME.  
**Unavailable:** mana cost, cast range, charges, damage/effect values, cast events, target, channel duration, modifier effects, enemy/allied abilities. `can_cast=false` не объясняет причину.

**Coach:** можно давать локальные cooldown/combo prompts и анализ skill build. Для понимания механики и чисел нужен внешний patch-aware ability catalog.

---

## 6. Items и инвентарь

### Shape контейнера

Секция всегда нормализована в 23 позиции после PRE_GAME:

- `slot0`…`slot8` — 9 основных/backpack позиций;
- `stash0`…`stash5` — 6 stash;
- `teleport0` — TP;
- `neutral0`, `neutral1` — neutral item и enhancement;
- `preserved_neutral6`…`preserved_neutral10` — 5 preserved neutral slots.

Пустая позиция обычно представлена явно: `{"name":"empty"}`.

### Shape item entry

| Поле | Тип | Примечание |
|---|---|---|
| `name` | string | internal Valve name |
| `purchaser` | number/integer | для local items наблюдалось 4 |
| `item_level` | number/integer | присутствует не у всех |
| `can_cast` | boolean | текущая castability |
| `cooldown`, `max_cooldown` | number | не у всех |
| `passive` | boolean | не у всех |
| `item_charges`, `charges` | number | когда оба есть, равны во всех 2 413 наблюдениях |

Финальная сборка:

```text
slot0 hurricane_pike     slot1 mjollnir       slot2 manta
slot3 travel_boots_2    slot4 devastator     slot5 greater_crit
teleport0 tpscroll (6)
neutral0 giant_maul     neutral1 enhancement_vampiric
```

В dataset встречено 52 имени, включая `empty`: стартовые компоненты (`tango`, `circlet`, `branches`), промежуточные (`maelstrom`, `force_staff`, `yasha`, `lesser_crit`), финальные items, TP, shard, Moon Shard и neutral/enhancement. Полный observed name set:

```text
empty, item_aghanims_shard, item_blade_of_alacrity, item_blitz_knuckles,
item_boots, item_bracer, item_branches, item_chainmail, item_circlet,
item_demon_edge, item_devastator, item_diadem, item_dragon_lance,
item_enhancement_mystical, item_enhancement_vampiric, item_fluffy_hat,
item_force_staff, item_gauntlets, item_giant_maul, item_gloves,
item_greater_crit, item_hurricane_pike, item_hyperstone, item_javelin,
item_lesser_crit, item_maelstrom, item_manta, item_mithril_hammer,
item_mjollnir, item_moon_shard, item_mystic_staff, item_oblivion_staff,
item_occult_bracelet, item_orb_of_venom, item_power_treads,
item_recipe_bracer, item_recipe_hurricane_pike, item_recipe_manta,
item_recipe_witch_blade, item_recipe_wraith_band, item_robe,
item_serrated_shiv, item_slippers, item_sobi_mask, item_staff_of_wizardry,
item_tango, item_tpscroll, item_travel_boots, item_travel_boots_2,
item_witch_blade, item_wraith_band, item_yasha
```

Во время GAME были 106 changes имени слота, 327 cooldown, 31 `can_cast`, 16 charges, 43 item level, 38 purchaser. Смена slot может означать покупку, перенос, combine, consume, drop/pickup; без instance ID различить их по одному snapshot нельзя.

**Direct:** текущий local inventory, stash/backpack/TP/neutral positions, charges/cooldowns.  
**Derived:** item build timeline, combine timings, consumable use, backpack swaps, local power spikes; purchase event correlation повышает уверенность.  
**State-specific:** пусто до PRE_GAME.  
**Unavailable:** чужие inventories, item instance ID, цена/рецепт/stats, shop/source, ownership history, ground items, sell/disassemble marker. Top-level `neutralitems` пуст, но local neutral slots заполнены.

---

## 7. Buildings

Container shape:

```json
{
  "radiant": {
    "dota_goodguys_tower1_top": {"health":1800,"max_health":1800},
    "...": {"health":0,"max_health":2500}
  }
}
```

Доступны только 18 строений **локальной команды**:

- tower1/2/3 для top/mid/bot — 9;
- tower4_top/tower4_bot — 2;
- melee/range barracks top/mid/bot — 6;
- fort/Ancient — 1.

Initial max HP: T1 1800, T2/T3 2500, T4 2600, melee rax 2200, ranged rax 1300, fort 4500. В GAME зафиксировано 262 уменьшения HP и ни одного увеличения. После уничтожения ключ обычно исчезает: 18 записей → 1 fort с HP 0; в POST исчезает и он.

**Direct:** точный current/max HP своих строений и факт исчезновения.  
**Derived:** damage episodes, structure survival timeline, lane/base pressure по HP delta, destruction time; состояние вражеских structures можно приблизительно получить из minimap/events, но без HP.  
**State-specific:** впервые полная секция в WAIT_FOR_MAP; после конца удаляется.  
**Unavailable:** enemy building health, invulnerability/backdoor protection, glyph state/cooldown, attacker, damage source, armor.

**Coach:** надёжные alerts о damage своих towers/rax/Ancient и оценка потерянных строений. Для глобального objective planner нужно объединять buildings + minimap disappearance + tower/rax events.

---

## 8. Wearables

Shape: object `wearableN -> number/integer cosmetic definition ID`. После выбора героя было 19 ключей (`wearable0`…`15`, `25`…`27`), перед PRE_GAME стало 22 (`wearable0`…`21`); затем значения стабильны.

Пример:

```json
{"wearable0":99,"wearable1":89,"wearable2":98,"wearable3":48,
 "wearable4":100,"wearable5":8626,"wearable6":305,"wearable7":8632}
```

**Direct:** набор числовых cosmetic IDs local hero.  
**Derived:** названия/slots/rarity только через внешний cosmetics catalog.  
**Постоянное:** после загрузки карты.  
**State-specific:** появляется частично после hero selection.  
**Unavailable:** human-readable names и gameplay effects. Для AI Coach почти не имеет ценности, кроме профилирования/визуализации.

---

## 9. Minimap

### Контейнер и union shape

`minimap` — object с ключами `o0`, `o1`, …, всегда непрерывными до `oN`. Это **псевдомассив текущих render markers**, а не dictionary стабильных сущностей. Номер `oN` меняет смысл при переиндексации.

Union всех встреченных полей:

| Поле | Тип | Назначение по данным |
|---|---|---|
| `image` | string | тип minimap icon |
| `name` | string | display/hero marker name у части записей |
| `unitname` | string | internal unit/building name |
| `team` | number/integer | 2 Radiant, 3 Dire, 4 neutral, 5 neutral/static service; 0 у placeholder |
| `xpos`, `ypos` | number | world coordinates |
| `yaw` | number | направление/ориентация |
| `visionrange` | number | vision radius marker, не гарантированно текущая фактическая видимость |
| `eventduration`, `remainingtime` | number | временные minimap markers |

Observed shapes:

- persistent marker: `image, team, unitname, visionrange, xpos, ypos, yaw`;
- hero-like marker иногда дополнительно `name`;
- timed marker: `eventduration, remainingtime, xpos, ypos`, иногда `image`;
- timed named unit marker содержит все поля.

Пример сущности:

```json
{
  "image":"minimap_ward_obs",
  "team":2,
  "unitname":"npc_dota_observer_wards",
  "visionrange":1600,
  "xpos":-1248,"ypos":768,"yaw":270
}
```

Полный набор `image`:

```text
null, minimap_ancient, minimap_controlledcreep, minimap_courier_flying,
minimap_creep, minimap_death, minimap_enemyicon, minimap_herocircle,
minimap_herocircle_self, minimap_heroimage, minimap_heroinvis,
minimap_lotuspool, minimap_miscbuilding, minimap_ping_baseattacked,
minimap_ping_shop, minimap_ping_teleporting, minimap_plaincircle,
minimap_racks45, minimap_racks90, minimap_secretshop, minimap_shop,
minimap_siege, minimap_tower45, minimap_tower90, minimap_underlord_portal,
minimap_ward_invis, minimap_ward_obs, minimap_watcher
```

### Полный каталог observed entity types

#### Герои

Radiant roster: `npc_dota_hero_bounty_hunter`, `invoker`, `lycan`, `silencer`, `vengefulspirit`. Dire roster: `dark_seer`, `jakiro`, `luna`, `pugna`, `windrunner`. Дополнительно во всех GAME frames есть `npc_dota_hero_dazzle` team 2, `minimap_plaincircle`, координаты `(0,0)`, без `name`; это подтверждённый marker, но его роль как dummy/placeholder — вывод по поведению, не гарантированная семантика.

Hero icons: `minimap_herocircle`, `_self`, `minimap_heroinvis`, `minimap_enemyicon`, `minimap_heroimage`; временно также `minimap_ping_teleporting`.

#### Lane creeps

Radiant:

```text
npc_dota_creep_goodguys_melee
npc_dota_creep_goodguys_melee_upgraded
npc_dota_creep_goodguys_ranged
npc_dota_creep_goodguys_ranged_upgraded
npc_dota_creep_goodguys_flagbearer
npc_dota_creep_goodguys_flagbearer_upgraded
npc_dota_goodguys_siege
npc_dota_goodguys_siege_upgraded
```

Dire дополнительно содержит mega variants:

```text
npc_dota_creep_badguys_melee[/_upgraded/_upgraded_mega]
npc_dota_creep_badguys_ranged[/_upgraded/_upgraded_mega]
npc_dota_creep_badguys_flagbearer[/_upgraded/_upgraded_mega]
npc_dota_badguys_siege[/_upgraded/_upgraded_mega]
```

#### Нейтралы

Все встреченные unit names:

```text
alpha_wolf, ancient_frog, ancient_frog_mage, black_dragon, black_drake,
centaur_khan, centaur_outrunner, dark_troll, dark_troll_warlord,
dark_troll_skeleton_warrior, enraged_wildkin, fel_beast,
forest_troll_berserker, forest_troll_high_priest, froglet, froglet_mage,
frostbitten_golem, ghost, giant_wolf, gnoll_assassin, granite_golem,
grown_frog, grown_frog_mage, harpy_scout, harpy_storm, ice_shaman,
kobold, kobold_taskmaster, kobold_tunneler, mud_golem, mud_golem_split,
ogre_magi, ogre_mauler, polar_furbolg_champion,
polar_furbolg_ursa_warrior, prowler_acolyte, prowler_shaman, rock_golem,
satyr_hellcaller, satyr_soulstealer, satyr_trickster, warpine_raider,
wildkin
```

Они имеют `team:4`, обычно `minimap_creep` или `minimap_ancient`, координаты/yaw/vision. Наличие конкретного camp/spawn box не дано готовым полем.

#### Summons и прочие units

```text
npc_dota_invoker_forged_spirit
npc_dota_lycan_wolf1, wolf2, wolf3, wolf4
npc_dota_pugna_nether_ward
npc_dota_wisp_spirit
npc_dota_miniboss
npc_dota_thinker
```

Изображения: `minimap_controlledcreep`, `minimap_creep`, `minimap_plaincircle`. `thinker` очень частый (5 383 entries) и не должен автоматически считаться боевым юнитом.

#### Structures и static services

- обе стороны: fort, T1/T2/T3 по трём линиям, две T4, melee/ranged barracks;
- fillers: `npc_dota_goodguys_fillers`, `npc_dota_badguys_fillers`;
- fountains/static markers: `dota_fountain` (`minimap_ward_obs`, teams 2/3), `ent_dota_halloffame` (`minimap_plaincircle`, teams 2/3), `npc_dota_xp_fountain` (`minimap_plaincircle`, team 4);
- shops: markers `minimap_shop`, `minimap_secretshop`, часто без `unitname`;
- Twin Gates: `npc_dota_unit_twin_gate`, icon `minimap_underlord_portal`, team 4;
- Watchers: `npc_dota_watch_tower`, icon `minimap_miscbuilding`, team 2/3; `npc_dota_lantern`, icon `minimap_watcher`, team 5;
- Lotus Pools: `npc_dota_lotus_pool`, icon `minimap_lotuspool`, team 4.

#### Roshan, couriers, wards

- `npc_dota_roshan`, team 4, `minimap_creep`;
- `npc_dota_courier`, teams 2/3, `minimap_courier_flying` или `minimap_plaincircle`;
- `npc_dota_observer_wards`, `minimap_ward_obs`;
- `npc_dota_sentry_wards`, `minimap_ward_invis`.

#### Временные minimap events

`minimap_death`, `minimap_ping_baseattacked`, `minimap_ping_shop`, `minimap_ping_teleporting` и markers без `image`, но с `eventduration/remainingtime/x/y`. Они подходят для UI/event attention features. Семантика marker без image неизвестна.

### Динамика и ограничения minimap

В GAME размер объекта 121–186 entries, в POST скачок до 245–252. Позиции/yaw меняются у units; buildings/services стабильны; уничтоженные structures исчезают; enemy-controlled markers появляются только при доступной информации. Нет stable entity ID, health, alive, owner player, selected target, velocity, attack state или lane label.

**Direct:** текущий набор видимых markers, тип/unit name/icon/team/position/yaw/vision range.  
**Derived:** trajectories, last seen, lane-wave clusters, approximate movement direction, nearby enemy/object counts, structure state, ward sighting history, map-control features.  
**Постоянное:** static coordinates и names, пока объект существует; но ключ `oN` не постоянен.  
**State-specific:** до map load minimap очень неполон; runtime каталог meaningful с WAIT_FOR_MAP/PRE/GAME.  
**Unavailable:** reliable entity identity, HP/mana, individual ownership, exact fog state/grid, attack/aggro/target, invisibility detection reason.

---

## 9.1 Hero visibility

### Кто появляется

Все десять реальных героев roster появляются в minimap. Пять Radiant heroes имеют persistent primary marker каждый из 2 005 GAME snapshots. Их icon может меняться на `minimap_heroinvis`, но marker не исчезает:

| Союзник | Primary visible snapshots | Особенность |
|---|---:|---|
| Bounty Hunter | 2 005 | circle 1 439, heroinvis 566 |
| Invoker (self) | 2 005 | self 1 695, heroinvis 310 |
| Lycan | 2 005 | circle 1 973, heroinvis 32 |
| Silencer | 2 005 | circle 1 848, heroinvis 157 |
| Vengeful Spirit | 2 005 | circle 2 005; много дополнительных copies |

Враги действительно исчезают:

| Враг | Snapshot с primary marker | Доля GAME | Visible intervals | Максимальный разрыв по `clock_time` |
|---|---:|---:|---:|---:|
| Dark Seer | 1 017 | 50.7% | 86 | 153 s |
| Jakiro | 952 | 47.4% | 86 | 101 s |
| Luna | 1 009 | 50.3% | 87 | 99 s |
| Pugna | 1 023 | 51.0% | 106 | 119 s |
| Windranger | 818 | 40.7% | 95 | 116 s |

Одновременно видимых primary enemy heroes:

| Количество | Frames |
|---:|---:|
| 0 | 173 |
| 1 | 381 |
| 2 | 485 |
| 3 | 532 |
| 4 | 298 |
| 5 | 136 |

### Last seen и дубликаты

**Last seen построить можно:** для каждого enemy hero хранить последние coordinates, `clock_time/provider.timestamp`, yaw и confidence. Возраст last seen — разность текущего времени и последнего primary marker.

Но identity tracking не идеален. Дубликаты реально есть:

- Vengeful Spirit: до 11 markers в одном frame, duplicate frames 1 047;
- Invoker: до 4, duplicate frames 139;
- Lycan: до 3, duplicate frames 83;
- Luna: до 3, duplicate frames 113;
- allied hero unit names иногда появляются как `team:3 + minimap_enemyicon` (например Invoker 114 entries, Venge 93), что согласуется с illusions/copies;
- также есть benign teleport ping markers.

В raw нет `is_illusion`, owner или entity ID. Поэтому **наличие copies подтверждено**, а точная классификация каждого duplicate как illusion/clone/ping неизвестна. Для tracker следует выбирать primary marker по сочетанию expected team + primary icon + temporal continuity, а остальные хранить как `possible_copy`.

**Coach:** confirmed ally positioning, enemy visibility/last-seen timers и missing-enemy alerts; derived gank risk и map spread. Нельзя гарантированно отличить настоящего героя от каждой иллюзии.

---

## 9.2 Lane creeps и модель волн

В каждом GAME snapshot есть Radiant lane creeps: min 12, max 52, average 29.82. Dire creeps: min 0, max 32, average 11.66; в 24 frames не видно ни одного. Большая асимметрия означает fog-limited enemy coverage.

Доступно для каждого видимого creep: melee/ranged/flagbearer/siege и upgraded/mega variant, team, `(x,y)`, yaw, vision range. Этого достаточно для:

- кластеризации по top/mid/bot через geometry карты;
- оценки centroid/front/back каждой видимой волны;
- направления по yaw и delta positions;
- приблизительного visible wave size/composition;
- давления: относительное положение opposing fronts, число видимых creeps, близость к tower/rax.

Надёжный pipeline: map-match в lane polyline → spatial clustering → temporal Hungarian/nearest-neighbor association → агрегаты per lane. Давление лучше считать как confidence-weighted feature, а не точный count.

Недоступны creep HP, target/aggro, attack timing, spawn wave ID, buff/aura, exact lane, gold/XP, last-hit attribution. Вражеский размер волны систематически недооценён под fog; `oN` нельзя использовать как ID. Поэтому **позиция и направление видимой части волн — Derived**, а точный полный размер enemy wave — Unknown.

---

## 9.3 Wards

Observed ward shape — стандартный minimap marker с type/team/coordinates/yaw/vision range. За GAME:

| Ward | Team | Unique exact positions | Max одновременно | Total entries | Frames без marker |
|---|---:|---:|---:|---:|---:|
| Observer | Radiant 2 | 12 | 4 | 2 567 | 525 |
| Observer | Dire 3 | 8 | 1 | 45 | 1 960 |
| Sentry | Radiant 2 | 13 | 5 | 2 882 | 421 |
| Sentry | Dire 3 | 11 | 1 | 77 | 1 928 |

Союзные ward coordinates стабильны в длинных contiguous intervals. Поэтому их первое появление — хороший derived placement time, исчезновение — removal/expiration time. Для врагов первое появление означает лишь **first sight**, а исчезновение — lost vision либо removal; placement/destruction из minimap не доказуемы.

В event stream есть 5 уникальных `CHAT_MESSAGE_OBSERVER_WARD_KILLED` и 8 `CHAT_MESSAGE_SENTRY_WARD_KILLED`. Например:

```json
{"type":"CHAT_MESSAGE_OBSERVER_WARD_KILLED","value":102,
 "playerid1":3,"playerid2":3,"time":32.36667}
```

У событий нет координат; семантика `value/playerid1/playerid2` для ward kills не подтверждается этим матчем. Корреляция event time с исчезновением marker может повысить confidence, но не даёт строгого matching.

**Можно построить:** точную-ish историю своих ward locations, lifespan intervals, coverage map; историю sightings вражеских wards; отдельную global kill-event timeline.  
**Нельзя:** точно узнать enemy placement time, owner, ward HP, expiration vs kill для каждого marker, killer/ward mapping без дополнительной проверки.

---

## 10. Events

### Container и lifecycle

`events` — array текущего snapshot, отсортированный от нового события к старому. Максимум 16. Это скользящее окно: 295 из 301 уникальных payload наблюдались примерно 28–31 s, ещё 6 — 7–27 s. После исчезновения событие не возвращается как история.

Всего после дедупликации exact payload:

| `event_type` | Уникальных |
|---|---:|
| `generic_event` | 284 |
| `bounty_rune_pickup` | 10 |
| `chat_message` | 5 |
| `roshan_killed` | 1 |
| `aegis_picked_up` | 1 |

Union outer fields:

```text
game_time:number, event_type:string, data:string,
player_id:number, channel_type:number, message:string,
team:string, bounty_value:number, team_gold:number,
killed_by_team:string, killer_player_id:number,
snatched:boolean
```

`generic_event.data` — JSON, сериализованный **в строку**; его нужно распарсить второй раз. Inner `time` — float. В GAME `outer.game_time - inner.time` лежит примерно в диапазоне 127.60…128.63 s, то есть inner time соответствует match clock, outer — engine game time.

Для production event store нужен fingerprint как минимум `(event_type, normalized payload)`. Exact identical events теоретически могут произойти дважды, поэтому лучше добавлять first-seen provider timestamp и temporal episode; готового event ID нет.

### Все `generic_event.data.type`

| Type | Уникальных | Shape inner data |
|---|---:|---|
| `CHAT_MESSAGE_BARRACKS_KILL` | 8 | type, value/value2/value3, playerid1…6, time |
| `CHAT_MESSAGE_BUYBACK` | 10 | type, value, playerid1/2, time |
| `CHAT_MESSAGE_FIRSTBLOOD` | 1 | short shape как buyback |
| `CHAT_MESSAGE_GLYPH_USED` | 7 | short shape |
| `CHAT_MESSAGE_HERO_KILL` | 111 | full playerid1…6 + value/value2/value3 |
| `CHAT_MESSAGE_INTHEBAG` | 4 | short shape |
| `CHAT_MESSAGE_ITEM_PURCHASE` | 69 | short shape |
| `CHAT_MESSAGE_NEW_PLAYER_REMINDER` | 1 | short shape |
| `CHAT_MESSAGE_OBSERVER_WARD_KILLED` | 5 | short shape |
| `CHAT_MESSAGE_SENTRY_WARD_KILLED` | 8 | short shape |
| `CHAT_MESSAGE_STREAK_KILL` | 40 | full shape |
| `CHAT_MESSAGE_SUPER_CREEPS` | 1 | short shape |
| `CHAT_MESSAGE_TOWER_KILL` | 19 | full shape |

`playerid*` имеет type-dependent semantics. Нельзя один раз назвать `playerid1` «killer»: у hero kill это victim, у purchase — purchaser, у glyph это team code.

### Hero kills, streaks, towers, barracks, glyph

Hero kill example:

```json
{
  "type":"CHAT_MESSAGE_HERO_KILL","value":353,
  "playerid1":0,"playerid2":6,
  "playerid3":-1,"playerid4":-1,"playerid5":-1,"playerid6":-1,
  "value2":69,"value3":1,"time":149.200012
}
```

На всём матче проверено:

- для HERO_KILL `playerid1` — victim, `playerid2` — killer;
- local player ID — 4: `playerid1=4` встречается 10 раз и точно равно local deaths; `playerid2=4` — 7 раз и равно local kills;
- victims локального killer: ID 5×2, 6×1, 7×3, 9×1 — точно совпадают с финальным `kill_list`;
- ID 0–4 принадлежат Radiant, 5–9 Dire.

`playerid3…6` не являются простым списком assists: local player с 14 assists там не появляется соответствующим образом. Их смысл, как и `value/value2/value3`, остаётся Unknown без протокольной спецификации.

`CHAT_MESSAGE_TOWER_KILL` (19) и `BARRACKS_KILL` (8) дают время и numerical fields, но не содержат явный `unitname`/lane. Конкретное строение можно derived-сопоставлять по одновременному исчезновению minimap marker и, для своих, buildings key/HP. `CHAT_MESSAGE_SUPER_CREEPS` один раз подтверждает наступление mega-creep condition, но exact destroyed lanes надо восстанавливать отдельно.

`CHAT_MESSAGE_GLYPH_USED`: 7 событий. `playerid1` принимал только 2 или 3, что здесь однозначно соответствует team code, а не player ID. Времена: Radiant — 700.1, 1082.93, 1469.87, 2375.0; Dire — 1585.77, 1947.57, 2338.7. Можно строить team glyph history; current cooldown отсутствует.

### Bounty runes

10 `bounty_rune_pickup`; shape:

```json
{"game_time":...,"event_type":"bounty_rune_pickup",
 "player_id":...,"team":"radiant|dire",
 "bounty_value":...,"team_gold":...}
```

Это direct источник picker/team/reward/team gold для rune timeline. Координаты и rune spawn ID отсутствуют; их можно лишь приблизительно сопоставлять со временем/картой.

### Chat messages

5 событий:

```json
{"game_time":2548,"event_type":"chat_message",
 "player_id":8,"channel_type":11,"message":"gg"}
```

Доступны raw text, player ID и numeric channel. Наблюдались channel 11/12, но human-readable channel semantics dataset не доказывает. Это чувствительные пользовательские данные: Coach должен предусматривать opt-in, redaction и короткий retention.

**Events direct:** важные objective/combat/economy/chat notifications в течение короткого окна.  
**Derived:** полная история при online persistence, kill graph, team glyph/buyback/objective timelines, local purchase correlation.  
**Unavailable:** stable event ID, assists mapping, combat damage/heal log, spell casts, smoke, TP, rune types кроме bounty, creep kills, exact event subjects для tower/rax, semantic lookup для numerical values.

---

## 10.1 Item purchases — подробный разбор

69 уникальных `CHAT_MESSAGE_ITEM_PURCHASE`:

```json
{"type":"CHAT_MESSAGE_ITEM_PURCHASE","value":42,
 "playerid1":3,"playerid2":-1,"time":-41.6666641}
```

Распределение `playerid1`: ID 0 — 10, 1 — 16, 2 — 9, 3 — 25, 4 — 9. ID 5–9 отсутствуют.

Выводы:

1. События относятся **не только к local player**, а ко всей локальной/Radiant команде.
2. Enemy purchases в этом dataset не приходят.
3. `playerid1` — team-local/global match player ID 0–4; для local он равен `team_slot=4`, не `player_slot=2`.
4. `playerid2` всегда −1 и информации здесь не добавляет.
5. `value` — внутренний numeric item definition ID. Это сильно подтверждается корреляцией всех девяти local событий с появлением завершённого предмета в inventory на следующем snapshot:

| Outer `game_time` | `value` | Item, появившийся у local player |
|---:|---:|---|
| 918 | 166 | `item_maelstrom` |
| 1119 | 102 | `item_force_staff` |
| 1160 | 263 | `item_hurricane_pike` |
| 1341 | 158 | `item_mjollnir` |
| 1566 | 1806 | `item_devastator` |
| 1672 | 141 | `item_greater_crit` |
| 1861 | 48 | `item_travel_boots` |
| 1998 | 147 | `item_manta` |
| 2311 | 220 | `item_travel_boots_2` |

Чтобы декодировать items других союзников, нужен внешний version-aware item ID catalog. В самом GSI события не содержат item name.

Поток неполон как ledger покупок: initial/component/stash changes наблюдаются без соответствующего event; вероятно, чат-событие сообщает только определённые покупки/готовые items. Поэтому нельзя считать число events равным числу shop transactions, а `value` — ценой (оно явно является ID, не price).

**Что строить:** allied major-item timing tracker; local exact build validation через inventory; team power-spike alerts.  
**Нельзя:** enemy item tracking, точный расход gold каждой покупки, shop location, sell/refund, все компоненты и transactions.

---

## 10.2 Buybacks — подробный разбор

10 уникальных `CHAT_MESSAGE_BUYBACK`, каждый имеет `value=0`, `playerid2=-1`:

| Inner time | `playerid1` | Derived team |
|---:|---:|---|
| 1747.833 | 0 | Radiant |
| 1865.667 | 7 | Dire |
| 2214.300 | 8 | Dire |
| 2258.833 | 0 | Radiant |
| 2261.467 | 1 | Radiant |
| 2286.767 | 5 | Dire |
| 2334.000 | 9 | Dire |
| 2348.233 | 6 | Dire |
| 2350.133 | 2 | Radiant |
| 2402.500 | 3 | Radiant |

Local ID 4 отсутствует; local `buyback_cooldown` весь матч 0. Следовательно, события точно включают buyback **других игроков**, причём обеих команд. Team определяется надёжно диапазоном ID: 0–4 Radiant, 5–9 Dire, проверенным kill/purchase данными.

**Можно построить:** append-only buyback history per player ID, team counts, approximate availability model с внешним cooldown rule.  
**Нельзя из raw:** цена чужого buyback, его current cooldown, remaining gold, hero name mapping непосредственно в event, forced/manual cause. Mapping player ID → hero можно derived получить из roster/events лишь с дополнительным надёжным roster source; этот файл не даёт явной таблицы десяти игроков.

---

## 11. League

Observed shape:

```json
{
  "league_id":0,
  "match_id":"8902657168",
  "selection_priority":{
    "selection_priority_rules":"manual",
    "previous_priority_team_id":0,
    "current_priority_team_id":0,
    "priority_team_choice":"invalid",
    "non_priority_team_choice":"invalid",
    "used_coin_toss":false
  }
}
```

Types: IDs number, match ID string, rules/choices strings, coin toss boolean. Значения постоянны и практически неинформативны (`league_id=0`). `selection_priority` удаляется на первом POST snapshot; league/match IDs остаются до выхода.

**Direct:** match ID и формальный selection-priority payload.  
**Unavailable:** реальная лига, tournament/team metadata, series, team names/logos, standings. Для этого матча Coach ничего полезного, кроме match correlation, не получает.

---

## 12. Draft

`draft` присутствует как `{}` во всех 2 125 snapshot. Нет picks, bans, order, reserve time или captain data.

Hero roster частично виден через minimap после strategy/showcase, а local pick — через hero, но это не draft provider. Из одного матча нельзя определить, пуст ли draft из-за non-Captains Mode, GSI config или provider implementation.

**Unavailable in this dataset:** draft.  
**Coach:** полноценный draft coach на этом потоке построить нельзя; нужен отдельный Captains Mode/league capture и/или game coordinator/replay API.

---

## 13. Roshan provider и объединённый Roshan/Aegis анализ

Top-level `roshan` всегда `{}` — специализированный provider не дал ни одного поля.

Minimap: `npc_dota_roshan`, team 4, icon `minimap_creep`, координаты `(-3194,2394)`. В GAME он виден только 16 frames, `game_time=2168…2198` (`clock_time=2039…2069`), плюс 8 POST frames. Это visibility marker, не постоянный authoritative Roshan state.

Events:

```json
{"game_time":1508,"event_type":"roshan_killed",
 "killed_by_team":"dire","killer_player_id":9}
{"game_time":1509,"event_type":"aegis_picked_up",
 "player_id":5,"snatched":false}
```

**Confirmed:** Roshan kill engine time, killing team, killer player ID; Aegis pickup time, carrier player ID и `snatched=false`; позже Roshan снова реально появляется как видимый marker.  
**Derived:** team objective timeline; time kill→Aegis pickup; approximate «Roshan alive/visible» interval; mapping IDs 5/9 to Dire.  
**Unknown:** точный respawn moment — Roshan мог возродиться до first sight; был ли он невидим из-за fog; точная pit semantics координаты.  
**Unavailable:** HP, max HP, attack state, respawn timer/range, second pit state, drops кроме Aegis, Aegis expiry/drop/deny, current carrier after transfer, Roshan damage contributors/rewards.

**Coach:** objective event alerts, Aegis carrier/team memory, post-kill timer window и проверка Roshan sightings. Нельзя показывать точный HP или guaranteed respawn countdown из этих raw данных.

---

## 14. Couriers provider и minimap couriers

Top-level `couriers` всегда `{}`.

Minimap даёт `npc_dota_courier` с team, coordinates, yaw, vision range 200 и icon `minimap_courier_flying` либо `minimap_plaincircle`.

В GAME:

- Radiant: ровно 5 courier markers каждый frame — один flying icon и четыре plaincircle (в сумме 10 025 entries);
- Dire: 0–1 видимый courier, всего 61 frames; отсутствует в 1 944 frames.

Это подтверждает доступ к текущим позициям набора своих couriers и fog-limited sightings enemy courier. Но без ID нельзя строго сопоставить пять markers конкретным игрокам или сохранять identity при пересечении trajectories.

**Derived:** own courier spatial tracking, courier exposure/danger proximity, approximate route and enemy last seen.  
**Unavailable:** owner/player, inventory, health/alive, speed/state, delivery target, ability/cooldown, death/respawn events, item cargo. Enemy courier history неполна из-за fog.

---

## 15. Neutral items provider

Top-level `neutralitems` всегда `{}`. При этом в local `items` доступны:

- `neutral0`: сам neutral item, например финальный `item_giant_maul`;
- `neutral1`: enhancement, финальный `item_enhancement_vampiric`;
- `preserved_neutral6…10`;
- ранее встречались `item_occult_bracelet`, `item_serrated_shiv`, `item_enhancement_mystical`.

**Direct:** только local equipped/preserved neutral items через inventory.  
**Derived:** local neutral progression/swap timing.  
**Unavailable:** team neutral stash, drop/discovery events, choices всех игроков, tiers/tokens готовыми полями, чужие neutral items. Нужен внешний item catalog для tier/stats.

---

## 16. `previously`

`previously` — sparse delta с предыдущими значениями изменившихся путей. Пример концептуально:

```json
{"previously":{"hero":{"health":692},"map":{"game_time":128}}}
```

Проверка non-event scalar paths: 562 788 previous values; 562 781 точно равны значению того же пути в предыдущем snapshot. Семь исключений — не ошибочные values, а whole-section removal markers `true` для `map`, `hero`, `abilities`, `items`, `buildings`, `wearables`, `minimap` при выходе из матча.

Особенности:

- при выборе героя `previously.hero.id=0`, а новые `facet/name/wearables` идут в `added`;
- при переходе к PRE_GAME `previously` отражает старый state, а runtime hero/abilities/items добавляются;
- при POST удаление `league.selection_priority` отражено старым объектом;
- event delta использует pseudo-path `events.event`, а не индекс массива;
- minimap delta по `oN` синтаксически верна, но `oN` не является entity identity.

**Direct:** old value для change notification.  
**Derived:** efficient field-level changes и transition log.  
**Ограничение:** current top-level snapshot остаётся authoritative; нельзя reconstruct state только из `previously`, и нельзя трекать minimap entity по пути.

---

## 17. `added`

`added` — sparse marker новых путей, обычно leaf value `true`. Найдено 10 194 markers; во всех случаях путь отсутствовал в предыдущем snapshot и присутствует в текущем.

Примеры появления:

- после hero selection: `hero.facet`, `hero.name`, новые wearables, minimap markers;
- на PRE_GAME: полные runtime hero fields, `ability0…7`, 23 item positions, дополнительные wearables;
- при появлении minimap entries — `minimap.oN...`.

**Direct:** факт появления JSON path.  
**Derived:** schema/lifecycle transitions, cold-start initialization.  
**Ограничение:** `added.minimap.oN` — новый array position, не обязательно новая игровая сущность; events и pseudo-arrays требуют специальных adapters.

---

## Итоговая матрица возможностей

### 1. Confirmed — напрямую доступны

- state lifecycle, match ID, clocks, day/night flag, scores, winner;
- transport timestamp/provider metadata;
- полное локальное player/hero состояние из перечисленных fields;
- local position, HP/mana, death timer, status booleans, buyback price/cooldown;
- local abilities/cooldowns/levels/castability;
- local inventory/stash/backpack/TP/neutral items и charges/cooldowns;
- HP и max HP всех своих строений;
- current minimap markers: type/team/unitname/icon/position/yaw/vision range;
- все пять allied hero primary markers во всех GAME frames;
- fog-limited enemy hero/creep/courier/ward markers;
- lane creep subtype и позиции видимой части волн;
- observer/sentry markers и координаты;
- events: kills/streaks, towers/rax, glyph, buyback, allied item purchases, ward kills, bounty runes, chat, Roshan kill, Aegis pickup;
- buybacks всех игроков, не только local;
- purchase events всей local team, не enemy team;
- `previously`/`added` field deltas;
- cosmetics IDs local hero.

### 2. Derived — надёжно или с обозначенной confidence

- собственная полная event history при realtime persistence/dedup;
- mapping match player IDs: 0–4 Radiant, 5–9 Dire; local ID = team slot 4;
- kill/death history и victim counts; team kill graph;
- allied major-item timings; local `value -> item_name` correlation;
- enemy hero last seen, missing duration и last known position;
- movement trajectories/speed из timestamped positions;
- visible lane-wave centroid/front/direction/composition и pressure score;
- own ward placement/removal intervals; enemy ward sightings;
- own building damage/destruction timeline;
- objective timeline Roshan/Aegis/towers/rax/glyph/buybacks;
- local farm/economy windows, spend deltas, skill/item/talent progression;
- ally spread, proximity, gank/objective risk features;
- static map catalog и approximate lane/camp/object geometry через внешний map model.

Derived features должны хранить confidence: `exact` для local stats/events, `visible_only` для enemy minimap, `probabilistic_identity` для duplicate/courier/creep tracking.

### 3. Unknown — этот dataset не позволяет выбрать интерпретацию

- универсальная семантика `playerid3…6`, `value2/value3` в full generic events;
- точный смысл `value/playerid*` у ward-kill/tower/rax messages;
- human-readable `channel_type` 11/12;
- каждый ли hero duplicate является illusion, clone или UI marker;
- точный момент enemy ward placement/destruction;
- полный размер/состав enemy lane wave под fog;
- точный Roshan respawn time и причина его появления/исчезновения;
- стабильная identity/owner каждого courier;
- поведение данных при pause, disconnect, smoke, spell immunity, break, Aghanim's Scepter;
- почему `draft/roshan/couriers/neutralitems` пусты: режим, GSI config или реализация;
- действительно ли матч Turbo по raw payload — прямого поля нет.

### 4. Unavailable in this dataset

- game mode/lobby type, rank/MMR, role/lane, server/region;
- явная таблица всех 10 players с hero mapping, names и полными stats;
- enemy/allied non-local hero HP/mana/level/items/abilities/cooldowns/net worth;
- minimap stable entity IDs, unit HP, owner, target, attack/aggro/action state;
- combat log: damage, heal, spell cast, item cast, source/target;
- exact fog grid/high-ground/true-sight state;
- building state effects: glyph/backdoor/invulnerability;
- item prices/recipes/stats и complete transaction ledger;
- draft picks/bans/order/reserve time;
- populated Roshan/couriers/neutralitems providers;
- exact Roshan HP/timer/drop lifecycle и Aegis expiry/drop;
- courier inventory/health/owner/death/delivery;
- team neutral stash/drops;
- reliable illusion flag;
- ready-made lane-wave IDs/pressure.

---

## Что реально можно построить как Dota 2 AI Coach

### Высокая надёжность

- local live HUD intelligence: resource, cooldown, disable, buyback, inventory и skill/item timings;
- farm/economy coach: LH/min, recent farm, gold risk, purchase/power-spike alerts;
- objective/event memory: kills, buybacks, glyphs, towers/rax, Roshan/Aegis, bounty runes;
- own-base defense alerts по building HP delta;
- ally positioning и split detection;
- post-game timeline для локального игрока.

### Полезно, но probabilistic

- enemy last-seen/missing/gank-risk;
- lane pressure и видимые wave fronts;
- ward coverage/history и deward opportunity;
- enemy courier/ward/Roshan sightings;
- illusion/copy-aware hero tracker;
- team item timing по purchase events.

### Нельзя обещать на этих данных

- omniscient enemy tracking;
- точный teamfight damage/heal analysis;
- полные builds/net worth/cooldowns всех игроков;
- точный draft coach;
- точный Roshan HP/respawn и enemy ward lifecycle;
- deterministic lane simulation без внешней карты и fog uncertainty.

## Какие записи нужны, чтобы закрыть Unknown

1. **Одинаковый матч с двумя GSI clients, по одному на каждой команде.** Сравнить enemy/ally minimap, purchase и ward visibility; подтвердить team filtering.
2. **Spectator/replay GSI того же матча.** Проверить, исчезает ли fog filtering и появляются ли чужие inventories/stats.
3. **Контролируемый lobby с 10 подписанными игроками.** По очереди: kill, assist, streak, suicide/neutral death, deny, tower/rax kill. Это декодирует `playerid3…6`, `value*`.
4. **Покупочный сценарий.** Каждый player покупает заранее известный список: component, consumable, recipe, secret-shop item, sell/refund/disassemble, courier purchase, neutral transfer. Так строится item-ID dictionary и определяется completeness событий.
5. **Ward scenario под vision/no vision.** Observer/sentry placement, natural expiration, enemy destruction, deny, gem/true sight, несколько wards в одной точке. Нужен ground truth video/log.
6. **Illusion/clone scenario.** Manta, illusion rune, Doppelganger, Tempest Double, Meepo, Arc Warden, Venge interactions, dominated units; проверить icon/team/unitname patterns.
7. **Roshan lab.** Vision/no vision, оба pits/день-ночь, несколько kills, respawn observation, Aegis pickup/snatch/drop/expire/deny, Cheese/Shard/Banner drops.
8. **Courier lab.** Все 10 couriers, ground/flying state, cargo, delivery, death/respawn, enemy sight/lost sight, пересечение trajectories.
9. **Lane lab.** Длительный матч с mega creeps обеих сторон, barracks regeneration/deny cases, controlled blocking/pulling, fog observations с обеих сторон; сопоставить с replay entity IDs/HP.
10. **Captains Mode/league match.** Picks, bans, reserve time, captain, selection priority и coin toss — проверить `draft`/`league`.
11. **Neutral item lifecycle.** Token/drop/choice/equip/stash/transfer для каждого tier, с несколькими игроками.
12. **State edge cases.** Pause, reconnect, disconnect/abandon, remake, coach/spectator, custom game, bot match и обычный All Pick; сравнить shapes и доказать game-mode visibility.
13. **Status matrix local hero.** Smoke, magic immunity, break, silence, mute, hex, root/leash, channel, Aghanim's Scepter/Shard, death with/without buyback.
14. **Повышенная частота GSI.** Запись с минимальным buffer/throttle плюс packet timestamps, чтобы оценить точность trajectory, disable duration и transient events.

## Практический вывод

Лучший продукт на этом dataset — не «всевидящий аналитик», а **локальный state-aware Coach с собственной памятью**. Raw snapshot надёжен для локального героя и своей команды, event stream даёт глобальные high-level факты, а minimap — текущую наблюдаемую геометрию без identity/health. Если с самого начала моделировать fog, дубликаты и неполные events как uncertainty, данных достаточно для полезных подсказок по экономике, objectives, positioning, last seen, waves и wards. Если трактовать поток как replay telemetry, Coach будет систематически выдавать ложную точность.
