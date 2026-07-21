# Dota 2 AI Coach — MVP rollout specification

Статус: **Draft v0.3**  
Целевой timebox: **4–8 часов разработки до первого rollout**  
Аудитория: небольшая заранее настроенная группа игроков в одном Discord server.  
Связанные документы:

- [`gsi_turbo_match_report.md`](./gsi_turbo_match_report.md) — фактически подтверждённые GSI-данные и ограничения;
- [`dota2_ai_coach_draft_plan.md`](./dota2_ai_coach_draft_plan.md) — полный product backlog за пределами MVP.

## 1. Назначение MVP

MVP должен проверить, нужна ли игрокам on-demand система, которая во время матча:

1. отвечает на вопрос **“I'm lost”** — что сейчас разумнее делать на макроуровне;
2. отвечает на вопрос **“Buy”** — какой следующий законченный предмет сделать целью сборки против текущего enemy roster с учётом своей роли и подключённых союзников;
3. озвучивает краткий ответ через Discord bot в общем voice channel;
4. использует GSI нескольких подключённых игроков одного матча;
5. показывает объяснимые причины, а не генерирует непрозрачную команду.

MVP не проверяет рост win rate/MMR, идеальность рекомендаций или proactive coaching. Он проверяет более ранние гипотезы:

- игроки добровольно нажимают кнопки во время матча;
- ответ приходит достаточно быстро;
- рекомендация понятна и выглядит релевантной;
- игрок понимает, почему она была дана;
- общий voice channel остаётся пригодным для коммуникации;
- multi-client данные дают заметно лучший контекст.

## 2. Зафиксированный scope

### 2.1. Must have

- 1–5 статически настроенных GSI clients;
- один активный match/team session;
- последний свежий snapshot каждого клиента в памяти;
- компактный match-scoped temporal state без хранения raw snapshots;
- связь GSI client ↔ Discord user;
- проверка одинаковых `matchid` и `team_name`;
- enemy roster cache и enemy last seen;
- история изменений HP своих buildings;
- дедуплицированный compact event timeline;
- rolling player/hero history подключённых игроков;
- Discord bot в заранее заданном voice channel;
- одно сообщение с кнопками `I'm lost`, `Buy` и пятью role buttons;
- match-scoped role override для каждого подключённого игрока;
- in-memory debounce повторных action interactions;
- `I'm Lost Weighted Scoring Engine` с небольшим фиксированным набором действий;
- `Buy Final-Target Weighted Scoring Engine` с небольшим curated catalog;
- основная рекомендация и одна альтернатива;
- короткий deterministic TTS;
- последовательная audio queue;
- deadlines для TTS/voice/playback и guaranteed queue cleanup;
- text-first delivery: text mirror со score breakdown не ждёт TTS/voice;
- минимальный JSONL/request log;
- понятные ответы при stale/missing/incomplete данных.

### 2.2. Stretch goals

- следующий доступный компонент для рекомендованного final item;
- buyback-aware component warning;
- owned-component bonus, affordability и slot-pressure scoring;
- automatic timeline source failover через независимые per-client reducers;
- более точная интерпретация recent gold/LH/XP trend;
- более точные coarse map zones;
- кнопки `Useful / Not useful` под текстовым ответом;
- cache повторяющихся TTS-фраз.

Stretch-функция не должна задерживать rollout must-have части.

### 2.3. Out of scope

- LLM как источник решения;
- proactive recommendations;
- voice recognition и wake word;
- private voice для отдельных пользователей;
- database и длительное хранение raw snapshots;
- persistence match history между restart или после окончания матча;
- полный minimap entity tracker;
- сложная временная синхронизация и объединение динамических markers clients;
- global ordering snapshots разных PCs по `provider.timestamp`;
- несколько одновременных матчей;
- public multi-tenancy/auth/onboarding;
- автоматическое определение роли/линии по координатам;
- полный hero/item semantic catalog;
- OpenDota HTTP seed при каждом старте;
- runtime recipe DAG как обязательная функция;
- full wave/objective/Roshan/ward planner;
- exact pathfinding;
- enemy item/net-worth inference;
- ML-модель;
- автоматическое управление игрой.

## 3. Данные GSI, используемые MVP

### 3.1. Requester-specific

Из snapshot игрока, нажавшего кнопку:

- `player`: identity, team/team slot, KDA, LH/denies, gold buckets, GPM/XPM;
- `hero`: hero name/id, position, level/XP, alive/respawn, HP/mana, status, buyback cost/cooldown;
- `abilities`: names, levels, cooldowns, `can_cast`;
- `items`: inventory/backpack/stash/TP/neutral slots, charges/cooldowns;
- `map`: state, clocks, scores, day/night, paused, winner;
- `buildings`: HP своих structures;
- `minimap`: текущие markers команды;
- current `events`, которые дедуплицируются в compact match timeline.

### 3.2. Connected teammates

Для каждого свежего клиента того же матча/команды:

- hero identity и position;
- alive/respawn;
- HP/mana;
- abilities readiness;
- items;
- gold/GPM/XPM;
- buyback state;
- default/effective role и Discord alias;
- короткая нормализованная player/hero history.

### 3.3. Shared team view

- freshest `map`;
- freshest `minimap`;
- свои buildings;
- cached allied/enemy roster;
- enemy last seen;
- current visible/missing enemies;
- positions подключённых игроков;
- recent allied movement/formation trend;
- recent building damage и deduplicated events;
- coverage: `N/5`.

### 3.4. Ограничения, обязательные для ответа

- enemy HP/mana/items/abilities/cooldowns/net worth отсутствуют;
- fog of war сохраняется при любом числе clients одной команды;
- minimap `oN` не является stable entity ID;
- GSI не подтверждает game mode/turbo;
- absolute GPM thresholds между режимами ненадёжны;
- неподключённые allies не имеют подробного inventory/readiness;
- exact ward/Roshan/wave/combat state не используется в этом MVP;
- ответ должен перечислять значимые `unknowns` при partial coverage.

## 4. Минимальная архитектура

```text
GSI client A ─┐
GSI client B ─┼── HTTP POST /gsi ──► LatestStateStore
GSI client N ─┘                              │
                                   ┌────────┴─────────┐
                                   ▼                  ▼
                            MatchMemoryUpdater  MatchContextBuilder ◄────┐
                                   │                  ▲                  │
                                   └──────────────────┘                  │
                                                                         │
Discord action button ──► RequestRouter ─────────────────────────────────┘
                               │       │
                               ▼       ▼
                        ImLostEngine  BuyEngine
                               │       │
                               └───┬───┘
                                   ▼
                           RecommendationRenderer
                               │          │
                               ▼          ▼
                           Text mirror   TTS queue/watchdog
                                             │
                                             ▼
                                   Discord voice channel

Discord role button ───────────────► Match role override
```

