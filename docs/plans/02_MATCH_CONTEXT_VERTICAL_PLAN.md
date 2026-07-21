# Match Context Vertical Implementation Plan

## Status

- Plan status: `approved`
- Issue: not assigned
- Current implementation phase: `Phase 3 — Match Lifecycle and Timeline RED (not-started)`
- Last updated: `2026-07-21`

Status values:

- `draft` — plan is being reviewed and is not yet an implementation contract
- `approved` — fixed decisions and phase boundaries are accepted
- `in-progress` — a GREEN or verification phase is active
- `not-started` — phase has not started
- `red-expected` — phase intentionally ends with its new specs failing for the expected missing behavior
- `completed` — phase exit criteria are met
- `blocked` — a contract decision or external dependency prevents progress

An intentional RED phase is valid when its specs fail only for the expected missing behavior, compile-safe seams exist,
and all previously green coverage remains green.

## Inputs

- [MVP rollout specification](../dota2_ai_coach_mvp_spec.md)
- [GSI Turbo match report](../gsi_turbo_match_report.md)
- [Completed runtime base vertical](./01_RUNTIME_BASE_VERTICAL_PLAN.md)
- [Current match public API](../../apps/runtime/src/modules/match/public.ts)
- [Current GSI router](../../apps/runtime/src/integrations/gsi/gsi.router.ts)
- [Current runtime composition root](../../apps/runtime/src/bootstrap/create-runtime.ts)
- [Current runtime settings](../../apps/runtime/src/platform/config/parse-runtime-settings.ts)

## Starting Point

The completed runtime base vertical already provides:

- one Node.js/TypeScript ESM runtime process;
- startup-validated public client and private credential configuration;
- authenticated `POST /gsi` ingest through native `auth.token`;
- a transport-neutral `RecordClientSnapshot` command;
- immutable in-memory latest state per trusted client;
- safe HTTP error contracts, structured logging, health, graceful shutdown, and local Compose operation;
- enforced source-category and module import boundaries.

The current `match` module stores only the authenticated client's identity, an ISO receive time, and the latest
auth-stripped raw object. It does not yet understand match identity, team, freshness, lifecycle, temporal state,
coverage, or coaching context. This plan extends that existing seam; it does not replace the HTTP vertical or create a
second ingest path.

## Fixed Decisions

### Vertical and compatibility

1. This slice is the internal `Match Context Vertical` and implements the next two foundation steps from the MVP
   order: match lifecycle with compact `MatchMemory`, then multi-client context building.
2. The vertical remains inside the existing runtime modular monolith. It does not create another process, package,
   service, container, or database.
3. `modules/match` owns normalized match facts, latest client state, active match lifecycle, temporal memory, role
   overrides, coverage, and factual coaching-context queries.
4. `integrations/gsi` remains the inbound adapter. It owns raw GSI field names and best-effort conversion into the
   normalized input accepted by the public `match` API.
5. The existing `POST /gsi` transport contract remains unchanged: an authenticated non-null JSON object returns an
   empty `200 OK`; top-level shape, authentication, media-type, size, and JSON syntax failures retain their approved
   status/code mappings.
6. Nested GSI sections are optional and are not promoted into transport-level required fields. Missing, partial, or
   unsupported nested data normalizes to absent facts and does not create a new `422` response.
7. An expected malformed nested field is ignored by the tolerant normalizer and must not crash ingest. Unexpected
   programming/infrastructure failures continue to use the existing `500 INTERNAL_ERROR` path.
8. The authenticated identity and normalized snapshot cross into `match`; the raw request object, `auth`, Express
   types, and raw GSI types do not.
9. No new public or temporary HTTP read/debug endpoint is added. The vertical is observed through application APIs,
   deterministic specs, safe bounded logs, and the existing ingest endpoint.

### Normalized latest client state

10. Raw snapshots are not archived or retained as history. Once normalization and state update complete, only the
    latest normalized state, bounded temporal samples, compact change events, caches, and match-scoped overrides
    remain reachable.
11. The normalized boundary is deliberately additive. This slice maps only facts required for lifecycle, temporal
    memory, coverage, and the initial `CoachContext`; later `buy` and `lost` plans may add current-only fields without
    changing GSI transport behavior.
12. Normalized domain names express game meaning rather than raw wire spelling. For example, `matchId`, `teamSlot`,
    and `position` belong to the normalized contract; `map.matchid`, `player.team_slot`, and `xpos/ypos` remain GSI
    adapter knowledge.
13. The minimum normalized snapshot contains nullable source timestamp and match lifecycle facts, the local player and
    hero sample when usable, current minimap hero observations, local-team building observations, and normalized
    non-chat events.
14. `matchId` remains a string. It is usable only when non-empty; it is never coerced through JavaScript number types.
15. Team normalization accepts only the confirmed Radiant/Dire representations. Unknown values become `null`; the
    application does not guess a team from client configuration or hero position.
16. A normalized local player sample is emitted only when the fields needed by the temporal sample are finite and
    semantically usable. Partial current facts may remain available separately, but they do not create fabricated
    zero-valued history.
17. Minimap object keys such as `o0` are frame-local indexes and never become entity IDs.
18. Raw chat messages are discarded during normalization and are not stored, fingerprinted, or logged.
19. Except for a finite numeric `provider.timestamp` mapped to normalized source metadata, provider fields, raw
    `previously`/`added`, wearables, league, draft, couriers, neutral items, lane creeps, wards, abilities, and complete
    item history remain outside this slice.
