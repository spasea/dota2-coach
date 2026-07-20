# Dota 2 AI Coach — черновой план продукта

Статус: **Draft v0.3**  
Назначение: зафиксировать предварительный feature backlog и порядок разработки.  
Основа по данным: [`gsi_turbo_match_report.md`](./gsi_turbo_match_report.md).

## 1. Цель продукта

Создать AI-driven Coach для группы из 1–5 игроков одной команды Dota 2. На каждом ПК участника пати может работать отдельный GSI client. Coach не управляет героем и не автоматизирует действия игрока. Его задача:

- собирать законно предоставляемую Dota 2 GSI-информацию;
- объединять состояние подключённых игроков;
- обнаруживать важные игровые ситуации;
- объяснять риск, возможность и общий игровой принцип;
- предлагать несколько осмысленных вариантов решения;
- помогать игрокам формировать переносимые навыки;
- находить повторяющиеся ошибки после серии матчей.

Основная аудитория первой версии — игроки примерно 2–3k MMR, которые знают базовые механики, но непоследовательно связывают vision, waves, позиции, cooldowns, ресурсы и objectives в единое решение.

## 2. Принципы Coach

### 2.1. Coach обучает, а не играет

Не делать:

- управление мышью, клавиатурой или героем;
- micro-timing уровня «атакуй этого крипа через три секунды»;
- выбор конкретной цели способности в реальном времени;
- автоматическое применение предметов или способностей;
- утверждения о данных, которых GSI не предоставляет.

Делать:

- показывать наблюдаемые факты;
- объяснять причинно-следственную связь;
- называть риск или возможность;
- формулировать общий принцип;
- предлагать варианты действий;
- сохранять uncertainty и confidence.

### 2.2. Формат обучающей рекомендации

Каждая полная рекомендация состоит из:

```text
1. Наблюдение
2. Риск или возможность
3. Причина
4. Общий принцип
5. Варианты действий
6. Confidence и неизвестные данные
```

Пример:

> **Наблюдение:** четыре врага не видны 17 секунд, а рядом с top нет observer vision.  
> **Риск:** carry находится дальше всех от команды без готового TP.  
> **Почему:** ближайшая помощь находится в 11–15 секундах.  
> **Принцип:** глубокий farm безопасен при наличии информации, помощи или надёжного выхода; сейчас нет ни одного условия.  
> **Варианты:** закончить текущую волну и отойти, перейти к команде или сначала восстановить vision.  
> **Confidence:** высокий для союзных позиций, средний для маршрута невидимых врагов.

### 2.3. Уровни достоверности

Каждый факт или вывод должен иметь provenance:

```text
confirmed       — непосредственно из GSI;
derived_high    — надёжно вычислено;
derived_medium  — вероятностная модель;
user_reported   — сообщено игроком;
unknown         — информации недостаточно;
stale           — источник устарел.
```

Пример корректной формулировки при неполной пати:

> Среди трёх подключённых игроков нет Break. Inventory двух остальных союзников неизвестен.

Некорректно:

> У команды точно нет Break.

## 3. Что даёт количество подключённых клиентов

| GSI clients | Доступное подробное состояние |
|---:|---|
| 1 | Один local hero: HP/mana, cooldowns, abilities, inventory, gold, buyback, farm |
| 2–4 | Полное состояние соответствующей части пати; состояние остальных союзников частично |
| 5 | Практически полный operational state своей команды |
| Любое число | Только разрешённая командная информация о врагах; fog of war сохраняется |

Minimap и event streams клиентов одной команды в основном дублируются. Дополнительные клиенты дают прежде всего подробное local state новых союзников, а не дополнительную видимость врагов.

## 4. Общая архитектура

```text
GSI client на каждом ПК
          │
          ▼
Match/session aggregator
          │
          ├── Snapshot normalizer
          ├── Event store и deduplication
          ├── Minimap entity tracker
          ├── Roster detector
          └── Coverage/confidence model
          │
          ▼
Team state и derived feature engine
          │
          ├── Danger/last seen
          ├── Readiness/fight quality
          ├── Lane/role context и lane-specific advices
          ├── Waves/objectives
          ├── Vision/Roshan/buildings
          ├── Economy/buybacks
          └── Itemization/capability gaps
          │
          ▼
Recommendation policy и priority queue
          │
          ├── Rule/scoring engine
          ├── Patch-aware knowledge base
          ├── Explanation builder
          └── Anti-spam/conflict resolver
          │
          ▼
Discord voice + text + post-game review
```

LLM используется для понимания запроса и понятного объяснения. Факты, counter relationships, предметы и численные оценки должны поступать из GSI, derived engine и versioned knowledge base, а не из свободной генерации модели.

---

## 5. Core platform backlog

### CORE-01. Multi-client match aggregation — MVP

- группировка клиентов по `matchid`;
- связь Discord user ↔ Steam/account/team slot;
- синхронизация по `game_time` и provider timestamp;
- устранение дублирующихся events/minimap markers;
- detection reconnect и пропущенных snapshot;
- freshness каждого источника;
- current coverage: 1–5 clients.

### CORE-02. Snapshot normalization — MVP

- state-aware parsing optional GSI sections;
- нормализация abilities/items/minimap pseudo-arrays;
- authoritative current snapshot;
- специальная обработка `previously` и `added`;
- защита от частичных heartbeat snapshot до/после матча.

### CORE-03. Persistent event store — MVP

Сохранять и дедуплицировать:

- kills/streaks;
- buybacks;
- allied item purchases;
- tower/barracks/glyph;
- bounty runes;
- ward kills;
- Roshan/Aegis.

GSI `events` — скользящее окно, поэтому собственная история обязательна.

### CORE-04. Team roster detection — MVP