Компоненты являются логическими. Их не обязательно реализовывать отдельными services/processes.

## 5. Client identity и конфигурация

### 5.1. Static client config

Discord integration settings remain a separate application configuration concern for its later vertical:

```yaml
discord:
  guild_id: "..."
  text_channel_id: "..."
  voice_channel_id: "..."
```

Public client config:

```yaml
schema_version: 1
clients:
  client-01:
    default_role: 2
```

Private credentials config:

```yaml
schema_version: 1
client_credentials:
  client-01:
    gsi_token: "<openssl rand -hex 32>"
    discord_user_id: "123456789012345678"
    coach_alias: "Дима"
```

Оба документа связываются по нейтральному `client_id`. GSI token является долгоживущим opaque credential и
генерируется, например, командой `openssl rand -hex 32`.

Native Dota GSI передаёт token внутри JSON payload:

```http
POST /gsi
Content-Type: application/json

{
  "auth": { "token": "<gsi_token>" },
  "...": "raw GSI snapshot fields"
}
```

Backend получает Discord identity из trusted config. Клиент не выбирает чужой `discord_user_id` самостоятельно.
Поле `auth` удаляется на входной границе и не попадает в match command или latest-state storage. Успешно принятый
snapshot получает пустой ответ `200 OK`.

`GET /health` возвращает `200` и `{ "status": "ok" }`. Максимальный размер GSI request body на первом этапе —
`1_048_576` bytes. Ошибки имеют стабильную форму `{ "error": { "code": "<CODE>" } }`, а request correlation
возвращается через сгенерированный runtime заголовок `X-Request-Id` без включения приватных деталей в response body.
`POST /gsi` принимает `application/json` со стандартными параметрами media type, включая `charset=utf-8`; отсутствующий,
не-JSON и vendor `application/*+json` media type возвращает `415 UNSUPPORTED_MEDIA_TYPE`.

### 5.2. Match-scoped role selection

`default_role` является только fallback. Во время текущего матча игрок может выбрать effective role через Discord:

```text
[ 1 Carry ] [ 2 Mid ] [ 3 Offlane ] [ 4 Support ] [ 5 Hard Support ]
```

При нажатии backend:

1. определяет Discord user;
2. проверяет связанный fresh GSI client и active `matchId`;
3. меняет роль только этого пользователя;
4. сохраняет override в `MatchSession.roleOverrides`;
5. отвечает ephemeral confirmation;
6. использует новую effective role в следующих `I'm lost` и `Buy` requests.

```text
effectiveRole = matchRoleOverride ?? defaultRole
```

Правила:

- override не изменяет static config file;
- override сбрасывается при смене/окончании `matchId`;
- после restart MVP допустимо попросить игрока выбрать роль заново;
- две одинаковые роли разрешены, чтобы не блокировать swaps/нестандартные линии;
- пользователь не может изменить роль другого пользователя;
- role является weighted signal, а не hard truth об актуальной линии или текущей позиции.

### 5.3. Конфигурация, намеренно отсутствующая

- signup;
- OAuth flow;
- admin UI;
- автоматическое role/lane detection;
- persistent role override между матчами;
- смена Discord server/channel во время матча;
- public API tokens;
- permission model beyond known-client tokens.

## 6. Multi-client aggregation и temporal state

### 6.1. Client state

```ts
type ClientState = {
  clientId: string;
  discordUserId: string;
  coachAlias: string;
  defaultRole: 1 | 2 | 3 | 4 | 5;
  receivedAt: number;
  matchId: string | null;
  team: "radiant" | "dire" | null;
  teamSlot: number | null;
  snapshot: GsiSnapshot;
};
```

In-memory storage:

```ts
Map<DiscordUserId, ClientState>;
```

### 6.2. Match session

```ts
type MatchSession = {
  matchId: string;
  team: "radiant" | "dire";
  clients: ClientState[];
  alliedRoster: Set<string>;
  enemyRoster: Set<string>;
  roleOverrides: Map<string, 1 | 2 | 3 | 4 | 5>;
  timelineSourceClientId: string | null;
  timelineStatus: "healthy" | "stale" | "rebaselining";
  memory: MatchMemory;
};
```

MVP поддерживает один active session. Snapshot другого матча или команды не включается в context текущего request.

### 6.3. Freshness

Client считается usable только пока его `receivedAt` находится внутри configurable freshness window.

Точное окно не фиксируется спецификацией. Оно выбирается после smoke-test с реальной частотой GSI. Начальная конфигурация должна учитывать, что в исследованном dataset обычный интервал составлял примерно 1–2 секунды.

Если requesting client stale:

> Дима, я не получаю свежие данные от твоего GSI client.

Если stale один из teammates:

- он исключается из exact connected coverage;
- ответ продолжает работать;
- в `unknowns` указывается неполное team state.

### 6.4. Context building

При Discord interaction:

1. определить Discord user;
2. найти его fresh client state;
3. получить `matchid/team`;
4. собрать fresh clients того же `matchid/team`;
5. выбрать freshest shared snapshot;
6. построить roster cache;
7. получить effective role и temporal features из `MatchMemory`;
8. вернуть requester + connected team state + coverage.

```ts
type CoachContext = {
  requester: ClientState;
  effectiveRole: 1 | 2 | 3 | 4 | 5;
  teammates: ClientState[];
  coverage: number;
  matchId: string;
  team: "radiant" | "dire";
  sharedSnapshot: GsiSnapshot;
  alliedRoster: string[];
  enemyRoster: string[];
  temporalFeatures: TemporalFeatures;
  unknowns: string[];
};
```

### 6.5. Shared minimap rule

Не выполнять union всех текущих minimap markers между clients. Использовать minimap самого свежего usable snapshot.

Причина: старый marker одного клиента не должен превращаться в текущую видимость врага.

Разрешено накопительно кэшировать stable roster hero names из валидных observations. Last-seen temporal metadata обновляет только sticky timeline source. Текущие dynamic positions и `currentlyVisible` всегда берутся из freshest snapshot; старый marker не считается текущей видимостью.

### 6.6. Что multi-client даёт MVP

- requester выбирается по Discord user;
- exact items и resources connected teammates;
- расстояния между подключёнными игроками;
- team item redundancy;
- connected capability gaps;
- coverage `N/5`;
- честная формулировка границ ответа.

### 6.7. Принцип хранения