20. Latest client state is canonically keyed by stable `clientId`. Unique `discordUserId` remains a query identity;
    the in-memory implementation may maintain an index but must not duplicate mutable client state.
21. Replacing one client's latest state does not mutate another client's state. Stored state remains immutable from a
    caller's point of view.
22. Configured-client identity and observed latest state remain distinct. A safe immutable client directory resolves
    `discordUserId` to `ClientIdentity` without exposing token material, allowing context queries to distinguish an
    unknown Discord user from a configured client that has not sent a snapshot.

### Time and freshness

23. Freshness is configurable through process setting `GSI_FRESHNESS_MS`; the initial default is `5000` milliseconds.
    The local Compose value remains public repository configuration, and production may provide the same setting from
    the separate GitOps repository.
24. Invalid freshness configuration fails startup before port binding through the existing configuration-error path.
25. Freshness and temporal windows use an injected server-side monotonic millisecond clock. Provider timestamps and
    game clocks are retained as game facts but never determine delivery order or wall-clock age.
26. A client is fresh when `now - receivedAt < freshnessMs`. At the exact boundary it is stale.
27. Negative age caused by a fake/test clock is an invalid test setup; production code does not silently clamp it.
28. Timeline staleness is evaluated on ingest and context query. The MVP does not add a timer, scheduler, or background
    cleanup loop merely to flip a status value.

### Active match and multi-client aggregation

29. The runtime supports one active `MatchSession` identified by the pair `(matchId, team)`.
30. The first fresh normalized snapshot containing both a usable `matchId` and `team` creates the active session and
    selects that client as `timelineSourceClientId`.
31. A client participates in the active context only while it is fresh and its latest state has the same `matchId` and
    `team` as the active session.
32. A snapshot from another match or team still replaces that client's latest state, but it does not mutate the active
    session, its roster, role overrides, or temporal memory.
33. Only the sticky timeline source may roll the active session to a different valid `(matchId, team)` pair. Rollover
    clears all previous match memory and overrides, then baselines the new session.
34. A missing match section in one source snapshot is not by itself proof that the match ended. An observed source
    transition through `POST_GAME` followed by no match, or a new valid source match pair, ends/replaces the session.
35. If the process starts without usable match/team facts, no session exists. Heartbeats still update latest client
    state but do not create temporal memory.
36. Requester lookup for future Discord interactions uses the safe client directory and `discordUserId`, then requires
    a fresh latest client state
    that belongs to the active session.
37. Same-match/same-team teammates are selected from fresh latest states at query time. `teammates` excludes the
    requester; coverage is the number of fresh connected team clients divided by five and is capped at `1`.
38. `sharedSnapshot` is the normalized snapshot of the freshest usable same-session client. Equal receive times use a
    deterministic stable `clientId` tie-break so specs and outputs do not oscillate.
39. Current minimap markers are never unioned across clients. Current positions and visibility come only from the
    selected freshest shared snapshot.

### Sticky timeline source

40. The initial timeline source is the first client that creates the session. It remains sticky until that session
    ends; configured priority and automatic failover are excluded.
41. The first source snapshot for a new session establishes a baseline and sets `timelineStatus` to `rebaselining`.
    The next consecutive usable source snapshot for the same session makes the timeline `healthy`.
42. Only source snapshots update shared delta-based reducers that multiple clients can observe at once: map
    transitions, enemy last-seen state from the shared minimap, and building health changes.
43. Every same-session client may update its own local-player sample ring because that stream represents a different
    player rather than a duplicate shared observation. Non-source clients never backfill missing shared deltas.
44. When source age reaches the freshness threshold, `timelineStatus` becomes `stale`. Current context may still use a
    different fresh client's current snapshot, but temporal claims that require continuity become unavailable.
45. The first returning source snapshot after stale creates a new baseline and sets `rebaselining`; changes across the
    gap do not create damage, movement, disappearance, or other delta events. Only the following consecutive source
    snapshot restores `healthy`.
46. Provider timestamps do not order snapshots between machines, and receive order from multiple clients is not a
    global last-write-wins timeline.

### Compact MatchMemory

47. `MatchMemory` is in-memory, match-scoped runtime state, not an event-sourcing contract. It is discarded on process
    restart and active-session reset.
48. The first observation of any delta-based stream is a baseline and never creates a transition, alert, damage event,
    or inferred movement.
49. Map memory stores compact lifecycle transitions and score changes, not every source snapshot.
50. Stable allied/enemy roster names may accumulate from valid current hero observations across same-session clients.
    Dynamic visibility and position still come only from the freshest current snapshot.
51. Enemy hero memory stores first seen, last seen, last known position, and current visibility. Last-seen age and
    trajectory-sensitive facts are usable only with a healthy timeline.
52. Duplicate/illusion-like minimap markers do not create duplicate roster heroes. Primary hero selection must be
    deterministic and conservative; uncertain copies may be ignored rather than asserted as real heroes.
53. Each connected player has a client-owned temporal sample ring retaining at most the latest `90_000` milliseconds,
    pruned by monotonic receive time rather than snapshot count.
54. Player history contains only normalized continuous values required by the MVP: game time, position, alive,
    HP/mana percent, level, XP, gold, last hits, denies, GPM/XPM, and confirmed cumulative income counters.
55. Current gold delta is not labelled farm income because purchases reduce gold. Temporal consumers use the available
    cumulative income counters, LH, and XP with honest unknowns.
56. If an individual client becomes stale, its first returning local-player sample rebaselines that player's ring for
    continuity-sensitive trends. A gap is not interpreted as continuous movement, farming, resource loss, or death.