- пять союзных и пять вражеских героев;
- фиксация roster после strategy/pre-game;
- удаление minimap duplicates;
- фильтрация illusion/copy/ping markers;
- исключение placeholder heroes;
- возможность ручной коррекции.

### CORE-05. Minimap entity tracker — V1

- temporal association по unit name/team/position/yaw;
- separate confidence для heroes, creeps, wards, couriers и summons;
- last seen;
- запрет использования `oN` как stable entity ID;
- copy/illusion uncertainty.

### CORE-06. Patch-aware knowledge base — MVP для item advisor

- heroes/facets/abilities;
- item IDs, names, prices и recipes;
- capability tags;
- threat/counter relationships;
- role suitability;
- ограничения и prerequisites;
- явная версия патча.

### CORE-07. Confidence/provenance model — MVP

- confirmed/derived/user-reported/unknown/stale;
- completeness для каждого игрока;
- запрет категоричной формулировки при partial coverage;
- freshness thresholds для realtime-рекомендаций.

### CORE-08. Recommendation policy — MVP

- scoring рекомендаций;
- conflict resolution;
- suppress устаревших рекомендаций;
- cooldown повторов;
- выбор одной active team recommendation;
- хранение reasoning для команды `/why`.

### CORE-09. Lane and role state detector — V1

Для каждого подключённого игрока разделять:

```text
home_lane     — устойчивая/назначенная линия;
current_zone  — фактическая текущая область;
lane_state    — что игрок делает в контексте линии.
```

Определять по team side, точной траектории героя, внешней геометрии карты, lane creeps, towers, времени в области и proximity к lane partner. Поддерживаемые состояния:

```text
solo_laning
dual_laning
pulling_or_stacking
rune_movement
roaming
rotation
jungling
returning_to_lane
dead_or_respawning
unknown
```

Требования:

- hysteresis и минимальное stable time, чтобы короткий выход к camp не считался сменой линии;
- автоматическое распознавание lane swap;
- configured `role/expected_lane` используется как prior, но не блокирует фактическое определение;
- отдельный confidence для `home_lane`, `current_zone`, `lane_state` и partner detection;
- Radiant/Dire safe/offlane вычисляются относительно стороны команды, а не фиксированной географической метки.

---

## 6. Live coaching backlog

### LIVE-01. Match phase Coach — MVP

Использовать state и game clock для переключения режима:

- selection/strategy: roster и начальные matchup/item подсказки;
- pre-game: starting readiness;
- laning: personal resources и ранние timings;
- midgame: waves, grouping, vision и objectives;
- late game: buybacks, Roshan и high ground;
- post-game: summary без live alerts.

### LIVE-02. Enemy missing и last seen — MVP

- current visible enemy heroes;
- last known position/time/yaw;
- missing duration;
- confidence copy/illusion;
- потенциально опасные connected players;
- stale last-seen indication.

Голосовой пример:

> Четыре врага не видны 15 секунд. Верхняя линия опасна: там нет vision, ближайший союзник далеко.

### LIVE-03. Personal danger detector — MVP

Объединять:

- missing enemies;
- position относительно реки/structures;
- distance to allies;
- own vision;
- HP/mana;
- TP и escape cooldowns;
- направление waves.

Цель — объяснять, почему область безопасна или опасна, а не просто приказывать отойти.

### LIVE-04. Team readiness — MVP

Для подключённых игроков:

- alive/respawn;
- HP/mana;
- distance/proximity;
- key abilities;
- item cooldowns;
- TP;
- buyback.

Выводить coverage, если подключены не все пять игроков.

### LIVE-05. Fight quality evaluator — MVP

Классы:

```text
good_fight
conditional_fight
defensive_only
delay
avoid
unknown
```

Факторы:

- численность и расстояния;
- HP/mana;
- cooldown readiness;
- vision;
- own building pressure;
- waves;
- recent enemy deaths/buybacks;
- own buybacks.

### LIVE-06. Chain-feed prevention — MVP

- последовательные deaths;
- уменьшение численности;
- отступление surviving allies;
- приближение следующего игрока;
- невозможность восстановить общую драку.

Пример:

> Первый союзник уже погиб, остальные отходят. Подключение сейчас создаст вторую отдельную драку в меньшинстве.

### LIVE-07. Team formation — V1

- average/max ally distances;
- isolated players;
- frontline/backline gap;
- support вне save range;
- carry впереди initiator;
- слишком плотная backline formation;
- time-to-join estimate.

### LIVE-08. Cooldown coordination — V1

- readiness ключевых abilities/items;
- общее timing window;
- продолжение давления после расхода ресурсов;
- вероятный overlap abilities для post-game проверки.

GSI не показывает target/hit, поэтому overlap нельзя утверждать как факт.

### LIVE-09. Lane-wave state — V1

Для top/mid/bot:

- visible wave position/direction;
- composition;
- siege/flagbearer;
- approximate size;
- distance to structure;
- pressure score;
- confidence под fog of war.

### LIVE-10. Wave preparation for objectives — V1

- состояние sidelanes перед Roshan/tower/high ground;
- нужно ли сначала отпушить;
- заставляют ли waves врага показать героя;
- цена игнорирования собственной wave.

### LIVE-11. Own building defense — V1

- точный HP своих towers/rax/Ancient;
- начало и скорость потери HP;
- доступность connected defenders;
- defend/trade reasoning;
- suppress очевидного announcer-spam.

### LIVE-12. Post-fight objective conversion — V1

После выигранного эпизода оценивать:

- tower/rax;
- Roshan;
- deep vision;
- enemy jungle control;
- push waves;
- reset/heal;
- отсутствие безопасной цели.

### LIVE-13. High-ground checklist — V1

Проверять:

- Aegis;
- waves;
- team readiness;
- own buybacks;
- recent enemy buybacks;
- vision;
- HP/mana;
- key cooldowns;
- position всех подключённых союзников.

### LIVE-14. Roshan/Aegis Coach — V1

- Roshan kill history;
- Aegis carrier и `snatched`;
- приблизительное Aegis/respawn window;
- team readiness;
- vision на подходах;
- wave preparation;
- план после Roshan.

Не показывать точный HP или guaranteed respawn time: этих данных нет.

### LIVE-15. Vision coverage — V1

- свои observer/sentry positions;
- coverage относительно следующего objective;
- пустые области;
- overlapping wards;
- enemy ward sightings;
- ward kill history;
- отделение enemy first sight от placement time.

### LIVE-16. Buyback Coach — MVP

Для подключённых игроков:

- buyback cost/current gold;
- cooldown;
- reserve shortfall;
- эффект предполагаемой покупки на buyback readiness.

Для всех игроков:

- global buyback event history;
- team mapping 0–4/5–9;
- recent enemy buyback strategic value.

### LIVE-17. Personal economy Coach — V1

- LH/min и recent farm rate;
- GPM/XPM trend;
- gold buckets;
- approximate time to next item;
- buyback reserve;
- safe/unsafe farm context;
- item timing history.

### LIVE-18. Team farm distribution — V2

- два core в одной области;
- свободная безопасная wave;
- герой без TP на удалённой линии;
- вся команда в одной зоне без цели;
- распределение pressure/farm между connected players.

### LIVE-19. Personal item advisor — MVP по запросу

Запросы:

- «Что мне покупать?»
- «Что собрать против этого состава?»
- «Нужен ли defensive item?»
- «Какие есть альтернативы?»

Учитывать:

- enemy roster;
- свой hero/build;
- inventory/gold/GPM;
- team capability gaps;
- role/item suitability;
- buyback reserve;
- timing и opportunity cost;
- неизвестные enemy inventories.

Ответ:

- основной кандидат;
- функция предмета;
- почему сейчас;
- ETA;
- 1–2 альтернативы;
- ограничения/confidence.

### LIVE-20. Team capability gaps — V1

Проверять наличие:

```text
break
hard_disable
instant_disable
silence
disarm
anti_heal
dispel
strong_dispel
save
detection
accuracy
wave_clear
initiation
physical_mitigation
magic_mitigation
```

### LIVE-21. Team item buyer assignment — V1 при 2–5 клиентах

Выбирать покупателя по:

- suitability предмета герою;
- current gold и approximate net worth;
- GPM;
- имеющимся компонентам;
- текущему core timing;
- slot pressure;
- buyback reserve;
- позиции/возможности применить предмет;
- времени получения.

Exact net worth отсутствует; использовать estimate из gold + внешних цен inventory.

### LIVE-22. Neutral item reminders — V2

- пустой neutral slot;
- available preserved neutral;
- забытый enhancement;
- local swap перед objective.

Top-level team neutral provider пуст, поэтому функция ограничена подключёнными игроками.

### LIVE-23. Dynamic Ward Planner — V1, высокий приоритет

Рекомендация должна содержать не только точку, но и назначение vision:

```text
objective/защищаемая область;
рекомендуемая зона и точка;
безопасная альтернатива;
deadline или временное окно;
предпочтительный connected ward carrier;
placement risk;
причина и confidence.
```

Источники:

- свои observer/sentry coordinates и история их присутствия;
- coverage gaps и overlap существующих wards;
- sightings enemy wards и ward-kill events;
- позиции/trajectories союзников и last seen врагов;
- waves, towers, Roshan/Aegis, day/night и game clock;
- inventory и позиция подключённых игроков;
- patch-aware geometry: high grounds, ramps, gates, shops, Roshan entrances и common ward zones.

Классы рекомендаций:

- objective ward перед Roshan/tower/high ground;
- defensive ward после потери tower или смещения safe farm boundary;
- offensive ward после выигранной драки/захвата территории;
- farm-protection ward для planned farming area;
- replacement timing существующего vision;
- deward/check suggestion с явной неопределённостью.

Пример:

> Через 30–45 секунд команда будет играть вокруг Roshan. Текущие wards находятся снизу; нужен observer на верхнем подходе. Venge ближе всех и имеет безопасный путь. Наличие enemy sentry неизвестно.

Candidate scoring:

```text
ward_score =
    objective_relevance
  + coverage_gap
  + enemy_route_probability
  + protected_farm_value
  + expected_lifetime
  - overlap
  - placement_risk
  - travel_cost
```

Не утверждать точное расположение невидимого enemy ward/sentry или гарантированную безопасность точки.

### LIVE-24. Lane Matchup Plan — V1

Перед выходом на линии или по запросу формировать role-aware план:

- фактическая lane pair;
- потенциальная приоритетная цель;
- почему этот герой уязвим или важен;
- условия давления и отказа от него;
- own resource/item plan;
- опасные enemy capabilities из patch-aware knowledge base;
- значение wave, tower distance и lane partner readiness;
- неизвестные данные об enemy HP/mana/cooldowns.

Формат target priority всегда условный:

> Enemy support является удобной целью, когда отделяется от core и не защищён большой wave. Это не означает, что его нужно атаковать при каждом появлении.

### LIVE-25. Mid Coach — V1

Поддерживаемые советы:

- danger при missing enemy supports;
- позиция относительно своей/чужой стороны реки;
- собственные HP/mana/regen и defensive cooldowns;
- необходимость решить mid wave до rotation;
- scheduled rune preparation без утверждения конкретного rune spawn/pickup;
- rotation opportunity после подготовленной wave;
- tower pressure, когда enemy mid покинул линию;
- отказ от rotation, если своя tower/wave под угрозой;
- item/regen timing.

Пример personal critical:

> Дима, оба enemy support не видны. Следующую волну безопаснее играть со своей стороны реки.

GSI не даёт enemy mid HP/mana/cooldowns, поэтому Coach не оценивает гарантированный solo kill.

#### LIVE-25A. Mid Rotation Planner — V1

Назначение — не максимизировать количество gank attempts, а научить mid игрока отличать:

```text
«Я технически могу покинуть mid»
от
«На другой линии есть возможность,
которая ценнее сохранения mid».
```

Использовать термин `rotation`, а не только `gank`: результатом перемещения может быть kill, давление, защита tower, vision, forced reaction или подготовка objective.

##### A. Departure readiness: можно ли оставить mid

Учитывать:

- current/incoming mid wave position и direction;
- приблизительную стоимость пропущенной wave/XP;
- давление enemy mid на свою tower;
- HP/mana/regen подключённого mid;
- key abilities, item cooldowns и TP;
- свежесть enemy/support last seen;
- vision на выходе с линии;
- ближайший item/resource timing;
- scheduled rune timing без утверждения конкретного rune type/spawn.

Возможные состояния:

```text
ready_now
ready_after_current_wave
ready_after_resources
defensive_rotation_only
stay_mid
unknown
```

Пример отказа:

> Bottom выглядит доступным, но mid wave уже движется к твоей tower. Сначала реши линию — иначе rotation начинается с гарантированной потери ресурсов.

##### B. Candidate evaluation: `stay_mid`, `top`, `bottom`

Для каждой sidelane оценивать:

- freshness visible enemy positions;
- enemy overextension относительно своей tower;
- separation support/core;
- allied setup из patch-aware capability model;
- точную readiness подключённых lane partners;
- partial/unknown readiness неподключённых союзников;
- visible wave position/composition;
- travel distance и path risk;
- missing enemies и counter-rotation risk;
- enemy escape/mobility profile из knowledge base;
- возможное продолжение: kill, tower, defense, vision или objective.

```text
rotation_score =
    enemy_overextension
  + allied_setup
  + mid_readiness
  + lane_partner_readiness
  + favorable_wave_position
  + target_isolation
  + objective_followup
  + path_safety
  - travel_time
  - mid_wave_cost
  - enemy_tower_proximity
  - missing_enemy_counter_rotation
  - stale_target_position
  - enemy_escape_profile
```

Rotation рекомендуется только при достаточном преимуществе над `stay_mid`. Отсутствие хорошей rotation является полезным результатом, а не ошибкой detector.

##### C. Типы rotation opportunity

- enemy sidelane overextension;
- изолированный support;
- allied lane с готовым control/setup;
- защитная rotation под tower pressure;
- counter-rotation на движение enemy mid;
- rotation после level/item/ability power spike;
- rotation ради vision/map control/objective без обязательного kill;
- отказ от ответа enemy mid, если tower pressure/trade на mid ценнее.

##### D. Двухэтапная рекомендация

**Prepare:** за 10–20 секунд до возможного выхода:

> Дима, после следующей mid wave возможно окно bottom. Сохрани mana и сначала реши линию.

**Revalidate:** после решения wave, только если состояние существенно изменилось или требуется подтверждение:

> Окно bottom сохранилось: противники далеко от tower, союзная пара готова.

Или отмена:

> Bottom отступил, окно закрылось. Не трать время на продолжение rotation.

Не дублировать prepare/revalidate в voice без необходимости. Полный reasoning отправляется текстом.

##### E. Abort conditions

- targets ушли под tower или marker стал stale;
- allied lane pair отступила/потеряла readiness;
- подошла новая важная mid wave;
- enemy mid начал наносить значимый damage tower;
- исчезли дополнительные enemy heroes;
- mid потерял HP/mana/key cooldown;
- маршрут стал слишком долгим или опасным;
- потенциальная цель перемещения исчезла, а objective follow-up отсутствует.

Abort condition — часть исходной рекомендации, а не отдельная импровизация после начала движения.

##### F. Ограничения и confidence

GSI не даёт enemy HP, mana, cooldowns, items, levels и defensive charges. Поэтому Planner:

- оценивает позиционную возможность, но не гарантирует kill;
- снижает confidence при отсутствии GSI clients на destination lane;
- требует свежий enemy marker для proactive gank recommendation;
- не использует точный power-rune type/pickup без отдельного подтверждённого источника;
- предпочитает окно 10–20 секунд micro-командам на 1–3 секунды;
- явно перечисляет неизвестные enemy данные.

Ориентировочная confidence-модель:

| Coverage | Возможная уверенность |
|---|---|
| Только mid client | medium/low: exact mid readiness, unknown allied lane resources |
| Mid + один destination player | medium |
| Mid + вся destination lane | medium/high |
| Все пять clients | high для своих условий, enemy state всё равно partial |

##### G. Discord delivery

| Recommendation | Routing |
|---|---|
| Подготовить следующую wave | Personal warning: text или voice по config |
| Сильное окно с готовой destination lane | Team warning: voice + text |
| Очевидно плохая уже начатая rotation | Personal critical: voice с alias |
| Target отступил/окно закрылось | Text; voice только если игрок уже продолжает движение |
| Сравнение top/bottom/stay | Text `/rotation` или `/why` |

Team voice пример:

> Мид готовится идти bottom после следующей wave. Bottom, сохраните доступный control.

Фраза сообщает общий план, но не требует от sidelane начинать драку независимо от изменившихся условий.

##### H. Outcome tracking

Не считать успешной только rotation с kill. Возможные результаты:

- kill/assist;
- tower/structure pressure;
- defense структуры;
- получение vision/территории;
- переход к objective;
- безопасный возврат без существенной потери mid;
- отмена после закрытия окна;
- провал: смерть, значительная потеря mid или stale/false recommendation.