MVP не сохраняет последовательность полных GSI snapshots. На ingest snapshot нормализуется в:

- latest client state;
- короткие rolling samples для continuous values;
- compact change events;
- match-scoped caches и overrides.

Retention и decision window разделяются. Например, building change events хранятся весь матч, но срочный `DEFEND` использует только последние 6/15/30 секунд.

| Source          | Что хранится                                 |            Retention |
| --------------- | -------------------------------------------- | -------------------: |
| `map`           | match/state transitions, score changes       |            весь матч |
| `player + hero` | normalized samples connected players         |         rolling 90 s |
| enemy heroes    | roster, first/last seen, last position       |            весь матч |
| allied movement | positions/centroid trend                     |      rolling 15–30 s |
| `buildings`     | только health changes/destruction            |            весь матч |
| `events`        | deduplicated parsed events, кроме chat       |            весь матч |
| `items`         | current authoritative inventory + milestones | milestones весь матч |
| role override   | последнее выбранное значение                 |       до конца матча |
| advice          | последний result/context hash                |       до конца матча |

После окончания/смены `matchId` memory очищается. В MVP history не обязана переживать process restart; первый snapshot после restart становится baseline и сам по себе не создаёт delta/alert.

Возраст tactical signals и freshness рассчитываются по server-side monotonic `receivedAt`, чтобы pause, повторяющийся provider timestamp или неравномерная частота snapshots не превращались в ошибочный «delta на frame». `map.game_time/clock_time` сохраняются для match timeline и объяснений пользователю.

### 6.8. Match memory

```ts
type MatchMemory = {
  matchId: string;
  team: "radiant" | "dire";

  mapTransitions: MapTransition[];
  enemyHeroes: Map<string, EnemyHeroMemory>;
  playerHistory: Map<string, RingBuffer<PlayerTemporalSample>>;
  buildings: Map<string, BuildingTemporalState>;
  events: Map<string, MatchEventMemory>;
  inventoryMilestones: InventoryMilestone[];
  lastAdvice: Map<
    string,
    {
      imLost?: AdviceMemory;
      buy?: AdviceMemory;
    }
  >;
};
```

Это runtime memory для scoring, не replay/event-sourcing contract.

`TemporalFeatures` — нормализованный read model над этой памятью: requester trends, team movement, enemy last-seen, building pressure windows, recent relevant events и previous advice. Scoring engines не читают raw history напрямую.

### 6.9. Sticky canonical timeline

`buildings` и temporal minimap observations видны нескольким GSI clients одной команды. Их нельзя независимо добавлять в одну историю: одно изменение иначе будет посчитано до пяти раз.

В MVP при начале матча один fresh client выбирается как `timelineSourceClientId`. Конкретный bootstrap rule — первый fresh client или явно configured primary — остаётся implementation decision. После выбора source закрепляется до конца матча; автоматического переключения на другой client нет.

```text
snapshot from timeline source
    → update temporal reducer;

snapshot from another client
    → update latest requester/teammate state;
    → do not update shared temporal deltas.
```

Если source становится stale:

1. `timelineStatus = stale`;
2. current requester/teammate context продолжает обновляться от их clients;
3. building-damage и last-seen-age claims отключаются или получают insufficient confidence;
4. в `unknowns` добавляется отсутствие свежего temporal context;
5. automatic failover не выполняется.

Когда тот же source возвращается, его первый snapshot становится baseline с `timelineStatus = rebaselining`. Изменения, произошедшие во время разрыва, не трактуются как fresh damage/visibility events. Только следующие последовательные snapshots снова переводят timeline в `healthy`.

`provider.timestamp` является wall-clock конкретного PC, а не глобальным match sequence. Server-side `receivedAt` показывает порядок доставки, а не гарантированный порядок игровых состояний. Поэтому MVP не строит global last-write-wins reducer для разных clients ни по одному из этих timestamps.

Будущее automatic failover требует независимого уже прогретого temporal reducer на каждый client и явного выбора read model; это Stretch, а не часть первого rollout.

Stable roster может накапливаться из валидных observations, но dynamic current view не объединяется со stale markers. Shared events разрешено принимать от всех same-match/same-team clients, потому что они дополнительно дедуплицируются по normalized payload/fingerprint и не требуют сравнения соседних snapshots. GSI повторяет их в sliding window примерно 30 секунд.

Event fingerprint включает `event_type`, logical event time и normalized payload. Один только array index или first-seen timestamp не является event identity.

### 6.10. Enemy roster и last seen

```ts
type EnemyHeroMemory = {
  heroName: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastPosition: { x: number; y: number } | null;
  currentlyVisible: boolean;
};
```

Для `Buy` stable roster cache сохраняет threat roster после ухода героя в fog. Для `I'm lost` healthy sticky timeline даёт missing count, last-seen age и последнюю coarse zone. При stale timeline текущая visibility всё ещё может читаться из freshest snapshot, но age/trajectory claims становятся unknown. История не используется для утверждения, куда враг пошёл.

### 6.11. Player/hero rolling history

Для каждого connected player хранится до 90 секунд normalized samples:

```ts
type PlayerTemporalSample = {
  receivedAt: number;
  gameTime: number;
  position: { x: number; y: number };
  alive: boolean;
  hpPercent: number;
  manaPercent: number;
  level: number;
  xp: number;
  gold: number;
  lastHits: number;
  denies: number;
  gpm: number;
  xpm: number;
  goldFromHeroKills: number;
  goldFromCreepKills: number;
  goldFromIncome: number;
  goldFromShared: number;
};
```

Расчёты используют реальные timestamps, а не количество snapshots:

- 5–10 s: резкая потеря ресурсов/death/reset proxy;
- 15–30 s: движение к team cluster или от него;
- 30–60 s: LH/XP/income trend;
- 90 s: retention с запасом для расчёта окон.

`current gold delta` не считается чистым farm rate, потому что покупки уменьшают gold. Надёжнее использовать LH/XP и delta накопительных income counters. История нужна прежде всего `I'm lost`; для `Buy` она является optional input для будущей time-to-item оценки.

### 6.12. Buildings history и decision windows

Доступен точный `health/max_health` только 18 structures локальной команды. Хранится не каждый snapshot, а изменение:

```ts
type BuildingHealthEvent = {
  buildingId: string;
  observedAt: number;
  gameTime: number;
  previousHealth: number;
  currentHealth: number;
  maxHealth: number;
  delta: number;
  deltaPercent: number;
};

type BuildingTemporalState = {
  buildingId: string;
  currentHealth: number;
  maxHealth: number;
  lastObservedAt: number;
  lastDamageAt: number | null;
  damage6s: number;
  damage15s: number;
  damage30s: number;
  destroyedAt: number | null;
  events: BuildingHealthEvent[];
};
```