57. Building memory records the source baseline and health changes only. Initial decision windows are `6_000`,
    `15_000`, and `30_000` milliseconds for active damage, recent damage, and pressure context respectively.
58. Building window values are injected domain policy values and validated in increasing order. Their initial defaults
    come from the MVP evidence; they are not universal Dota invariants.
59. Health increases update the building baseline but are not pressure. Missing building sections do not imply that all
    buildings were destroyed, especially in `POST_GAME`.
60. A building disappearance may be retained as unknown unless a prior zero-health observation or correlated supported
    event provides enough evidence. GSI does not identify an attacker or damage source.
61. Non-chat events from all fresh same-session clients may enter event memory because they are deduplicated by a
    deterministic fingerprint over normalized event type, logical game time, and canonical normalized payload.
62. Event fingerprints do not use array index, client identity, or first receive time. Repeated delivery of the same
    sliding-window event across snapshots or clients produces one memory entry.
63. Generic event JSON is parsed only inside the GSI adapter. Unsupported or malformed inner payloads do not cross as
    raw strings; approved scalar facts are normalized or the event is ignored.
64. Exact event types consumed by the future `lost` engine remain deferred. This slice builds trustworthy normalized
    storage and deduplication without assigning scoring meaning.
65. Inventory milestones and advice memory are excluded. Current inventory remains authoritative in the future `buy`
    slice, and advice stability belongs to the engine that creates advice.

### Coaching context and role override

66. `CoachContext` is a factual read model owned by `match`. It contains requester state, effective role, fresh
    teammates, coverage, session identity, freshest shared normalized snapshot, stable rosters, temporal features, and
    machine-readable unknowns.
67. `CoachContext` does not contain recommendation candidates, weights, scores, rendered user text, Discord types, or
    voice concerns.
68. Expected query failures are explicit application results rather than infrastructure exceptions: unknown client,
    no latest state, stale requester, no active match, or requester outside the active session.
69. Effective role is `match-scoped override ?? configured defaultRole`. The override is keyed by requester identity,
    is idempotent, permits duplicate roles across players, and is cleared with the session.
70. The slice exposes an internal public `match` command for setting the requester's own role override. Authorization
    and Discord button mapping remain future integration concerns; callers cannot set another identity implicitly.
71. Temporal features expose factual availability and timeline status. When the shared timeline is stale or
    rebaselining,
    continuity-dependent fields are absent and an explicit unknown code is returned; values are never silently reused
    as current facts. Independently continuous requester/player trends may remain available when their own client ring
    has no gap.
72. No coarse map geometry, action classification, scoring, hysteresis, recommendation rendering, or generic scoring
    abstraction is implemented here.

### Configuration, composition, and observability

73. `GSI_FRESHNESS_MS` joins the existing process settings. Building windows and player-history retention are explicit
    immutable policy dependencies with the MVP defaults; they may be promoted to public runtime configuration later
    without changing match-domain APIs.
74. The composition root constructs one normalized latest-state store, one active-session store, the safe client
    directory adapter,
    ingest/update use cases, context query, and role-override command, then injects only the ingest command into GSI.
75. In-memory infrastructure owns storage mechanics only. Session transitions, freshness rules, baselining, reducer
    decisions, and context selection remain domain/application behavior.
76. Logs may include bounded metadata such as `clientId`, `matchId`, team, timeline status, coverage count, normalized
    observation counts, and transition reason. They must not include raw snapshots, raw event payloads, Discord user
    IDs, aliases, auth tokens, inventories, positions, or chat content.
77. Expected absence/staleness returned by internal context queries is not logged as an application error. Unexpected
    reducer failures retain request correlation and the established safe error boundary.

## Deferred Decisions

The following decisions are intentionally not guessed in this slice:

1. Discord SDK, interaction transport, buttons, acknowledgement flow, and text delivery contract.
2. Which normalized event types and temporal features contribute to the first `lost` scoring engine.
3. `buy` current inventory schema, inventory milestones, item catalog, and final-target scoring contract.
4. Coarse map geometry, lane assignment, wave modelling, ward tracking, and trajectory claims.
5. Automatic timeline-source failover, configured client priority, and per-client parallel temporal reducers.
6. Persistence or restart recovery for sessions, role overrides, history, events, or advice.
7. Public frontend/debug APIs and API versioning.
8. Promotion of building/player policy defaults into a consolidated public runtime YAML document.
9. Advice memory, recommendation context hashes, cooldowns, and engine-specific hysteresis.
10. Post-match retention, analytics export, raw snapshot archive, and replay/event-sourcing contracts.
11. Discord/TTS/LLM error mapping, deadlines, queues, and deployment topology.

Deferred decisions must be resolved before the phase that consumes them. They must not be represented by placeholder
folders, generic abstractions, fake data, or accidental defaults in this vertical.

## Scope Exclusions

- New HTTP routes or changes to approved `GET /health` and `POST /gsi` response contracts
- Discord startup, action buttons, role buttons, debounce, ACK/defer, and text mirror
- `lost` and `buy` modules, candidates, scoring, rendering, or curated game data
- TTS provider, audio queue, voice lifecycle, or watchdogs
- Inventory milestone history and advice memory
- Database, durable cache, raw snapshot history, post-match storage, or restart recovery
- Full raw GSI schema validation or rejection of partial nested GSI sections
- Automatic source failover or multi-session operation
- Full minimap tracker, illusion classifier, lane creeps, wards, courier paths, and lane geometry
- Frontend endpoints, CORS, shared frontend packages, and browser contracts
- Python/LLM runtime, prompts, transport, retries, and circuit breakers
- Kubernetes, Kustomize, KSOPS, Argo CD, SOPS age, and production rollout resources
- Generic `shared`, `common`, `services`, `utils`, `recommendations`, or scoring-engine buckets