Enemy regen/TP и другие невидимые результаты не используются как подтверждённые. Для review хранить recommendation snapshot, выбранную lane, confidence, решение игрока, arrival/return times и наблюдаемый результат.

### LIVE-26. Duo Lane Coach — V1

Единый модуль для safe lane и offlane с разными role goals:

- readiness пары по HP/mana/abilities/items;
- partner distance и возможность немедленно подключиться;
- условный target priority;
- большая/невыгодная enemy wave;
- own/enemy tower proximity;
- состояние, когда support временно ушёл;
- pressure vs guaranteed farm/XP;
- оттеснение противника как ценность даже без kill;
- безопасное окно, когда support может оставить core;
- вероятный enemy pull/contest, но не утверждение точного creep aggro.

Safe-lane focus:

- carry safety и farm/pressure balance;
- готовность support;
- сохранение свободного farm без лишней погони;
- смена безопасной farming area.

Offlane focus:

- pressure на enemy carry/support;
- состояние pos 3/pos 4 пары;
- сохранение XP/HP, когда support ушёл;
- contest pull и rotation opportunity pos 4;
- отказ от 1v2 aggression.

### LIVE-27. Support Lane Coach — V1/V2

- proximity к core во время возможного размена;
- когда core можно безопасно оставить;
- условное pull/stack window по clock, wave и camp geometry;
- regen support для lane partner;
- lane vision против повторяющихся rotations;
- возможность короткой rotation к mid/другой линии;
- когда возвращение на линию важнее продолжения roam.

Pull/stack advice имеет medium confidence: GSI не содержит точного creep aggro, HP и spawn-box state.

### EXP-01. Lane Pressure Opportunity — Experimental, выключено по умолчанию

Оценивать только при достаточном coverage, предпочтительно когда оба lane partners подключены:

```text
pressure_score =
    allied_resource_advantage
  + allied_spell_readiness
  + allied_proximity
  + enemy_support_isolation
  + favorable_visible_wave
  - tower_risk
  - missing_enemy_rotation_risk
  - stale_enemy_position
```

Допустимая формулировка:

> Возможное окно давления: ваша пара готова, а enemy support несколько секунд находится отдельно от core.

Недопустимая основная функция:

> Атакуйте Witch Doctor прямо сейчас.

Причины: GSI не даёт enemy HP/mana/cooldowns, creep HP/aggro, attack targets и достаточно быстрого micro-stream. Все experiments должны измерять false positives, distraction и фактическую задержку GSI → decision → TTS → Discord.

---

## 7. Функции по запросу

### ASK-01. `/status` — MVP

Краткое состояние:

- coverage;
- team readiness;
- missing enemies;
- waves;
- current high-priority risk/opportunity.

### ASK-02. `/what-next` — MVP

Вернуть 2–3 варианта с value/risk/confidence:

```text
1. Подготовить Roshan — высокая ценность, средний риск.
2. Давить bottom T2 — средняя ценность, низкий риск.
3. High ground — высокая ценность, очень высокий риск.
```

### ASK-03. `/can-fight` — MVP

Checklist:

- численность;
- proximity;
- HP/mana;
- key cooldowns;
- vision;
- waves;
- buybacks;
- coverage gaps.

### ASK-04. `/why` — MVP

Раскрыть reasoning последней voice-рекомендации:

- факты;
- вывод;
- общий принцип;
- альтернативы;
- confidence.

### ASK-05. `/items` — MVP

Персональная item recommendation.

### ASK-06. `/team-gaps` — V1

Capability matrix и возможные покупатели.

### ASK-07. `/buybacks` — MVP

Own connected readiness + история recent buybacks обеих команд.

### ASK-08. `/roshan` — V1

Known Roshan/Aegis state, uncertainty и checklist подготовки.

### ASK-09. «Почему мы проиграли последнюю драку?» — V2

Объяснять только доступное:

- численность;
- distances;
- HP/mana;
- cooldowns;
- vision;
- waves;
- последовательность deaths.

Не придумывать damage, targets или spell hit/miss.

### ASK-10. `/ward` — V1

Вернуть:

- где нужна следующая vision zone;
- зачем она нужна;
- одна рекомендуемая и одна безопасная альтернативная точка;
- deadline;
- кто из подключённых игроков ближе/имеет подходящий item;
- placement risk и confidence.

### ASK-11. `/lane-plan` — V1

Вернуть для запросившего игрока:

- detected home lane/current state;
- matchup plan;
- conditional target priority;
- условия давления/отхода;
- resource и wave principles;
- coverage gaps, если lane partner не подключён.

### ASK-12. `/rotation` — V1

Сравнить `stay_mid`, `top` и `bottom`:

```text
Departure readiness: ready after current wave

Stay mid: 68/100
Top: 61/100
Bottom: 77/100

Рекомендация:
решить текущую wave → повторно проверить bottom.

Причины:
• mid resources и abilities готовы;
• bottom enemies далеко от tower;
• союзная пара рядом и имеет setup;
• текущая mid wave пока не позволяет уйти бесплатно.

Abort:
если bottom отступит до пересечения реки — вернуться mid.

Unknown:
enemy HP/mana/cooldowns.
```

Score является объяснимым ranking кандидатов, а не вероятностью kill.

---

## 8. Post-game backlog

### REVIEW-01. Match timeline — MVP

- kills/deaths;
- items;
- buybacks;
- structures;
- Roshan/Aegis;
- wards;
- wave pressure;
- ключевые positional episodes.

### REVIEW-02. Three key decisions — MVP

Выбирать не более трёх значимых решений, например:

1. драка без двух союзников;
2. потерянное objective window;
3. покупка, убравшая buyback перед high ground.

### REVIEW-03. Recurring habit detection — V1