Начальные decision windows:

| Age последнего damage | Семантика                     | Scoring/wording                                      |
| --------------------: | ----------------------------- | ---------------------------------------------------- |
|                 0–6 s | вероятно получает урон сейчас | сильный `DEFEND` signal                              |
|                6–15 s | недавно получало урон         | осторожный warning, желательно minimap confirmation  |
|               15–30 s | недавнее lane/base pressure   | слабый strategic context                             |
|                 >30 s | historical damage             | не повышает urgency; остаётся current low-HP context |

Граница 6 s основана на turbo dataset: 262 health drops; около 84% последовательных drops разделены не более чем 5 s. При episode gap до 6 s наблюдалось 53 episodes со средней длительностью около 5.7 s. Это начальный configurable default по одному матчу, а не инвариант Dota.

```yaml
building_history:
  retention: active_match
  active_damage_window_seconds: 6
  recent_damage_window_seconds: 15
  pressure_context_window_seconds: 30
  store_only_changes: true
  persist_after_match: false
```

Сильный pressure требует не только низкого current HP, но и repeated/relevant recent loss, critical structure или подтверждения nearby enemies/wave. GSI не даёт attacker/source, поэтому без minimap confirmation Coach говорит «башня теряет здоровье», а не «враги атакуют башню».

Guards:

- stale source запрещает claim о продолжающемся damage;
- во время pause urgency не озвучивается;
- health increase обновляет baseline, но не считается pressure;
- исчезновение секции в `POST_GAME` не означает уничтожение всех structures;
- исчезновение одного key в active game желательно коррелировать с minimap/events.

### 6.13. Events и inventory milestones

GSI events являются sliding window, поэтому полезные события сохраняются compact до конца матча и дедуплицируются между snapshots/clients:

```ts
type MatchEventMemory = {
  fingerprint: string;
  type: string;
  gameTime: number;
  firstReceivedAt: number;
  data: Record<string, unknown>;
};

type InventoryMilestone = {
  userId: string;
  gameTime: number;
  itemName: string;
  type: "appeared" | "completed" | "consumed" | "unknown";
  confidence: number;
};
```

Для `I'm lost` потенциально полезны recent hero kills, buybacks и objective events. Для `Buy` `CHAT_MESSAGE_ITEM_PURCHASE` даёт partial evidence о major items всей локальной команды, включая неподключённых allies. Этот поток не является полным transaction/inventory ledger и не заменяет exact inventory connected clients.

Current inventory всегда authoritative. Inventory history хранится только как confident/unknown milestones появления major items, а не как попытка объяснить каждую перестановку slot. Raw chat messages не сохраняются: они не нужны двум MVP-фичам и добавляют privacy scope.

### 6.14. Advice memory и стабильность результата

```ts
type AdviceMemory = {
  requestType: "im_lost" | "buy";
  candidate: string;
  contextHash: string;
  score: number;
  createdAt: number;
};
```

Для `I'm lost` previous result из последних 20–30 секунд предотвращает голосовые повторы и oscillation между близкими actions; exact repeat имеет отдельный short cooldown. Urgent hard gate может немедленно заменить прошлый совет. Для `Buy` повторный неизменившийся context должен давать стабильный target. Core context invalidated при изменении effective role, roster, completed major items requester или connected team capabilities, а не при каждой перестановке component slots.

### 6.15. Что остаётся current-only

История не требуется для текущих ability/item cooldowns, charges, disables, respawn timer, local buyback cost/cooldown, daytime, ward purchase cooldown, provider constants, league, wearables и пустых providers. `previously/added` можно использовать как change hints, но authoritative state — current snapshot.

Не входят в temporal MVP: raw snapshot archive, full minimap tracker, lane-creep association, courier paths, ward lifecycle, chat retention и post-match database.

## 7. Общий контракт scoring engine

```ts
type ScoreContribution = {
  feature: string;
  value: number | string | boolean;
  contribution: number;
  explanation: string;
};

type ScoredCandidate = {
  key: string;
  score: number;
  confidence: number;
  reasons: ScoreContribution[];
  penalties: ScoreContribution[];
  blockers: string[];
  unknowns: string[];
};

type Recommendation = {
  primary: ScoredCandidate;
  alternative?: ScoredCandidate;
  voiceText: string;
  textTitle: string;
  textBody: string;
  coverage: number;
};
```

Оба движка используют pipeline:

```text
validate context
→ generate candidates
→ apply hard gates/filters
→ calculate contributions
→ sort candidates
→ select primary + alternative
→ render deterministic response
```

Численные веса хранятся в config/data-файле и не компилируются в текст объяснения вручную.

## 8. Функция “I'm lost”

### 8.1. User flow

1. Игрок нажимает `I'm lost`.
2. Discord interaction идентифицирует игрока.
3. Backend строит его current `CoachContext`.
4. Engine ранжирует фиксированные action candidates.
5. Bot озвучивает primary action и две главные причины.
6. Bot публикует text breakdown и alternative.

### 8.2. Action catalog

Must-have actions:

```text
RESET
DEFEND
REGROUP
FARM_SAFELY
HOLD_AND_WAIT
```

Внутренний смысл:

| Action          | Значение                                                             |
| --------------- | -------------------------------------------------------------------- |
| `RESET`         | восстановить HP/mana/позицию перед следующим действием               |
| `DEFEND`        | реагировать на подтверждённый урон своему structure                  |
| `REGROUP`       | сократить опасную дистанцию до connected team cluster                |
| `FARM_SAFELY`   | продолжить набор ресурсов без глубокой карты/изолированной позиции   |
| `HOLD_AND_WAIT` | не форсировать новое действие до восстановления информации/readiness |

`PLAY_WITH_TEAM` может быть добавлен как шестой candidate, если он не дублирует `REGROUP`.

### 8.3. Используемые features

Requester:

- alive/respawn;
- HP%/mana%;
- HP/mana trend за 5–10 секунд;
- position/coarse map depth;
- movement trend за 15–30 секунд;
- gold;
- GPM как weak signal;
- recent LH/XP/income trend;
- TP readiness;
- ability/item readiness;
- buyback state.

Connected team:

- distance до ближайшего connected ally;
- distance до connected team centroid;
- количество connected allies рядом;
- движется ли requester к team cluster или от него;
- alive/readiness подключённых игроков;
- coverage.

Shared map:

- visible enemy hero count;
- missing enemy count;
- enemy last-seen freshness;
- own/enemy half coarse position;
- building damage за 6/15/30 секунд;
- current game state/time.