## Target Vertical

```text
authenticated POST /gsi
        │
        ▼
integrations/gsi
  tolerant raw GSI normalization
        │
        ▼
modules/match public API
  recordClientSnapshot
        │
        ├──────────────► normalized latest state per client
        │
        └──────────────► active MatchSession
                           │
                           ├─ sticky timeline state machine
                           ├─ compact MatchMemory reducers
                           └─ match-scoped role overrides
                                      │
Discord user id + monotonic now ──────┘
                                      │
                                      ▼
                              buildCoachContext
                                      │
                                      ▼
                        ready context or explicit unavailable result
```

The vertical is complete when one to five authenticated clients can continuously ingest partial GSI data, only fresh
same-match/same-team clients contribute to current context, one sticky source controls shared temporal deltas, compact
memory remains bounded and resets correctly, role overrides are match-scoped, and an internal query returns a factual
`CoachContext` without exposing a new HTTP endpoint.

## Architectural Boundaries

### GSI normalization boundary

The adapter performs stateless, best-effort mapping from the auth-stripped raw object into normalized facts. It may:

- validate individual scalar values and discard unsupported ones;
- map confirmed team and lifecycle representations;
- convert positions and percentages to normalized value objects;
- select conservative current hero observations from minimap markers;
- parse approved event envelopes and the nested JSON of `generic_event`;
- remove chat and unsupported raw fields.

It must not:

- select the active match or timeline source;
- determine freshness or coverage;
- compare a snapshot with previous state;
- update building/last-seen/player history;
- assign coaching meaning, urgency, action, score, or user-facing wording;
- import match internals instead of `modules/match/public.ts`.

### Match application boundary

Application use cases coordinate normalized input and domain state:

- `recordClientSnapshot` replaces latest client state and advances the active session when allowed;
- `buildCoachContext` resolves the requester, evaluates freshness, selects the same-session group and freshest shared
  snapshot, then reads temporal features;
- `setRequesterRoleOverride` validates requester/session membership and updates only that requester's match-scoped role.

Expected unavailable states use discriminated results. Infrastructure exceptions are not converted into fake
`unknowns`.

### Match domain boundary

The domain owns pure decisions and reducers for:

- usable match/team identity;
- session create/end/rollover;
- source state transitions;
- baseline versus delta updates;
- roster and enemy visibility memory;
- bounded player samples;
- building change windows;
- event fingerprinting/deduplication;
- context availability, coverage, effective role, and unknown codes.

Domain functions receive explicit state, policy, and monotonic time. They do not read environment variables, files,
the system clock, Express objects, or global singletons.

### In-memory infrastructure

Infrastructure implements ports for normalized latest client state and the single active session. It may use `Map`,
bounded arrays/ring buffers, and immutable copies. It must not hide domain transitions inside generic `save` methods or
return mutable collections owned by the store.

### Time boundary

Wall time and monotonic time have different purposes:

- Pino owns log timestamps;
- monotonic milliseconds own freshness, retention, and decision-window age;
- GSI `provider.timestamp` is diagnostic source metadata only;
- `map.game_time` and `clock_time` are match timeline facts only.

Tests inject deterministic clocks and do not wait on real time.

### Public module API

`modules/match/public.ts` is the only cross-module import surface. It exports the commands, query results, and stable
normalized input types required by GSI and future Discord consumers. Store implementations, reducers, event
fingerprints, ring-buffer mechanics, and raw adapter types remain internal.

`match` imports neither `integrations/gsi` nor future `discord`, `buy`, or `lost` modules.

## Contract Baseline

The exact TypeScript names may improve during implementation, but the semantic boundary remains equivalent to:

```ts
type Team = "radiant" | "dire";
type Role = 1 | 2 | 3 | 4 | 5;
type TimelineStatus = "healthy" | "stale" | "rebaselining";

type NormalizedClientSnapshot = Readonly<{
  sourceTimestampSeconds: number | null;
  match: NormalizedMatchFacts | null;
  player: NormalizedPlayerFacts | null;
  hero: NormalizedHeroFacts | null;
  minimapHeroes: readonly NormalizedHeroObservation[];
  buildings: readonly NormalizedBuildingObservation[];
  events: readonly NormalizedMatchEvent[];
}>;

type ClientState = Readonly<{
  identity: ClientIdentity;
  receivedAt: number;
  snapshot: NormalizedClientSnapshot;
}>;
```

The context query returns an explicit result instead of nullable partial output:

```ts
type BuildCoachContextResult =
  | Readonly<{ status: "ready"; context: CoachContext }>
  | Readonly<{
      status:
        | "client_not_found"
        | "snapshot_missing"
        | "snapshot_stale"
        | "match_unavailable"
        | "outside_active_session";
    }>;
```

`CoachContext` includes immutable normalized facts only:

```ts
type CoachContext = Readonly<{
  requester: ClientState;
  effectiveRole: Role;
  teammates: readonly ClientState[];
  coverage: number;
  matchId: string;
  team: Team;
  sharedSnapshot: NormalizedClientSnapshot;
  alliedRoster: readonly string[];
  enemyRoster: readonly string[];
  temporalFeatures: TemporalFeatures;
  unknowns: readonly MatchContextUnknown[];
}>;
```