- deaths при missing enemies;
- isolated deaths;
- chain-feed participation;
- fights без cooldowns;
- farm без TP/vision;
- плохая wave preparation;
- отсутствие objective conversion;
- buyback discipline;
- повторяющиеся itemization gaps.

### REVIEW-04. Personal curriculum — V1

Один основной навык на серию матчей:

```text
Текущий навык: safe sidelane farming.

Цель:
снизить deaths при 3+ missing enemies
с 2.8 до 1.2 за матч.

Coach:
даёт подсказки только по этому паттерну;
после матча показывает 2–3 эпизода;
измеряет изменение.
```

### REVIEW-05. Progress report — V2

- weekly trend выбранной привычки;
- улучшившиеся решения;
- recurring mistakes;
- item timings;
- death patterns;
- objective conversion;
- readiness discipline.

### REVIEW-06. Party review — V2

- расстояния перед fights;
- chain-feed episodes;
- possible cooldown overlaps;
- farm distribution;
- buyback coordination;
- vision вокруг objectives;
- post-fight conversion.

### REVIEW-07. Vision quality review — V1

- соответствовали ли wards следующему team objective;
- deaths/farm в областях без своего vision;
- overlapping wards;
- отсутствие vision перед Roshan/tower/high ground;
- слишком поздняя установка;
- использование offensive/defensive windows;
- enemy ward entries трактуются как sightings, а не placement truth.

### REVIEW-08. Lane decision review — V1/V2

- partner distance во время pressure attempts;
- resource readiness пары;
- эпизоды aggression внутри невыгодной visible wave;
- пропущенные устойчивые pressure opportunities;
- rotations до решения своей wave;
- уход support при unsafe состоянии core;
- изменения LH/gold/XP темпа как результат, но не анализ конкретного last hit;
- отделение подтверждённых фактов от гипотез об enemy state.

### REVIEW-09. Mid rotation review — V1/V2

- departure readiness в момент ухода;
- была ли решена current mid wave;
- стоимость пропущенных waves/structure pressure;
- freshness target positions;
- readiness destination lane;
- следовал ли игрок рекомендованному abort condition;
- kill/assist/structure/objective outcome;
- safe return или death;
- false/stale recommendation rate;
- rotation считается полезной не только при kill;
- невидимые enemy TP/regen не выдаются за подтверждённый результат.

---

## 9. Discord integration

### DISCORD-01. Match session lifecycle — MVP

Bot:

1. присоединяется к voice channel по команде;
2. ожидает GSI clients;
3. связывает Discord users с team slots;
4. сообщает coverage;
5. активирует Coach после появления match ID;
6. прекращает live alerts в POST_GAME;
7. публикует summary.

### DISCORD-02. Voice recommendations — MVP

Voice используется только для коротких high-value сообщений:

```text
Четыре врага пропали. Верх опасен.
Команда разделена, не продолжайте эту драку.
До общей готовности двенадцать секунд.
Перед Roshan сначала отпушите две линии.
Два врага недавно использовали buyback.
```

### DISCORD-03. Text evidence cards — MVP

Полный reasoning публикуется текстом:

```text
⚠️ Высокий риск: top

Факты:
• 4 врага не видны 16–23 секунды
• ближайший союзник в 3100 units
• observer vision отсутствует
• TP игрока на cooldown

Принцип:
глубокая линия безопасна при наличии информации,
помощи или выхода; сейчас нет ни одного условия.

Confidence: high
```

### DISCORD-04. Slash commands — MVP/V1

```text
/coach start
/coach stop
/coach mute
/coach unmute
/coach focus waves|positioning|itemization|objectives
/coach verbosity silent|minimal|coach|training

/status
/what-next
/can-fight
/why
/items
/team-gaps
/buybacks
/roshan
/ward
/lane-plan
/rotation
/review
```

### DISCORD-05. Voice priority queue — MVP

| Priority | Примеры | Delivery |
|---|---|---|
| Critical | Chain-feed, решающий buyback/base decision | Voice немедленно |
| High | Плохая драка, objective window, Roshan risk | Voice |
| Medium | Item timing, wave preparation, vision gap | Text или voice при доступном budget |
| Low | Статистика и recurring patterns | Post-game |

### DISCORD-06. Anti-spam — MVP

- одна active team recommendation;
- дедупликация смысла, а не только текста;
- cooldown на повтор одного типа;
- suppress менее важного при critical event;
- никаких длинных объяснений во время драки;
- stale recommendations не произносятся;
- конфликтующие рекомендации блокируются;
- индивидуальная некритичная критика не произносится публично.

Стартовые настройки для тестирования:

```text
не более одной proactive voice-подсказки за 30–45 секунд;
одинаковый тип — не чаще 90 секунд;
во время активной драки — максимум одна короткая фраза;
critical события могут обходить общий лимит.
```

Числа являются гипотезой и должны быть проверены playtests.

### DISCORD-07. Team vs personal delivery — MVP

Team voice:

- missing/danger;
- readiness;
- fight quality;
- Roshan;
- waves/objectives;
- buybacks.

Personal text или DM:

- itemization;
- farm;
- personal death patterns;
- individual curriculum;
- подробная критика решений.

### DISCORD-08. Coaching modes — V1

- `silent`: только ответы по запросу;
- `minimal`: critical/high;
- `coach`: critical/high + отдельные обучающие сообщения;
- `training`: больше объяснений между эпизодами;
- `review-only`: молчит в игре, анализирует после.

### DISCORD-09. Optional voice questions — V2+

Возможные запросы:

```text
Coach, можно драться?
Coach, что мне купить?
Coach, почему top опасен?
```

Требования:

- speech-to-text;
- wake word или push-to-talk;
- явное согласие участников;
- отсутствие постоянного хранения разговоров;
- отделение команды Coach от обычной речи.