### 8.4. Coarse map model

Минимальные зоны:

```text
own_base
own_half
river_or_center
enemy_half
enemy_base
unknown
```

Никакого pathfinding, lane polygons, camp classification или objective geometry в must-have scope.

### 8.5. Hard gates

Примеры обязательной логики:

```text
requester snapshot stale
    → NO_ADVICE;

game_state not in progress
    → state-specific rejection;

requester dead
    → HOLD_AND_WAIT с respawn/buyback context;

HP/mana недостаточны для нового действия
    → сильно повысить RESET;

own building имеет fresh/repeated damage в active 6 s window
    → включить DEFEND candidate;

requester deep + isolated + enemies missing
    → заблокировать глубокий FARM и повысить REGROUP/HOLD;

coverage partial
    → добавить uncertainty, но не отменять ответ.
```

### 8.6. Scoring

```text
score(action) =
    base
  + urgency
  + safety
  + readiness
  + team_proximity
  + role_fit
  - danger
  - uncertainty
  - travel_cost
```

Точные веса — runtime config. Для каждого ненулевого вклада хранится explanation.

Absolute GPM не используется как hard threshold, поскольку GSI не предоставляет надёжный game-mode flag, а Turbo/ранние значения отличаются. GPM может только слегка влиять на `FARM_SAFELY`; предпочтительнее recent LH/XP/income trend. Gold delta не трактуется как чистый income из-за покупок.

Previous advice даёт небольшой hysteresis против oscillation, но никогда не перекрывает urgent hard gate: смерть, fresh building damage или резкое ухудшение requester readiness.

### 8.7. Пример результата

Voice:

> Дима, лучше присоединиться к команде: ты далеко от союзников, а три врага сейчас не видны.

Text:

```text
I'm lost → REGROUP
Score: 78
Confidence: medium
Coverage: 3/5

Почему:
• высокая дистанция до ближайшего подключённого союзника
• подключённые союзники находятся в одной области
• три врага сейчас не видны
• TP игрока недоступен

Альтернатива:
RESET — 54

Неизвестно:
• состояние двух неподключённых союзников
• enemy items/cooldowns
```

### 8.8. Failure response

Если нет осмысленного primary candidate:

> Дима, сейчас недостаточно данных для уверенного совета. Я вижу только одного подключённого игрока, а текущая enemy visibility устарела.

Engine не должен выбирать случайный top-1 только потому, что сортировка требует результата.

## 9. Функция “Buy”

### 9.1. User flow

1. Игрок нажимает `Buy`.
2. Backend получает requester hero, effective role и current inventory.
3. Enemy roster преобразуется в threat vector.
4. Connected teammate inventories преобразуются в partial team coverage.
5. Curated final items проходят hard filters и упрощённый core scoring.
6. Text mirror называет target item, alternative и ограничения.
7. Bot асинхронно озвучивает target item и две причины.

### 9.2. Inputs

- requester hero;
- effective role (`match override ?? default role`);
- local inventory/backpack/stash;
- game time;
- enemy roster;
- exact inventories connected teammates;
- observed allied major-item purchase evidence;
- coverage `N/5`;
- pinned raw item constants;
- curated hero threat/item capability data.

`gold`, `buyback_cost` и `buyback_cooldown` доступны в context и логах, но не участвуют в core `Buy` score. Они нужны component-aware/buyback-aware Stretch. Без recipe awareness Engine не вычисляет точный remaining cost и не обещает, что конкретный purchase доступен прямо сейчас.

### 9.3. Raw catalog