Collections exposed by public results are immutable and deterministically ordered. Sets, maps, mutable ring buffers,
and internal baselines do not cross the public boundary.

Normalization uses one absence convention across the public input contract:

- an absent or unusable singleton section/scalar fact is `null`, not `undefined`;
- an absent collection is an empty readonly array;
- only finite JSON numbers are accepted as numeric facts; numeric-looking strings are not coerced;
- `sourceTimestampSeconds` is diagnostic metadata and never participates in freshness or cross-client ordering.

## Lifecycle and Timeline State Machine

```text
no session
  └─ first usable match/team snapshot
       → create session
       → select source
       → baseline
       → rebaselining

rebaselining
  ├─ next consecutive source snapshot → healthy
  ├─ source reaches freshness limit   → stale
  └─ source changes match pair        → reset + new baseline

healthy
  ├─ source snapshot                  → update temporal reducers
  ├─ non-source snapshot              → latest state + its client-local player ring
  ├─ source reaches freshness limit   → stale
  └─ source changes match pair        → reset + new baseline

stale
  ├─ non-source snapshot              → latest/current context + its client-local player ring
  ├─ returning source snapshot        → discard gap deltas + rebaselining
  └─ returning source new match pair  → reset + new baseline
```

No transition automatically selects another client as source. Querying a stale timeline may still return `ready` when
the requester has a fresh same-session state; continuity-dependent temporal features are absent and explain their
unavailability through stable unknown codes.

## MatchMemory Retention Baseline

| Memory area           | Writer                              | Retention               | Stale/rebaseline read behavior                            |
| --------------------- | ----------------------------------- | ----------------------- | --------------------------------------------------------- |
| Map transitions       | sticky source                       | active match            | historical facts remain; current transition unknown       |
| Stable rosters        | valid same-session observations     | active match            | roster remains; current visibility uses freshest frame    |
| Enemy last seen       | sticky source                       | active match            | age/trajectory unavailable                                |
| Player samples        | each client's normalized local data | rolling 90 s            | that client's gap rebaselines continuity-sensitive trends |
| Building changes      | sticky source                       | active match            | active/recent pressure unavailable                        |
| Normalized events     | all fresh same-session clients      | active match, deduped   | already observed events remain factual                    |
| Role overrides        | explicit application command        | active match            | available while requester belongs to session              |
| Current client states | each authenticated client           | latest value per client | evaluated independently for freshness                     |

## Proposed File Layout

Exact filenames may change when implementation reveals a clearer local name, but ownership and dependency direction
must remain stable.

```text
apps/runtime/src/
├── bootstrap/
│   └── create-runtime.ts
├── integrations/
│   └── gsi/
│       ├── normalize-gsi-snapshot.spec.ts
│       ├── normalize-gsi-snapshot.ts
│       ├── gsi.router.ts
│       └── raw-gsi.types.ts
├── modules/
│   └── match/
│       ├── public.ts
│       ├── application/
│       │   ├── build-coach-context.spec.ts
│       │   ├── build-coach-context.ts
│       │   ├── client-directory.ts
│       │   ├── match-session-store.ts
│       │   ├── normalized-latest-state-store.ts
│       │   ├── record-client-snapshot.spec.ts
│       │   ├── record-client-snapshot.ts
│       │   ├── set-requester-role-override.spec.ts
│       │   └── set-requester-role-override.ts
│       ├── domain/
│       │   ├── client-state.ts
│       │   ├── context.ts
│       │   ├── event-memory.ts
│       │   ├── match-memory.ts
│       │   ├── match-session.ts
│       │   ├── normalized-snapshot.ts
│       │   ├── temporal-features.ts
│       │   └── timeline.ts
│       └── infrastructure/
│           ├── in-memory-match-session-store.spec.ts
│           ├── in-memory-match-session-store.ts
│           ├── in-memory-normalized-latest-state-store.spec.ts
│           └── in-memory-normalized-latest-state-store.ts
└── platform/
    ├── config/
    │   ├── parse-runtime-settings.spec.ts
    │   └── parse-runtime-settings.ts
    └── time/
        └── monotonic-clock.ts
```

Files may be split when a reducer has an independent invariant set and specs. Do not place unrelated reducers into one
generic manager, and do not create empty future module directories.

## Milestone Status

| Milestone                               | RED phase | GREEN phase | Status        |
| --------------------------------------- | --------- | ----------- | ------------- |
| M0. Contract baseline                   | —         | Phase 0     | `completed`   |
| M1. Normalized client-state boundary    | Phase 1   | Phase 2     | `completed`   |
| M2. Match lifecycle and sticky timeline | Phase 3   | Phase 4     | `not-started` |
| M3. Compact memory and coaching context | Phase 5   | Phase 6     | `not-started` |
| M4. Verification and handoff            | —         | Phase 7     | `not-started` |

## Phase 0 — Contract Baseline

Status: `completed`

Target end state: `green`

Confirm and record:

- this document's vertical, exclusions, ownership, and public-API boundaries;
- unchanged GSI HTTP behavior and tolerant nested normalization;
- the normalized minimum field set against real report examples;
- `5000 ms` initial freshness, monotonic age, and exact stale boundary;
- one active session and source-controlled rollover;
- first-client sticky source, no failover, and rebaselining behavior;
- the compact memory areas and retention/window defaults;
- match-scoped role override and internal-only context query;
- the absence of a public debug endpoint.

Completed:

- Approved the internal Match Context Vertical and its module ownership boundaries.
- Confirmed unchanged GSI HTTP behavior and tolerant nested normalization.
- Confirmed the normalized minimum field families against the GSI report.
- Confirmed `5000 ms` freshness, monotonic age, and the exact stale boundary.
- Confirmed one active session, first-client sticky source, source-controlled rollover, no failover, and rebaselining.
- Confirmed compact memory retention/window defaults, match-scoped role override, and internal-only context query.
- Confirmed that no public debug endpoint, external integration, scoring engine, or persistence enters this slice.

Confirmed the following deterministic sanitized fixture scenarios for Phase 1:

- heartbeat/no match;
- pre-game baseline with valid match/team;
- consecutive in-game snapshots with player, hero, minimap, buildings, and events;
- a partial snapshot with missing optional sections;
- malformed nested scalar/event data;
- duplicate event delivery and duplicate minimap hero markers;
- source gap, return, and match rollover;
- two same-team clients plus a foreign-match/team client.

Exit criteria:

- The plan is changed from `draft` to `approved` before Phase 1 implementation starts.
- Fixture requirements prohibit auth tokens, Discord identities, player names, raw chat, and other unnecessary personal
  data.
- No unresolved decision blocks normalization RED specs.

## Phase 1 — Normalization and Client State RED

Status: `completed`

Target end state: `red-expected`

Completed:

- Inspected only targeted projections from the local 2,125-snapshot capture with `jq`; the large capture was not
  copied, committed, or emitted wholesale.
- Added small sanitized heartbeat, full-state, malformed-nested, minimap, building, and supported-event fixtures based
  on the confirmed capture shapes. Chat text used by the discard guard is synthetic.
- Added immutable normalized snapshot, event-union, normalized client-state, client-directory, and normalized-store
  boundary types under `modules/match`.
- Added explicit partial raw GSI adapter types and an unwired normalizer that intentionally returns the empty normalized
  baseline until Phase 2.
- Added an unwired normalized latest-state store and safe Discord identity lookup seam with intentional no-op/null
  implementations for Phase 2.
- Added RED specs for heartbeat/full/invalid normalization, deep immutability, per-client normalized state replacement,
  store-owned copies, and safe Discord identity resolution.
- Added a green HTTP regression proving malformed optional nested fields retain the authenticated empty `200 OK`
  contract while Phase 1 leaves the production raw ingest path unchanged.
- Verified `typecheck`, ESLint, Prettier, the ESM build, built-runtime smoke, and `git diff --check` are green.
- Verified the prior regression set remains green: 9 suites, 57 tests passed, with only the new Discord RED test
  excluded by name and the two new RED suites excluded by path.
- Recorded the intentional RED result: 3 suites and 6 tests fail only on the empty normalizer, no-op normalized store,
  and null Discord lookup; 8 suites and 58 tests pass in the complete run.

Resolved before starting:

- The local evidence source is `tmp/gsi_valid_turbo_match.json`, the same 2,125-snapshot single-match capture used by
  the GSI report.
- The large source file is inspected only with targeted `jq` projections. It is not copied into tests, emitted in tool
  output, committed, or read through line-oriented whole-file commands.
- Nullable singleton/scalar facts use explicit `null`; collections use empty readonly arrays; numeric-looking strings
  are not coerced.
- Only finite numeric `provider.timestamp` is retained as nullable `sourceTimestampSeconds` diagnostic metadata.
- Normalized non-chat envelopes cover the four shapes present in the capture: `generic_event`,
  `bounty_rune_pickup`, `roshan_killed`, and `aegis_picked_up`.
- `generic_event.data` accepts only valid JSON objects and retains an allowlist of scalar `type`, `time`, `value*`, and
  `playerid*` fields. Unsupported keys and malformed inner JSON are discarded rather than retained raw.
- Raw `chat_message` events and all message text are excluded before the normalized boundary.
- Phase 1 adds compile-safe, unwired seams. The existing GSI router and raw latest-state production path are replaced
  only in Phase 2, keeping the completed base suite green during RED.

Local implementation sequence:

1. Use targeted `jq` queries to select the minimum representative evidence for heartbeat, pre-game/full-state,
   in-game, post-game, building, minimap-hero, and each non-chat event shape.
2. Create small hand-reviewed sanitized raw fixtures next to the normalizer spec. Fixtures contain only fields consumed
   by the contract and use synthetic identity-like values where identity is not discarded entirely.
3. Add immutable normalized snapshot/value types under `modules/match/domain` and export only the GSI-facing input
   types through `modules/match/public.ts`.
4. Add explicit partial raw GSI types and an unwired `normalizeGsiSnapshot` seam under `integrations/gsi`; raw field
   names remain confined to this integration.
5. Add compile-safe normalized latest-state and safe client-directory seams without routing production requests
   through them yet.
6. Add intent-driven RED specs in four groups: normalization/absence, privacy and malformed data, normalized-state
   isolation/immutability, and safe Discord identity lookup.
7. Run the existing suite and repository checks, recording that prior coverage is green and only the new Phase 1 specs
   fail for the expected missing implementations.

Add compile-safe seams and failing specs for:

- deterministic sanitized fixtures covering the scenarios approved in Phase 0;
- raw `map`, `player`, `hero`, minimap hero, building, and event mapping;
- string-preserving match identity and conservative team normalization;
- optional/missing sections and invalid nested values;
- non-retention of raw chat and unsupported raw sections;
- immutable normalized values and deterministic collection ordering;
- monotonic numeric receive time;
- independent latest state for multiple clients;
- lookup by stable `clientId` plus safe configured identity resolution by unique `discordUserId` without duplicated
  state or token exposure;