Для MVP используются slash-команды.

### DISCORD-10. Privacy/session controls — MVP

- opt-in каждого участника;
- явный индикатор активной сессии;
- минимальное хранение raw GSI;
- chat messages не сохраняются по умолчанию;
- голос Discord не записывается по умолчанию;
- удаление истории по запросу;
- разделение personal и team analytics.

### DISCORD-11. Recipient-aware delivery — MVP

В одном Discord voice channel bot audio слышат все. Персональное сообщение нельзя воспроизвести только одному участнику, поэтому каждая рекомендация получает routing envelope:

```json
{
  "audience": ["discord_user_id"],
  "scope": "personal",
  "severity": "warning",
  "delivery": ["text"],
  "expires_in_ms": 8000,
  "deduplication_key": "mid_supports_missing",
  "confidence": 0.84
}
```

Политика доставки:

| Scope/severity | Delivery по умолчанию |
|---|---|
| Team critical | Voice немедленно + text |
| Personal critical | Voice с коротким alias + personal text |
| Team warning | Voice при доступном budget + text |
| Personal warning | Mention/DM; voice только по config |
| Informational/all | Personal text или post-game |

Team voice предназначен для missing/danger, readiness, fight quality, objectives, Roshan, waves и buybacks. Personal text — для itemization, farm, lane education и индивидуальной критики.

### DISCORD-12. Shared voice budget и message merging — MVP

Очередь в общем канале:

```text
1. Team critical
2. Personal critical
3. Team warning
4. Personal warning, если разрешён voice
5. Informational — только text/post-game
```

Требования:

- короткий `coach_alias`, например «Дима» или «Мид»;
- объединение одинаковых alerts: «Мид и хард: оба enemy support не видны»;
- fairness, чтобы один player detector не занимал весь voice budget;
- recommendation TTL: устаревшее сообщение удаляется из очереди;
- lane window имеет TTL порядка нескольких секунд, ward/objective advice — десятков секунд;
- long reasoning всегда уходит в text `/why`;
- `all` означает все прошедшие policy/filter сообщения, а не каждое внутреннее событие.

### DISCORD-13. Severity и per-player configuration — MVP/V1

Нужны независимые thresholds для общего voice и персонального text:

```yaml
voice:
  team_threshold: warning
  personal_threshold: critical
  max_messages_per_minute: 2

text:
  team_threshold: warning
  personal_threshold: all

players:
  steam_account_id:
    discord_user_id: "..."
    coach_alias: "Дима"
    expected_role: 2
    expected_lane: mid
    lane_detection: auto
    focus:
      - positioning
      - rotations
      - itemization
```

Severity semantics:

- `critical`: крупная потеря вероятна прямо сейчас;
- `warning`: важное окно или заметное ухудшение условий;
- `all/informational`: обучающий контекст без срочности.

Личные `all`-подсказки не озвучиваются в общем канале по умолчанию. В будущем персональный private voice возможен только через local companion audio, а не через общий Discord channel.

---

## 10. MVP scope

Первая рабочая версия:

1. Multi-client aggregation.
2. Match lifecycle и roster detection.
3. Persistent event store.
4. Confidence/coverage model.
5. Discord bot: join/leave, voice TTS, text cards.
6. Anti-spam, priority queue, recipient-aware delivery и shared voice budget.
7. Enemy last seen.
8. Personal danger detector.
9. Team readiness.
10. Fight quality.
11. Chain-feed prevention.
12. Buyback history/readiness.
13. Personal item advisor по запросу.
14. `/status`, `/what-next`, `/can-fight`, `/why`, `/items`, `/buybacks`.
15. Post-game timeline.
16. Три главных решения матча.

### MVP acceptance hypotheses

Нужно подтвердить playtests, но предварительно:

- бот корректно объединяет 1–5 клиентов одного матча;
- не дублирует один GSI event между клиентами;
- всегда показывает completeness/coverage;
- не использует stale snapshot для voice alert;
- не делает утверждений об enemy inventory/net worth;
- voice-сообщения короткие и не конфликтуют;
- personal warnings по умолчанию маршрутизируются в text, а не перегружают общий voice;
- personal voice всегда начинается с настроенного alias;
- сообщение с истёкшим TTL не произносится;
- `/why` всегда показывает evidence последней рекомендации;
- после матча выдаются не более трёх ключевых обучающих эпизодов;
- пользователи могут полностью отключить proactive voice.

---

## 11. Этапы после MVP

### V1

- lane/role state detector;
- dynamic ward planner и `/ward`;
- lane matchup plan и `/lane-plan`;
- Mid Coach;
- Mid Rotation Planner и `/rotation`;
- safe/offlane Duo Lane Coach;
- Support Lane Coach;
- lane-wave model;
- objective conversion;
- high-ground checklist;
- vision coverage;
- Roshan planner;
- team capability gaps;
- team item buyer assignment;
- formation metrics;
- recurring habit detection;
- personal curriculum;
- coaching modes;
- vision quality review;
- lane decision review;
- mid rotation review;
- per-player severity/focus configuration.

### V2

- experimental lane pressure opportunity после validation;
- team farm distribution;
- party review;
- weekly progress;
- last-fight explanation;
- neutral item reminders;
- richer Discord controls;
- optional voice questions с consent.

---

## 12. Что сознательно не входит в ранний scope

- last-hit micro Coach;
- creep HP/aggro analysis;
- автоматический target selection;
- spell hit/miss determination;
- точный damage/heal analysis;
- enemy inventory/net worth inference как факт;
- guaranteed Roshan respawn/HP;
- психологическая диагностика и определение tilt;
- управление игрой;
- бесконтрольный LLM без evidence/rule engine;
- постоянный голосовой комментарий каждого события.