Предпочтительный источник — pinned version npm-пакета [`dotaconstants`](https://github.com/odota/dotaconstants) или подготовленный из него local JSON snapshot.

Не обращаться к OpenDota API при каждом server startup. Runtime должен быть воспроизводимым и не зависеть от сети.

Raw catalog отвечает только за факты вроде:

- item ID/internal name;
- display name;
- cost;
- purchasable/obsolete/category metadata, если доступно в выбранной версии;
- components/recipes только после явной проверки source schema.

Raw catalog не является semantic counter database.

### 9.4. Curated hero threats

```json
{
  "npc_dota_hero_phantom_assassin": {
    "evasion": 0.9,
    "physical_burst": 0.9,
    "gap_close": 0.7
  },
  "npc_dota_hero_bristleback": {
    "passive_tank": 1.0,
    "sustain": 0.7
  },
  "npc_dota_hero_lina": {
    "magic_burst": 0.8,
    "long_range_damage": 0.7
  }
}
```

Tags и веса являются локально курируемыми и patch-aware. Неизвестный герой не получает автоматически придуманные LLM tags.

### 9.5. Curated item capabilities

```json
{
  "item_example": {
    "cost": 4000,
    "roles": {
      "carry": 0.8,
      "mid": 0.5,
      "offlane": 0.3,
      "support": 0.1
    },
    "counters": {
      "evasion": 0.9,
      "physical_burst": 0.2
    },
    "team_capabilities": ["accuracy"],
    "limitations": ["expensive"]
  }
}
```

Для rollout покрывается небольшой, хорошо проверенный набор heroes/items. Отсутствие semantic записи снижает coverage и может приводить к отказу от уверенной рекомендации.

### 9.6. Threat aggregation

Концептуально:

```text
teamThreat(tag) =
    min(1, sum(heroThreat(hero, tag) × heroWeight))
```

Для MVP `heroWeight` может быть одинаковым. Engine не знает enemy net worth/level/items, поэтому не повышает конкретного героя как «самого богатого» без user-reported данных.

### 9.7. Connected team coverage

```text
uncoveredThreat(tag) =
    teamThreat(tag) × (1 - connectedTeamCoverage(tag))
```

Native hero capabilities могут быть получены из curated roster knowledge. Item capabilities надёжно известны только для подключённых clients.

`CHAT_MESSAGE_ITEM_PURCHASE` может повысить partial coverage для неподключённого ally, но не превращается в утверждение о его полном inventory.

Формулировка:

> Среди трёх подключённых игроков нет accuracy.

Не:

> У всей команды точно нет accuracy.

### 9.8. Hard filters

Исключить candidate, если:

- item отсутствует в curated catalog;
- obsolete/not purchasable;
- neutral/Roshan/event item;
- item уже завершён и не является явно настроенным upgrade path;
- role/hero fit ниже минимально допустимого runtime threshold;
- source data неполны настолько, что итог нельзя объяснить.

Recipes не выдаются как final item.

### 9.9. Scoring

```text
score(item) =
    hero_role_fit
  + enemy_threat_coverage
  - connected_team_redundancy
```

Точные веса находятся в config. Каждый из трёх terms сохраняется для text/log explanation. Неопределённость отражается отдельным `confidence/unknowns`, а не усложняет initial score.

Already completed item исключается hard filter до scoring. Core не пытается распознавать owned components, slot pressure, точную affordability или buyback reserve.

Последний `Buy` result хранится с context hash. Core hash включает:

```text
effective role
+ enemy roster
+ completed major items requester
+ connected team capabilities
```

Каждая перестановка slot или появление неизвестного minor component не должна менять target. Пока context не изменился, близкие scores не заставляют ответ прыгать между items. Target invalidated, когда он завершён, меняется role/roster/team capability или другой candidate получает явно значимое преимущество по configured hysteresis rule.

### 9.10. Core output contract

Без component resolver кнопка `Buy` означает:

> Какой следующий законченный предмет сделать целью сборки?

Она не означает:

> Какой компонент я могу купить на текущий gold прямо сейчас?

Core возвращает final target, причины и alternative. Он не говорит «купи Javelin сейчас», не вычисляет точный remaining gold и не заявляет, что определённый component уже учтён. Это явно указывается в text mirror; voice использует формулировку «следующая цель — ...».

Этот контракт проверяет главную MVP-гипотезу: способен ли Coach предложить полезное и объяснимое направление сборки по hero role, enemy threats и team redundancy.

### 9.11. Component recommendation — stretch

Если local catalog имеет проверенный precomputed recipe graph:

1. выбрать final item;
2. вычесть owned components;
3. получить missing components;
4. выбрать affordable component с immediate utility;
5. проверить влияние на buyback reserve.

```text
componentScore =
    immediate_utility
  + progress_toward_final_item
  + affordability
  - buyback_risk
  - shop_access_uncertainty
```

Если recipe schema не готова, MVP возвращает только final item. Это не считается блокером rollout.

Допустим промежуточный `Stretch-lite`: для малого curated catalog вручную задать проверенные component hints. Он не должен выдаваться за универсальный recipe resolver и обязан иметь те же owned/affordability guards для поддерживаемых items.

### 9.12. Пример результата

Voice:

> Дима, следующая цель — предмет X: вражеский состав создаёт проблему evasion, среди подключённых союзников нет accuracy, и предмет подходит твоей роли.

Text:

```text
Buy target → item X
Score: 76
Confidence: medium
Coverage: 3/5

Почему:
• +18 подходит hero/role
• +16 закрывает evasion threat
• +12 среди подключённых игроков нет accuracy

Альтернатива:
item Y — хуже закрывает основную threat, но подходит роли

Неизвестно:
• inventories двух неподключённых союзников
• enemy inventories и текущий net worth
• конкретный следующий component и remaining cost не рассчитываются в core MVP
```

## 10. Discord integration

### 10.1. Channel model

- один configured Discord server;
- один configured text channel;
- один configured voice channel;
- bot подключается к voice при startup или явной server-команде реализации;
- dynamic channel discovery не требуется.

### 10.2. Main interaction message

```text
Dota Coach

[ I'm lost ] [ Buy ]

[ 1 Carry ] [ 2 Mid ] [ 3 Offlane ] [ 4 Support ] [ 5 Hard Support ]
```

Сообщение создаётся или переиспользуется при старте bot. Нажатие содержит Discord user ID и action/role type. Action buttons запускают scoring; role buttons только обновляют роль пользователя для active match и возвращают ephemeral confirmation.

### 10.3. Interaction flow и debounce

Action request имеет in-memory debounce key:

```text
(matchId, discordUserId, actionType)
```

Начальный configurable default:

```yaml
discord:
  action_debounce_ms: 5000
```

Одинаковые `I'm lost` или `Buy` clicks одного игрока внутри окна не запускают новый context/scoring/TTS. Отличающийся action не блокируется этим ключом. Rejected interaction всё равно немедленно получает ephemeral ответ «Запрос уже обрабатывается», чтобы Discord не показывал interaction failure.

Role update является idempotent и обрабатывается отдельным lightweight path; повторный выбор той же роли не запускает scoring или speech.

```text
button click
→ in-memory debounce check
→ немедленный Discord acknowledgement/defer
→ resolve Discord user to client
→ freshness/match/team validation
→ resolve effective role
→ scoring engine
→ deterministic render
→ publish text mirror
→ enqueue TTS без ожидания playback
→ завершить interaction handler

background voice worker
→ synthesize/connect/play под deadlines
→ независимо записать delivery result
```

Discord требует initial interaction response в течение 3 секунд; scoring не должен расходовать этот deadline. После acknowledgement результат публикуется через edit/follow-up flow выбранного SDK. См. [официальный interaction contract](https://docs.discord.com/developers/interactions/receiving-and-responding).

Application debounce защищает UX и собственный backend, но не заменяет обработку Discord HTTP rate limits. SDK/HTTP adapter должен соблюдать `429` и server-provided retry headers, а не считать 5 секунд платформенным лимитом. См. [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits).

### 10.4. Voice format

- одно короткое предложение;
- начинается с configured alias;
- primary recommendation;
- не более двух основных причин;
- без score breakdown и длинных unknowns;
- без alternative, если фраза становится длинной.

### 10.5. Text mirror

Обязательно содержит:

- requester;
- effective role;
- primary candidate/score;
- confidence;
- coverage;
- 2–4 причины/penalties;
- одну alternative;
- unknowns;
- request latency, если нужен debug mode.

Text mirror является частью must-have, потому что он одновременно:

- компенсирует пропущенный звук;
- делает решение объяснимым;
- помогает debug weights;
- сохраняет контекст для обсуждения после матча.

Text mirror является primary delivery. Его отправка не ожидает TTS generation, voice readiness, reconnect, свободный audio player или предыдущие jobs. Voice — asynchronous best-effort дополнение.

### 10.6. Audio queue

```ts
type SpeechJob = {
  id: string;
  userId: string;
  coachAlias: string;
  requestType: "im_lost" | "buy";
  text: string;
  createdAt: number;
  expiresAt: number;
  status:
    | "queued"
    | "synthesizing"
    | "playing"
    | "completed"
    | "failed"
    | "timed_out";
};
```

Правила:

- один job воспроизводится за раз;
- остальные ждут FIFO;
- expired job удаляется;
- повторное нажатие той же кнопки одним игроком временно дедуплицируется;
- если TTS/voice недоступен, text mirror всё равно отправляется;
- ошибки одного job не ломают очередь;
- timeout текущего playback принудительно освобождает очередь.

`expiresAt` защищает только ожидающие jobs и не заменяет timeout уже запущенной операции. Worker имеет отдельные deadlines:

```yaml
voice:
  job_ttl_ms: 20000
  tts_timeout_ms: 7000
  voice_ready_timeout_ms: 3000
  playback_timeout_ms: 15000
  consecutive_failures_before_text_only: 2
```

Это стартовые configurable defaults для smoke-test, а не окончательные SLA.

Lifecycle одного job:

```text
dequeue
→ reject if expired
→ synthesize under TTS deadline
→ recheck expiration
→ wait for voice readiness under deadline
→ play under hard playback deadline
→ always stop player/encoder and release resource in finally
→ continue with next queued job
```

При timeout job не повторяется автоматически: часть фразы могла уже прозвучать. Text mirror остаётся delivery fallback. После configured числа последовательных voice failures bot временно переходит в text-only и восстанавливает voice connection вне основной queue; иначе каждый новый request будет последовательно ждать полного timeout.

На timeout реализация должна abort TTS request, остановить audio player и завершить связанный encoder/process, если выбранный SDK создаёт внешний процесс. `finally` выполняется для success, error и timeout.

Reconnect/resume никогда не выполняется внутри interaction handler и не задерживает text. Voice использует отдельные network lifecycle/heartbeat/resume mechanisms; детали делегируются выбранному SDK, а application-level watchdog ограничивает ожидание. См. [Discord voice connections](https://docs.discord.com/developers/topics/voice-connections).

### 10.7. Multi-user voice

В общем voice channel все слышат любой TTS. Поэтому:

- сообщение начинается с alias;
- ответ всегда короткий;
- два запроса не звучат параллельно;
- это on-demand flow: никакого unsolicited voice spam;
- персональная детализация остаётся в text.

## 11. Error handling

Минимальные user-facing случаи:

| Ситуация                                            | Ответ                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Discord user не связан с client                     | «Для твоего Discord-пользователя не настроен GSI client»                      |
| Snapshot отсутствует/stale                          | «Я не получаю свежие игровые данные»                                          |
| Матч ещё не начался                                 | «Совет доступен после загрузки текущего матча»                                |
| Clients в разных матчах/teams                       | Исключить несовместимые clients и показать coverage                           |
| Enemy roster incomplete                             | Выполнить partial scoring или честно отказать Buy                             |
| Curated catalog не покрывает roster                 | Снизить confidence/отказать вместо генерации tags                             |
| Нет item candidates после filters                   | «В текущем каталоге нет уверенной рекомендации»                               |
| TTS error                                           | Text уже доставлен; залогировать voice failure                                |
| TTS/voice/playback timeout                          | Abort/stop resource; text уже доставлен; продолжить queue                     |
| Несколько voice failures подряд                     | Временно text-only, async voice recovery                                      |
| Voice channel unavailable                           | Text-only degradation                                                         |
| Повторный одинаковый action click в debounce window | Немедленный ephemeral ACK; не запускать scoring/TTS повторно                  |
| Разные одновременные accepted actions               | Независимый scoring/text; voice jobs идут FIFO                                |
| Sticky timeline source stale                        | Продолжить current-only advice, отключить temporal claims, показать `unknown` |
| Role button без active fresh match                  | Не менять default role; объяснить, что override доступен в матче              |

## 12. Logging

Database не требуется. Писать append-only JSONL или structured application log.

```json
{
  "record_type": "coach_decision",
  "request_id": "...",
  "request_type": "im_lost",
  "discord_user_id": "...",
  "match_id": "...",
  "game_time": 1234,
  "effective_role": 2,
  "coverage": 3,
  "context_hash": "...",
  "features": {},
  "candidates": [],
  "selected": {},
  "unknowns": [],
  "text_latency_ms": 850,
  "delivery": {
    "text": true,
    "voice_status": "queued",
    "voice_failure_stage": null
  },
  "error": null
}
```

Voice завершается асинхронно, поэтому append-only log получает отдельную запись по тому же `request_id`:

```json
{
  "record_type": "speech_delivery",
  "request_id": "...",
  "speech_job_id": "...",
  "status": "completed",
  "failure_stage": null,
  "latency_ms": 2100
}
```

Не обязательно логировать полный raw snapshot. Достаточно normalized feature vector, candidates и result.

## 13. Rollout readiness checklist

### Multi-client

- два или более clients одновременно обновляют state;
- Discord user получает именно свой requester context;
- teammate data включаются только при same `matchid/team`;
- stale teammate исключается из exact coverage;
- freshest minimap используется без stale union;
- shared timeline не дублирует одно событие от нескольких clients;
- timeline source остаётся sticky весь матч;
- snapshots других clients не обновляют shared temporal deltas;
- stale timeline source переводит temporal features в degraded/unknown без automatic failover;
- возврат того же source создаёт baseline без synthetic deltas;
- `provider.timestamp` разных clients не используется как global ordering;
- coverage отображается в text.

### Temporal memory

- смена `matchId` очищает previous match memory и role overrides;
- первый snapshot/restart/recovery создаёт baseline без ложного delta;
- enemy roster сохраняется после ухода hero в fog, но `currentlyVisible` сбрасывается;
- player/hero samples старше 90 секунд удаляются;
- building windows 6/15/30 секунд используют elapsed time, а не snapshot count;
- repeated GSI events дедуплицируются;
- raw chat и raw snapshot archive не создаются.

### “I'm lost”

- каждый must-have action можно воспроизвести fixture/test snapshot;
- hard gates срабатывают до scoring;
- recent building damage отличается от просто low building HP;
- stale building source не создаёт claim о current pressure;
- previous advice hysteresis не блокирует urgent hard gate;
- score breakdown объясняет top-1;
- partial coverage не превращается в категоричный team claim;
- при отсутствии уверенного candidate Engine умеет отказать.

### “Buy”

- enemy roster корректно преобразуется в known threat tags;
- неизвестный hero не получает выдуманные tags;
- current inventory исключает completed item;
- connected teammate items влияют на redundancy/coverage;
- allied purchase events используются только как partial evidence;
- одинаковый context не вызывает oscillation между items с близким score;
- смена effective role инвалидирует Buy context;
- core score содержит только role fit, enemy threat coverage и connected team redundancy;
- gold/buyback/components/slot pressure не влияют на core score;
- voice говорит «следующая цель», а text явно помечает final-item contract;
- core не показывает точный remaining cost или следующий component;
- alternative отличается по смыслу покрытия threats/role fit;
- component suggestion не блокирует rollout.

### Discord/TTS

- обе action buttons и пять role buttons идентифицируют Discord user;
- role override действует только на текущий матч и только для requester;
- accepted/rejected interaction получает initial ACK/defer в пределах Discord deadline;
- одинаковый action одного user дедуплицируется до scoring по 5 s initial window;
- разные actions не блокируют друг друга debounce key;
- text mirror публикуется до enqueue/ожидания voice;
- interaction handler не выполняет voice reconnect/playback;
- bot находится в configured voice channel;
- ответы двух игроков воспроизводятся последовательно;
- alias произносится первым;
- TTS failure деградирует в text;
- TTS generation, voice readiness и playback имеют отдельные deadlines;
- зависший player/encoder освобождается, следующий job продолжает queue;
- серия voice failures включает text-only circuit breaker;
- повторные clicks не создают audio storm.

## 14. Проверка ценности после rollout

Основные вопросы после игровых сессий:

### Usage

- нажимали ли игроки кнопки добровольно;
- использовали ли их повторно в следующих матчах;
- какая кнопка использовалась чаще;
- не была ли механика кнопок слишком неудобной во время игры.

### Relevance

- соответствовала ли рекомендация ситуации;
- был ли приемлемый вариант среди primary/alternative;
- были ли причины понятными;
- достаточно ли final-item target или игроку нужен конкретный next component;
- не воспринимал ли игрок `Buy` как обещание немедленно доступной покупки;
- какие missing данные сделали ответ хуже.

### Trust

- мог ли игрок объяснить, почему Engine выдал ответ;
- мог ли указать конкретно неправильный weight/tag;
- не выдавал ли Coach unknown за факт;
- возвращался ли игрок к функции после неправильного совета.

### Voice UX

- был ли ответ слышен и понятен;
- мешал ли он разговору команды;
- был ли слишком длинным;
- успевал ли прийти до потери актуальности;
- нужен ли text mirror.

### Не использовать как ранний главный KPI

- победа/поражение;
- изменение MMR;
- KDA;
- факт выполнения совета;
- единичный успешный/неуспешный fight.

Жёсткие go/no-go thresholds определяются после получения baseline первой группы, а не придумываются до rollout.

## 15. Порядок реализации в timebox

Ориентиры зависят от существующего кода и не являются обязательным контрактом.

| Шаг                                                        |   Ориентир |
| ---------------------------------------------------------- | ---------: |
| Static config и client↔Discord mapping                     |  20–40 мин |
| Latest-state multi-client aggregator                       |  45–75 мин |
| MatchMemory: roster/last-seen/buildings/events/player ring |  45–90 мин |
| Discord message/buttons                                    |  30–60 мин |
| Match-scoped role buttons/override                         |  20–40 мин |
| Voice connection, TTS и audio queue                        | 60–150 мин |
| Упрощённый “I'm lost”                                      |  60–90 мин |
| Core final-target “Buy” + curated data                     | 60–120 мин |
| Text mirror, logs и error guards                           |  45–60 мин |
| Smoke-test с двумя clients                                 |  30–60 мин |

Рекомендуемый implementation order:

1. latest-state ingest и identity mapping;
2. match lifecycle, sticky timeline source и compact `MatchMemory`;
3. multi-client context builder;
4. action/role buttons с временным text stub;
5. `I'm lost` scoring + text;
6. `Buy` scoring + text;
7. Discord debounce, ACK/defer и text-first delivery;
8. TTS/audio queue с deadlines/watchdog;
9. error/stale/degraded-timeline handling;
10. двухклиентный smoke-test;
11. component recommendation только при оставшемся времени.

Text-first порядок сохраняет работающий MVP, даже если Discord voice integration займёт больше ожидаемого.

## 16. План сокращения при выходе за timebox

Резать в следующем порядке:

1. component recommendation;
2. размер curated hero/item catalog;
3. farm/income trend как scoring feature, сохранив базовый short ring;
4. inventory milestones для неподключённых allies;
5. objective events в `I'm lost`, сохранив event dedup foundation;
6. `I'm lost` до четырёх actions;
7. coarse map model до `own/center/enemy`;
8. alternative из voice, сохранив её в text;
9. debug details из публичного text, сохранив их в log;
10. usable/not-usable feedback UI.

Не резать:

- Discord user → GSI client mapping;
- freshness validation;
- same-match/same-team aggregation;
- connected coverage;
- enemy roster/last-seen cache;
- building baseline и recent damage windows;
- sticky timeline/degraded-mode invariants;
- event deduplication;
- match-scoped role override;
- interaction debounce и prompt ACK/defer;
- audio queue deadlines/cleanup;
- text-first delivery независимо от voice;
- score breakdown в log;
- честные unknowns.

## 17. Открытые implementation decisions

Эта спецификация намеренно не выбирает:

1. язык и framework backend;
2. Discord SDK/library;
3. TTS provider/voice;
4. точный freshness threshold;
5. final button cooldown, job TTL и voice deadlines после smoke-test;
6. конкретные numerical scoring weights;
7. минимальный curated hero/item pool первого rollout;
8. raw catalog version/patch identifier;
9. точную coarse map geometry;
10. формат structured logs;
11. способ запуска bot в voice: startup или admin command;
12. нужен ли feedback UI в первом rollout;
13. какой component Stretch использовать при оставшемся времени: curated hints или full recipe DAG;
14. нужен ли persistent recovery role/history после process restart в следующей версии;
15. какие normalized event types реально участвуют в первом `I'm lost` scoring;
16. нужен ли automatic timeline failover через per-client reducers после MVP;
17. как выбрать initial sticky timeline source: первый fresh client или configured primary.

Решения принимаются по существующему codebase/stack перед реализацией, а не подменяются предположениями в product scope.

## 18. Итоговый вертикальный срез

Первый rollout считается функционально собранным, когда сценарий работает end-to-end:

```text
1–5 clients отправляют GSI
→ backend хранит свежий state и compact MatchMemory
→ role button при необходимости задаёт effective role на матч
→ игрок нажимает Discord button
→ server определяет requester и connected team coverage
→ engine строит объяснимую рекомендацию
→ полный breakdown сразу появляется текстом
→ voice job асинхронно попадает в FIFO queue
→ bot произносит короткий ответ с alias под playback watchdog
→ request/result доступны в structured log
```

Это минимальный срез, который одновременно проверяет:

- полезность “I'm lost”;
- полезность contextual “Buy”;
- multi-client foundation;
- temporal context без raw snapshot archive;
- graceful degradation при stale timeline source;
- match-scoped role swaps;
- Discord debounce и text-first response;
- персонализацию по Discord user;
- пригодность TTS в общем voice channel;
- доверие к объяснимому Weighted Scoring Engine.