- unchanged GSI `200` success for an authenticated partial object;
- absence of raw GSI types and field names from `modules/match`.

Previously green health, auth, error, startup, and raw-ingest regression coverage must remain green.

Exit criteria:

- New specs compile and fail only because the normalized adapter/state behavior is not implemented.
- No lifecycle, timeline, memory, or context behavior is implemented prematurely.

## Phase 2 — Normalization and Client State GREEN

Status: `completed`

Target end state: `green`

Completed:

- Implemented stateless tolerant normalization for approved provider/map/player/hero/minimap/building and non-chat
  event facts with explicit null/empty absence, no numeric string coercion, deterministic building ordering, and deep
  immutable output.
- Implemented all four approved non-chat event envelopes and allowlisted nested `generic_event` parsing; malformed
  inner JSON, unknown events, chat messages, unsupported fields, and raw text are discarded.
- Implemented the immutable normalized latest-state store with client-scoped replacement, independent clients, owned
  copies, and numeric monotonic receive time.
- Implemented safe immutable Discord user ID lookup in the validated trusted-client registry without exposing token
  material.
- Added positive-integer `GSI_FRESHNESS_MS` process configuration with the approved `5000` default and explicit local
  Compose value.
- Added the Node monotonic-clock adapter and deterministic runtime/test injection.
- Wired the GSI router to normalize the authenticated auth-stripped object before invoking the public `match` command.
- Migrated `recordClientSnapshot` and runtime composition to normalized state and monotonic receive time.
- Removed the old raw `ClientSnapshot`, `LatestClientState`, raw latest-state port/store/spec, and all public exports for
  that path; codebase graph search confirms no old symbols remain.
- Preserved the approved `POST /gsi` success/error contracts and safe logging behavior, including malformed optional
  nested fields.
- Verified the complete runtime check is green: type checking, ESLint, Prettier, 10 Jest suites/64 tests, ESM build,
  built-runtime smoke, and `git diff --check`.

Implement:

- explicit raw GSI adapter types limited to consumed fields;
- tolerant pure normalization functions;
- normalized client-state domain types;
- immutable latest-state replacement and a safe configured-client directory backed by the validated client registry;
- `GSI_FRESHNESS_MS` parsing with the approved default;
- a monotonic clock port/default adapter and deterministic test clock;
- GSI router wiring that normalizes after auth and before invoking `match`;
- removal of the old reachable raw-snapshot latest state.

Verification:

- Phase 1 specs pass;
- existing GSI auth and response contracts pass unchanged;
- malformed optional nested data cannot mutate another client's state or escape in errors/logs;
- type checking proves GSI raw types do not enter `match`.

Exit criteria:

- Authenticated ingest stores only normalized latest state.
- The normalizer is stateless and contains no match lifecycle or temporal comparison.
- M1 is `completed` and no intentional RED spec remains from Phase 1.

## Phase 3 — Match Lifecycle and Timeline RED

Status: `not-started`

Target end state: `red-expected`

Add compile-safe seams and failing specs for:

- no session before a usable match/team pair;
- first valid client creating the session and becoming source;
- same-match/same-team participation and foreign snapshot isolation;
- non-source latest updates without shared temporal updates;
- deterministic freshest snapshot selection and coverage;
- source-only rollover and complete old-session reset;
- no reset on one incomplete source snapshot;
- initial baseline, second-source-snapshot health, staleness, return baseline, and restored health;
- no gap delta and no automatic source failover;
- exact freshness boundary with an injected monotonic clock;
- current minimap selection from one freshest snapshot rather than a union.

Exit criteria:

- Specs fail only on missing lifecycle/timeline behavior.
- Phase 2 normalization and all base vertical coverage remain green.
- Compact reducers and coaching-context output are not implemented in the RED phase.

## Phase 4 — Match Lifecycle and Timeline GREEN

Status: `not-started`

Target end state: `green`

Implement:

- the single active-session state and store port;
- pure session create/participate/end/rollover decisions;
- sticky source and timeline transition reducer;
- source continuity baseline representation;
- freshness evaluation and deterministic current-group selection;
- source-only shared temporal update routing while each client may update its own local-player ring;
- current shared snapshot selection without marker union;
- safe bounded lifecycle/timeline transition logs.

Verification:

- Phase 3 specs pass;
- one to five in-memory clients remain isolated when match/team differ;
- stale source does not prevent fresh current requester context prerequisites;
- no timer/background task is required for correct query behavior;
- reset releases old match-scoped state references.

Exit criteria:

- M2 is `completed`.
- Timeline behavior is deterministic under injected time.
- No automatic failover or multi-session behavior is present.

## Phase 5 — Compact Memory and Coach Context RED

Status: `not-started`

Target end state: `red-expected`

Add compile-safe seams and failing specs for:

- baseline-safe map transitions and score changes;
- stable roster accumulation without dynamic minimap union;
- enemy visible/missing transitions, last known position, and stale-timeline unknowns;
- 90-second player sample retention by time and no fabricated partial samples;
- building baseline, damage-change storage, 6/15/30-second windows, health increase, missing keys, and post-game guards;
- canonical event fingerprints and cross-client/sliding-window deduplication;
- raw chat and malformed/unsupported event exclusion;
- `BuildCoachContextResult` failure variants;
- fresh requester, same-session teammates, deterministic coverage/shared snapshot, rosters, temporal features, and unknowns;
- role default, requester-only idempotent override, duplicate role allowance, and reset on match rollover;
- immutable and deterministically ordered public context results.