## 13. Основные ограничения данных

- подробное hero/player state есть только для подключённых клиентов;
- пять клиентов одной команды не снимают fog of war;
- enemy inventories/abilities/cooldowns/net worth отсутствуют;
- minimap не имеет стабильных entity ID и illusion flag;
- lane creeps не имеют HP/target/spawn-wave ID;
- combat log, damage, heal, cast target и hit/miss отсутствуют;
- enemy ward placement/destruction известны неполно;
- Roshan HP и точный respawn timer отсутствуют;
- draft, top-level couriers/neutralitems/roshan providers в исследованном dataset пусты;
- GSI update cadence около 1–2 секунд не подходит для micro-reaction Coach.

## 14. Метрики продукта

### Технические

- snapshot freshness/latency;
- reconnect recovery;
- event deduplication accuracy;
- roster correctness;
- false duplicate rate minimap tracker;
- recommendation calculation latency;
- stale voice alert rate;
- Discord voice availability.
- lane/home-role detection accuracy;
- false lane-switch rate при pull/stack/rune movement;
- recommendation TTL expiry rate;
- recipient-routing correctness;
- TTS queue delay отдельно для critical/warning;
- rotation recommendation latency и target freshness на момент delivery;
- top/bottom/stay candidate scoring stability;

### UX

- voice messages per match;
- mute rate;
- `/why` usage;
- dismissed/accepted recommendations;
- perceived distraction score;
- percentage рекомендаций, которые игрок считает понятными;
- percentage рекомендаций с actionable reasoning.
- personal/team voice ratio;
- доля персональных предупреждений, корректно оставшихся в text;
- оценка помехи общему voice channel;
- usefulness ward/lane suggestions по отдельности;

### Обучение

- isolated deaths per match;
- deaths при 3+ missing enemies;
- chain-feed episodes;
- fights при low readiness;
- objective conversion после выигранного эпизода;
- buyback discipline;
- выполнение персональной учебной цели;
- сохранение улучшения через несколько матчей.
- deaths/farm episodes вне релевантного vision;
- wards, поставленные до, а не после objective window;
- lane pressure attempts без готового partner;
- mid rotations после/до решения wave;
- support leave-lane decisions при safe/unsafe core state.
- mid rotations до/после решения current wave;
- approximate mid-wave/structure cost после rotation;
- accepted/aborted rotation recommendations;
- kill/assist/structure/objective outcomes после rotation;
- stale/false Mid Rotation Planner recommendations.

Метрики обучения нельзя превращать в универсальную оценку «хороший/плохой игрок»: они используются только для выбранного навыка и контекста роли/героя.

## 15. Открытые продуктовые вопросы

Следующие решения намеренно не фиксируются в этом черновике:

1. Где выполняется aggregator: локально у host игрока или в backend.
2. Как GSI client проходит authentication и связывается с Discord user.
3. Какой TTS/STT provider используется.
4. Какая knowledge base является источником patch-aware item/hero данных.
5. Как определяется активная драка и её границы.
6. Какой голосовой budget комфортен для команды.
7. Нужно ли персональные советы отправлять DM или в отдельный text channel.
8. Как долго сохраняются raw snapshot и derived match history.
9. Какие рекомендации разрешены proactive, а какие только по запросу.
10. Как пользователь корректирует roster или user-reported enemy item.
11. Как измерять принятие рекомендации, не требуя лишних действий от игрока.
12. Нужен ли Coach для случайных неподключённых союзников либо только для пати.
13. Какой источник patch-aware map geometry и ward spots используется.
14. Выдаём ли ward точной точкой, зоной или обеими вариантами.
15. Как подтверждается intended role/home lane и как пользователь исправляет auto-detection.
16. Какие lane advices могут быть proactive voice, а какие остаются text/on-demand.
17. Какой TTL применяется к danger, pressure, lane-partner и ward messages.
18. Разрешается ли personal warning в общем voice или только personal critical.
19. Как обеспечить fairness voice budget между пятью игроками и team-level detectors.
20. Нужен ли в будущем local companion для private personal TTS.
21. Какой score margin над `stay_mid` достаточен для proactive rotation recommendation.
22. Как оценивать travel time без готового move-speed/path field и не создавать ложную точность.
23. Должна ли prepare-фаза Mid Rotation Planner звучать в voice или оставаться text по умолчанию.
24. Какой observable outcome считать успешной rotation помимо kill/assist.
25. Через какое окно после arrival связывать kill/structure/objective event с rotation.

Эти вопросы требуют отдельного архитектурного и продуктового решения до реализации соответствующих частей.

## 16. Ближайший следующий шаг

Перед разработкой MVP рекомендуется подготовить два отдельных документа:

1. **Product specification:** точные user flows, recommendation policy, voice budget, privacy и acceptance criteria.
2. **Technical architecture:** схема GSI client → aggregator → feature engine → Discord, contracts, storage и failure modes.

После этого можно сделать узкий prototype:

- один матч;
- 1–2 GSI clients;
- Discord voice/text;
- три детектора: last seen/danger, readiness и buyback;
- `/why` с evidence;
- post-game три ключевых эпизода.

Такой prototype проверит главный риск продукта: являются ли редкие объяснимые voice-рекомендации полезными и не мешают ли они командной коммуникации.

Следующий vertical slice после базового prototype:

- lane/role state detection для mid и одной duo lane;
- `/lane-plan` и text-first lane advice;
- Mid Rotation Planner: `stay/top/bottom`, prepare/revalidate и `/rotation`;
- dynamic ward zone/timing для одного objective;
- recipient-aware Discord routing: team voice, personal critical voice и personal warning text;
- сравнение false positives, TTL expiry и субъективной полезности lane/ward сообщений.