Exit criteria:

- New specs fail only for missing compact-memory/context/override behavior.
- No scoring, rendered advice, Discord, inventory milestone, or advice-memory implementation is added.

## Phase 6 — Compact Memory and Coach Context GREEN

Status: `not-started`

Target end state: `green`

Implement:

- source-driven map/enemy/building reducers and independent client-owned player reducers;
- all-client same-session normalized event deduplication;
- bounded retention/pruning and immutable temporal-feature reads;
- explicit continuity availability for healthy/stale/rebaselining states;
- context query result mapping and stable unknown codes;
- match-scoped role override command and effective-role resolution;
- composition-root construction and dependency injection for stores, policy, clock, commands, and query;
- public `match` exports required by GSI and the future Discord adapter only;
- bounded metadata logging for lifecycle and context diagnostics.

Verification:

- Phase 5 specs pass;
- repeated snapshots do not grow player/building/event state without bounds;
- the first frame and post-gap frame create no false delta event;
- non-source snapshots cannot duplicate building damage or last-seen transitions;
- raw snapshots, raw event strings, chat, secrets, identities, and positions are absent from logs;
- `match` remains independent of Express, GSI raw types, Discord, `buy`, and `lost`.

Exit criteria:

- M3 is `completed`.
- The internal context query is ready for a later Discord adapter.
- No intentional RED spec or compile-safe production stub remains.

## Phase 7 — Verification and Handoff

Status: `not-started`

Target end state: `green`

Run:

- clean npm install from the committed runtime lock file;
- type checking;
- complete Jest suite;
- ESLint;
- Prettier check;
- TypeScript ESM build;
- built-runtime smoke test;
- Docker image build;
- local Compose health and authenticated-ingest smoke test;
- `git diff --check`.

Verify:

- no focused, skipped, or intentional RED specs remain;
- existing health/GSI HTTP contracts and container startup remain unchanged;
- hot reload still observes source changes in local Compose;
- one-client and two-client sanitized fixture flows produce expected session/context state;
- foreign match/team, stale source, source return, duplicate events, partial sections, and rollover are covered;
- retention remains bounded under a long fixture sequence;
- no new HTTP route, external integration, persistence, or future feature placeholder exists;
- no raw snapshot, token, Discord identity, alias, chat, detailed inventory, or position appears in logs/errors;
- all cross-module imports use `modules/match/public.ts`;
- documentation and actual fixed defaults remain aligned.

Exit criteria:

- All repository-local checks pass.
- The running container accepts real-shaped GSI snapshots without changing the approved HTTP contract.
- Milestones M0–M4 and Phases 0–7 are marked `completed`.
- The plan status is `completed` only after all acceptance evidence is recorded.
- The implementation is ready for the next Discord action/role-button text-stub vertical.

## Acceptance Matrix

| Capability             | Required evidence                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| HTTP compatibility     | Existing authenticated/invalid `POST /gsi` status and body contracts remain unchanged               |
| Tolerant normalization | Partial or malformed optional sections do not crash ingest or fabricate facts                       |
| Raw-data boundary      | Raw GSI objects/types/chat are not retained by or exposed from `match`                              |
| Client isolation       | Each trusted client has one independent normalized latest state                                     |
| Freshness              | `5000 ms` default and exact stale boundary use injected monotonic time                              |
| Session identity       | Only fresh same-match/same-team clients participate in the active context                           |
| Source ownership       | First valid client stays source; non-source snapshots do not update shared deltas                   |
| Degraded timeline      | Stale/return transitions disable continuity claims and do not create gap deltas                     |
| Current shared view    | One freshest normalized snapshot is selected; current minimap markers are never unioned             |
| Roster memory          | Stable heroes accumulate conservatively without duplicate/copy inflation                            |
| Player history         | Samples are real-field-only, time-windowed, and pruned to 90 seconds                                |
| Building memory        | First frame baselines; only changes are stored; 6/15/30-second windows honor stale/post-game guards |
| Event memory           | Sliding-window/cross-client repeats deduplicate; chat and malformed raw payloads are absent         |
| Match reset            | Rollover clears memory, source baseline, events, and role overrides                                 |
| Role override          | Effective role is override-or-default and mutation is requester-scoped/idempotent                   |
| Context query          | Ready context or explicit unavailable result is immutable, deterministic, and factual               |
| Module boundary        | GSI imports match public API; match imports no integration or future feature module                 |
| Observability          | Logs contain bounded operational metadata and no private/raw gameplay payload                       |
| Scope                  | No Discord, engine, TTS, persistence, debug endpoint, failover, or generic shared abstraction       |

## Status Update Rule

When implementation starts or a phase completes:

1. Change plan status from `draft` to `approved` before Phase 1 starts.
2. Set the active phase to `in-progress`; at most one GREEN/verification phase is active at a time.
3. Update the phase and its milestone together when exit criteria are met.
4. Record blockers in the affected phase instead of weakening fixed decisions.
5. Resolve deferred contract decisions before writing specs that depend on them.
6. Do not mark a RED phase `completed` unless its new specs fail for the intended missing behavior and prior coverage is
   green.
7. Do not mark a GREEN phase `completed` unless its paired RED specs and regression suite pass.
8. Record actual verification commands and results in each completed GREEN phase.
9. Do not mark Phase 7 or the plan complete while an intentional RED spec, production stub, privacy leak, unbounded
   memory path, boundary violation, or scope leak remains.
