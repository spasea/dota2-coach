# Lost Recommendation Vertical Implementation Plan

## Status

- Plan status: `completed`
- Issue: not assigned
- Current implementation phase: `Phase 7 — Verification and Handoff (completed)`
- Last updated: `2026-07-22`

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
- [Completed match context vertical](./02_MATCH_CONTEXT_VERTICAL_PLAN.md)
- [Current match public API](../../apps/runtime/src/modules/match/public.ts)
- [Current normalized snapshot contract](../../apps/runtime/src/modules/match/domain/normalized-snapshot.ts)
- [Current coaching-context query](../../apps/runtime/src/modules/match/application/build-coach-context.ts)
- [Current building memory](../../apps/runtime/src/modules/match/domain/building-memory.ts)
- [Current GSI normalizer](../../apps/runtime/src/integrations/gsi/normalize-gsi-snapshot.ts)
- [Current runtime composition root](../../apps/runtime/src/bootstrap/create-runtime.ts)

## Starting Point

The completed runtime and match-context verticals already provide:

- one Node.js/TypeScript ESM runtime process and one runtime container;
- authenticated tolerant `POST /gsi` ingest with unchanged empty `200 OK` success behavior;
- one active same-match/same-team session with a sticky timeline source;
- immutable normalized latest state for one to five trusted clients;
- a factual requester-scoped `CoachContext` with effective role, fresh teammates, coverage, a freshest shared snapshot,
  stable rosters, temporal features, and explicit unknowns;
- exact local position, alive, HP/mana percent, level, and XP for every fresh connected client;
- current minimap hero observations selected from one freshest shared snapshot rather than a cross-client union;
- enemy visibility/last-seen memory with ambiguity and timeline guards;
- source-owned building HP history and active/recent/pressure windows of `6_000`, `15_000`, and `30_000` milliseconds;
- requester-owned 90-second player histories and match-scoped role overrides;
- an injected monotonic clock, deterministic specs, safe logs, and runtime composition seams;
- no raw snapshot archive, persistence, external recommendation integration, or generic scoring framework.

The current context deliberately stops at factual match state. It does not yet provide the minimum current-only
requester readiness needed by Lost: respawn/buyback details, disable status, or TP readiness. It normalizes minimap
heroes but not structure markers, so building pressure cannot yet be spatially associated with visible heroes.
`BuildingPressure` exposes damage totals but not repeated-damage evidence or last-damage age. No coarse map model,
Lost signals, action candidates, scoring, confidence policy, deterministic localized renderer, or advice memory exists.

This plan extends the existing factual boundary narrowly and adds a sibling `modules/lost` capability. It does not
replace `match`, add a second ingest path, or introduce Discord/TTS delivery.

## Fixed Decisions

### Vertical, ownership, and compatibility

1. This slice is the internal `Lost Recommendation Vertical` and implements the first deterministic requester-scoped
   “I’m lost” engine from the MVP rollout order.
2. The vertical remains inside the existing runtime modular monolith. It does not create another process, package,
   service, container, database, worker, scheduler, or external API.
3. `modules/lost` owns Lost-specific derived signals, hard gates, action candidates, weights, scores, confidence,
   guardrails, typed presentation messages, locale catalogs, deterministic rendering, and advice stability.
4. `modules/match` continues to own normalized factual game state, current client state, active-session lifecycle,
   compact temporal memory, coverage, and factual context queries. It does not acquire recommendation concepts.
5. `integrations/gsi` remains the only owner of raw GSI fields. It may map additional explicitly consumed current facts
   into the normalized `match` input but never scores or renders them.
6. `lost` imports `match` only through `modules/match/public.ts`. `match` imports neither `lost` nor any Lost policy or
   result type.
7. `lost` exposes its own `public.ts` as the only future integration surface. Deep cross-module imports remain
   forbidden.
8. Similarity with the future `buy` pipeline does not create a shared scoring-engine abstraction. A shared value may
   be extracted only after both modules exist and prove identical semantics.
9. The existing `GET /health` and `POST /gsi` routes, response bodies, error mappings, auth behavior, body limit, and
   logging boundaries remain unchanged.
10. No Lost HTTP/debug route is added. The runtime exposes an internal `recommendLostAction` use case for deterministic
    specs and the later Discord adapter.
11. Recommendation generation is synchronous, deterministic, transport-neutral, and LLM-free.

### Requester scope and connected teammates

12. Every invocation resolves one Discord user through the existing requester-scoped `BuildCoachContext` query and
    returns advice for that requester only.
13. A recommendation never assigns actions to other players. One requester cannot cause “all three players teleport”
    or another group command.
14. Fresh same-session connected teammates improve factual readiness and confidence. They remain evidence, not
    recipients and not inferred future participants.
15. A remote teammate with a ready TP is not counted as a future defender. Only a hero already near the pressured
    structure is a current positional defender.
16. Unconnected allied minimap heroes may contribute current positional evidence. Their HP, mana, TP, disable state,
    intent, and combat readiness remain unknown.
17. Coverage is evidence availability, not confidence by itself. One connected client can produce a high-confidence
    local `RESET`; five clients cannot make an enemy tower-race prediction reliable when enemy structure HP is absent.
18. Separate requesters may receive different actions because readiness, position, role, and safety differ. This slice
    does not coordinate or reserve team actions across independent requests.

### Minimum factual context extension

19. The normalized local-hero facts add only current fields required by the approved Lost behavior:
    `respawnSeconds`, buyback cost/cooldown, confirmed disable booleans, and current TP readiness.
20. TP readiness is normalized from the local client’s current `items.teleport0` facts. A missing/malformed `items`
    section is `unknown`; a valid section without `item_tpscroll` is `unavailable`; a confirmed scroll with missing or
    malformed cooldown/charge facts is `unknown`; zero cooldown with a positive charge is `ready`, otherwise it is
    `unavailable`. `item_charges` is preferred with `charges` as fallback, and conflicting values are `unknown`.
    `can_cast` is ignored and hero life/disable state is evaluated separately.
21. Broad ability readiness, complete inventory, stash/backpack semantics, item stats, and item-history milestones are
    not added for this Lost slice.
22. The normalized shared snapshot adds conservative current structure areas with canonical structure identity, team,
    kind/tier when derivable from the confirmed unit name, and one or more deterministically ordered positions.
23. Current structure positions may include both teams, but exact HP/history remains available only for local-team
    structures through the existing `buildings` provider.
24. Adapter-level canonicalization emits semantic team-relative identities without treating frame-local `oN` keys as
    stable identities. `buildingId` owns a unique health history, while `structureId` owns a spatial area. They are
    equal for ordinary structures; provider T4 top/bottom IDs remain distinct `buildingId` values and join one
    team-scoped T4 `structureId`.
25. Exact duplicate positions are deduplicated. Conflicting distinct positions discard a non-T4 structure area as
    unknown; two confirmed same-name T4 positions are the explicit exception and form one area. Missing, malformed,
    or unrecognized markers are ignored and never fail `POST /gsi`.
26. Current minimap structures and heroes come from the same single freshest shared snapshot. Markers are never unioned
    across clients.
27. Building-pressure output is extended factually with canonical `buildingId`/`structureId`, last-damage age,
    damage-event counts for the approved windows, and current/max health. It does not name an attacker or cause.
28. Simultaneous structure damage and nearby visible enemies means “visible near the damaged structure,” not
    “confirmed attacking the structure.” Attacker, damage source, attack target, and aggro remain unavailable.
29. Enemy hero names may appear as evidence and deterministic explanation text. Hero identity does not carry
    patch-dependent threat weights in this slice.
30. Enemy level, HP, mana, items, abilities, cooldowns, net worth, damage, and DPS remain unknown regardless of the
    number of same-team clients.

### Coarse map and spatial evidence

31. `lost` owns a team-oriented diagonal map-depth projection with these zones:
    `own_base`, `own_half`, `river_or_center`, `enemy_half`, `enemy_base`, and `unknown`.
32. Map-depth direction is mirrored by requester team so the same policy applies to Radiant and Dire.
33. The initial map model uses configurable scalar thresholds. It does not introduce lane polygons, jungle polygons,
    pathfinding, camp classification, route safety, elevation, fog grids, or objective geometry.
34. Structure proximity, teammate-cluster proximity, and map-depth thresholds are immutable injected policy values.
    Initial defaults are calibrated with targeted `jq` projections from the existing Turbo fixture before the RED specs
    that depend on them.
35. A team cluster requires at least two allied heroes in the configured radius. One nearby ally is proximity evidence,
    not a team cluster.
    The requester is excluded from destination-cluster membership. A compact candidate requires every member pair to
    be within the inclusive radius. Among safe candidates, selection prefers greater unique membership, then the
    presence of at least one fresh connected member as a binary tie-break, then smaller maximum pair distance, then a
    lexicographically ordered hero-name key. Additional connected members do not add selection weight, and connected
    presence never fabricates teammate intent or future participation.
36. Minimap duplicates/possible illusions never increase unique hero counts. Existing ambiguous enemy observations
    lower confidence rather than creating precise numerical claims.
37. Visible enemy count is a lower bound. Zero visible enemies is not positive proof that an area is safe.
38. No trajectory claim says where a missing enemy went. Last-known positions and ages remain historical evidence only.

### Actions and hard-gate outcomes

39. The scored action catalog is fixed to four candidates:
    `RESET`, `DEFEND`, `REGROUP`, and `FARM_SAFELY`.
40. `HOLD_AND_WAIT` is a non-scored hard-gate result for a dead requester, a paused match, or a ready factual context
    whose critical unknowns prevent every directional action from reaching medium confidence.
    `insufficient_evidence` requires a combined absence of usable direction: critical requester readiness is unknown,
    structure pressure is unavailable, no non-contradicted allied cluster exists, and isolation cannot be established.
    One unknown, low mana, partial team coverage, or one unavailable optional feature never creates this hold by itself.
41. Context-query failures such as unknown client, missing/stale requester snapshot, unavailable active match, or
    requester outside the active session return an explicit unavailable result rather than `HOLD_AND_WAIT`.
42. A non-active game state returns a state-specific unavailable result. This slice does not advise during hero
    selection, strategy time, or post-game.
43. `RESET` means restoring requester HP/mana and a safe position before a new macro action. Low HP is strong evidence;
    mana is supporting evidence rather than a universal hard threshold.
44. `DEFEND` means the requester can personally react to confirmed pressure on an own structure with acceptable
    arrival and numerical risk. The selected candidate retains the exact stable `structureId` used by scoring; the
    renderer names that same destination with familiar Dota notation such as `нижняя T2`, `верхние казармы`, or
    `трон`.
45. `REGROUP` means reducing dangerous distance to a fresh, confirmed allied cluster in a destination that is not
    already contradicted by stronger visible enemy presence. The selected candidate retains an immutable copy of the
    cluster hero names and renders `Сблизься с группой: Hero A, Hero B` without inferring a lane or route.
46. `FARM_SAFELY` means continuing resource acquisition without deep isolated exposure. It may require retreating
    toward the requester’s own half before farming.
47. `PLAY_WITH_TEAM`, `CROSS_MAP_PRESSURE`, `ESCAPE`, and objective-specific actions are not aliases or hidden
    candidates in this slice.

### Defense safety invariants

48. Fresh building damage opens a `DEFEND` candidate; it never selects `DEFEND` by itself.
49. Defense evaluation separates `StructurePressure` from `DefenseFeasibility`. Urgency cannot bypass feasibility for
    an outer structure.
50. Pressure considers structure criticality, current health percent, active/recent/repeated damage, last-damage age,
    and timeline availability.
51. Feasibility considers requester readiness, requester position/map depth, structure position, coarse arrival class,
    current allied defenders, visible enemies near the structure, and evidence uncertainty.
    `readyDefenders` is a conservative confirmed lower bound, while `uncertainSupports` is reported separately and
    never removes an outer-structure suicide blocker.
52. Arrival classes remain coarse: already near, TP technically available, slow/unavailable, or unknown. No path or
    exact travel-time promise is rendered.
53. Own-structure condition is represented by a non-temporal `StructureRisk` level: `stable`, `pressured`, or
    `critical`. It is derived from structure kind, current health percent, active/recent/repeated damage, damage-event
    counts, last-damage age, and timeline availability. It never estimates time to destruction or compares countdowns.
    `critical` means health at or below the critical threshold, repeated active damage at or above the configured
    event count, or any active damage to T3/T4/barracks/Ancient. `pressured` means health at or below the pressured
    threshold or any active/recent damage when `critical` does not apply. Otherwise it is `stable`. A stale or
    rebaselining timeline may retain health-based risk but cannot claim current-damage urgency.
54. For T1/T2, `DEFEND` is blocked when the requester would arrive isolated and the visible enemy lower bound exceeds
    the ready defenders currently near the structure including the requester after arrival.
    The requester enters that count only when alive, above the configured low-health boundary, confirmed free of the
    normalized disable flags, and either already near or technically able to teleport. Low mana does not remove the
    requester from the count.
55. For T3 and barracks, the same mismatch is a strong penalty and may block medium-confidence advice when evidence is
    insufficient.
56. Ancient pressure may bypass the outer-structure blocker as a last-stand override, but the explanation must expose
    the numerical danger rather than guarantee a successful defense.
57. Connected teammates who are remote remain absent from current defender count even when healthy and TP-ready.
58. An unconnected allied minimap hero near the structure counts only as uncertain positional support. A fresh
    connected hero near it is a ready defender only when alive, above the low-health boundary, and confirmed free of
    all normalized disable flags. Low mana does not disqualify it, and TP readiness is irrelevant because it is
    already near. A nearby connected hero with low or unknown health, unknown life/disable state, or a confirmed
    disable remains uncertain positional support. A remote hero contributes neither ready nor uncertain current
    support regardless of connection or TP readiness.
59. Stale/rebaselining building history cannot produce a current-damage claim or urgent `DEFEND`.
60. Low structure HP without fresh/relevant damage remains strategic context and does not create current urgency.
61. `DEFEND` is never rendered as “you will save the tower” or “the team can win the fight.” It describes the
    evidence-backed response and remaining risk.

### Regroup and safe-farm invariants

62. `REGROUP` requires a current allied cluster; remote TP readiness alone does not create one.
63. A cluster whose current location overlaps a stronger visible enemy cluster does not create high-confidence
    `REGROUP`.
64. A requester in `enemy_half` or `enemy_base` while isolated and with missing enemies cannot receive an unrestricted
    deep-farm recommendation.
65. `FARM_SAFELY` carries deterministic guardrails when needed:
    `avoid_solo_defense`, `do_not_farm_deep`, `retreat_on_enemy_visibility_drop`, or
    `regroup_only_with_confirmed_cluster`.
66. A visibility-drop guardrail is conditional text for the requester. It does not create a timer, background monitor,
    follow-up notification, or proactive recommendation.
67. The renderer may say “stay on the opposite side while three enemies remain visible” when positions support that
    fact. It does not say “finish the wave,” “hit the tower,” or identify a safe jungle route.

### Scoring, confidence, and explanations

68. The domain pipeline is:
    validate context → derive signals → generate candidates → apply blockers → score contributions → apply stability
    → select primary/alternative → derive confidence → render deterministic output.
69. Hard gates and blockers run before scoring. Numerical weights never make an impossible or suicidal candidate
    eligible.
70. Candidate score ranks eligible actions. Confidence describes evidence quality and robustness; they are distinct.
71. Directional recommendations expose only `high` or `medium` confidence.
72. `high` means all decision-critical facts are direct/fresh and plausible unknowns do not invert the action.
73. `medium` means relevant uncertainty remains but the action stays conservative and safe under plausible unknowns.
74. If a critical unknown can reasonably invert every directional action, the result is `HOLD_AND_WAIT` rather than a
    low-confidence command.
75. Partial team coverage lowers only the features that depend on exact teammate state. It does not automatically lower
    exact local `RESET` evidence.
76. Each non-zero contribution has only a stable reason code, factual value, and signed contribution. Localized copy is
    resolved later from a typed message key and parameters; domain candidates never store rendered explanations.
77. Blockers, unknowns, reasons, penalties, and guardrails are immutable and deterministically ordered.
78. The primary result includes at most the two strongest user-facing reasons. Full deterministic breakdown remains in
    text/result data for the future adapter.
79. An alternative is returned only when another directional candidate passes its blockers and confidence floor.
    `HOLD_AND_WAIT` has no alternative.
80. Exact decision numbers live in a validated public Lost policy document. Phase 1–2 introduces only factual-context
    thresholds; scoring, confidence, and stability numbers are added before the first runtime recommendation consumer
    exists. Russian wording is mapped from stable reason/action codes in `lost` and is not embedded in the numeric
    policy. The application presentation layer maps those codes to typed message keys; locale catalogs own wording.

### Configuration and GitOps boundary

81. Lost policy is a tracked, non-secret, versioned YAML document loaded once during startup through required process
    setting `LOST_POLICY_PATH`. The short application locale is selected independently through required
    `COACH_LOCALE`; the only supported value in this slice is `ru`.
82. Local development tracks `ops/dev/config/runtime/lost-policy.yaml`. Production may mount the equivalent public
    document from the separate GitOps repository.
83. The application repository does not add Kubernetes, Kustomize, KSOPS, SOPS, Argo CD, or production manifests.
84. YAML parsing and strict semantic validation are separate. During Phase 1–2, invalid syntax, schema version,
    non-finite values, negative radii, non-positive or inverted map-depth dimensions, invalid structure-risk
    percentages, or an invalid repeated-damage count fail startup before port binding through the established
    configuration-error path.
    Missing or unsupported `COACH_LOCALE` and missing `LOST_POLICY_PATH` are `process/validation`; no locale fallback
    is applied. File-read, YAML, and semantic failures are respectively
    `lost_policy/source`, `lost_policy/syntax`, and `lost_policy/validation`.
    Phase 3–4 extends it with readiness-signal thresholds; Phase 5–6 extends it atomically with the
    scoring/confidence/stability fields.
85. The parsed `LostPolicy` is deeply immutable. Hot reload and in-match policy changes are excluded.
86. Policy contains only decision numbers and fixed enum mappings. Phase 1–2 owns map-depth,
    proximity/cluster, and non-temporal structure-risk thresholds. Phase 3–4 adds the readiness thresholds consumed
    by Lost signals. Phase 5–6 extends the same pre-release `schema_version: 1` with pressure/feasibility weights,
    action bases, confidence floors, and stability values; no temporary neutral weights or unused scoring keys are
    committed earlier.
87. The initial advice hysteresis window is `30_000` milliseconds and is added to the policy in Phase 5–6.

### Advice stability and observability

88. Lost advice memory is in-memory, requester-scoped, and bounded to one latest entry per trusted client.
89. Advice memory stores only client ID, match/team identity, selected action, score, a stable Lost context key, and
    monotonic creation time. It does not retain `CoachContext`, raw snapshots, positions, rendered text, Discord ID, or
    alias. `HOLD_AND_WAIT` replaces the previous entry with score `0`, so a pre-hold directional action cannot regain
    a stale hysteresis bonus after death or pause.
90. An entry from another match/team is ignored and replaced on the next recommendation. The store does not require a
    callback from `match` during rollover.
91. Within `30_000` milliseconds, the previous eligible action receives only a small stability contribution when its
    stable context key remains compatible.
92. Death, pause, a newly feasible critical defense, a newly unsafe defense, readiness collapse, or a material
    visibility/safety change bypasses hysteresis.
93. Hysteresis never suppresses a response. Click debounce, duplicate interaction handling, and delivery cooldowns
    belong to the future Discord adapter.
94. Tests inject monotonic time and never sleep.
95. Safe decision logs may include request correlation supplied by a future adapter, client ID, match ID, action,
    confidence, coverage, score, stable reason/unknown codes, and a stable `holdReason`. Unavailable context is not a
    decision and emits no decision metadata.
96. Logs must not include Discord user ID, alias, raw snapshots, raw event payloads, positions, inventories, auth
    tokens, full rendered advice, or chat.

## Deferred Decisions

The following decisions are intentionally not guessed in this slice:

1. Discord SDK, button interaction, acknowledgement/defer, requester-facing error mapping, debounce, and text delivery.
2. TTS provider, voice channel lifecycle, audio queue, deadlines, watchdogs, and speech error handling.
3. Team-scoped recommendations, coordinated assignments, commitment tracking, or “all three players teleport.”
4. Proactive monitoring, delayed reevaluation, automatic visibility alerts, or a ten-second objective countdown.
5. Enemy structure HP, real attack target, real structure DPS, attacker identity, glyph, backdoor, armor, and
   deterministic tower-race simulation.
6. Hero-specific threat weights, patch catalog, matchup rules, enemy level/items/cooldowns, or combat-power models.
7. Full requester/allied ability semantics, complete Lost inventory semantics, item/ability effect data, and combat
   readiness simulation.
8. Lane-wave state, “finish the wave,” creep association, lane polygons, jungle camps, route selection, and exact
   pathfinding.
9. `CROSS_MAP_PRESSURE`, `PLAY_WITH_TEAM`, `ESCAPE`, split-push, smoke, Roshan, ward, and objective-planner actions.
10. Exact normalized event types contributing to Lost scoring; the first slice does not score objective/combat events.
11. Buy recommendations, item catalog, inventory milestones, recipe graph, and shared scoring value extraction.
12. Automatic timeline-source failover, multiple concurrent matches, persistence, restart recovery, analytics
    database, or raw snapshot archive.
13. Public HTTP/frontend/debug APIs, Python/LLM integration, and post-match export.
14. Lost policy hot reload, remote configuration, experiment assignment, or production GitOps repository layout.
15. Automatic feedback learning, ML ranking, win-probability estimation, and personalization beyond effective role.

Deferred decisions must be resolved before the phase that consumes them. They must not be represented by placeholder
folders, fake facts, generic abstractions, or accidental defaults.

## Scope Exclusions

- Changes to existing health/GSI HTTP contracts, auth, body limits, or error mappings
- Discord, TTS, voice, frontend, or public Lost endpoints
- Advice to more than one requester per invocation
- Team action coordination or inferred remote teammate intent
- Enemy tower HP/DPS/countdown or guaranteed own-tower survival time
- Hero-specific enemy threat scoring or external patch/game-data catalog
- Full ability/item normalization and combat simulation
- Lane/wave/jungle/ward/courier/Roshan planners and pathfinding
- Proactive timers, schedulers, delayed follow-ups, or background recommendation loops
- Event-driven Lost scoring in the first slice
- Persistent advice history, database, raw snapshot archive, or post-match recovery
- Automatic source failover or multi-session operation
- LLM-generated reasoning or text
- Kubernetes/GitOps production resources in this repository
- Generic `shared`, `common`, `services`, `utils`, `recommendations`, or scoring-engine buckets

## Target Vertical

```text
authenticated POST /gsi
        │
        ▼
integrations/gsi
  tolerant factual normalization
  + requester status/TP facts
  + current structure markers
        │
        ▼
modules/match
  latest state + compact memory
  + factual CoachContext extensions
        │
Discord user id ───────────────┐
                               ▼
                    modules/lost application
                      recommendLostAction
                               │
                               ▼
                      derive factual signals
                               │
                               ▼
                     hard gates and blockers
                               │
                               ▼
                       score four actions
                               │
                               ▼
                    confidence + hysteresis
                               │
                               ▼
                deterministic Russian result
                               │
                               ▼
           internal Runtime API for future Discord
```

The vertical is complete when one requester can obtain a deterministic Lost recommendation from one to five fresh
same-team clients; suicidal outer-structure defense is blocked by factual feasibility; exact teammate state raises
only relevant confidence; stale/ambiguous data degrades honestly; advice remains stable without hiding urgent changes;
and no transport, voice, objective simulator, or generic scoring framework enters the slice.

## Architectural Boundaries

### GSI normalization boundary

The existing adapter remains stateless and best-effort. It may:

- map confirmed local respawn, buyback, disable, and TP-slot facts;
- map confirmed minimap tower/rax/Ancient markers into canonical current structure observations;
- discard malformed or unsupported current values;
- preserve explicit unknown/unavailable states;
- return immutable deterministically ordered normalized collections.

It must not:

- determine requester map depth, isolation, cluster membership, pressure urgency, or defense feasibility;
- correlate nearby enemies as confirmed attackers;
- estimate DPS, tower destruction time, or combat outcome;
- score candidates, apply hysteresis, or render advice;
- archive raw item/minimap sections;
- import `lost` internals.

### Match factual boundary

`match` owns and exposes only facts:

- extended current requester/teammate hero and TP facts;
- current structure observations from the selected shared snapshot;
- extended repeated/last-age building-pressure evidence;
- existing timeline availability, enemy memory, teammates, coverage, role, and unknowns.

`match` does not expose a precomputed `DefenseFeasibility`, Lost map zone, action, score, confidence, guardrail, or
rendered string. Those meanings belong to `lost`.

### Lost application boundary

`recommendLostAction`:

- resolves the factual context through injected `BuildCoachContext`;
- maps context-unavailable statuses without throwing expected failures;
- obtains monotonic time and prior requester advice;
- invokes pure signal/candidate/scoring/rendering domain functions;
- writes one bounded advice-memory entry only for a completed recommendation;
- emits safe decision metadata through an injected callback;
- returns a discriminated immutable result.

It does not read environment variables, YAML, files, Express requests, Discord SDK objects, or global state.

### Lost domain boundary

Pure Lost domain functions own:

- team-oriented map-depth projection;
- spatial distance/proximity and team-cluster derivation;
- requester readiness;
- structure pressure and non-temporal `StructureRisk`;
- defense feasibility and numerical mismatch blockers;
- isolation and visibility risk;
- candidate generation and deterministic tie-breaking;
- score contributions and confidence classification;
- hysteresis compatibility and stability contribution;
- reason/unknown/guardrail selection.

Functions receive immutable context projections, policy, previous advice, and explicit monotonic time. They do not call
stores, clocks, loggers, config loaders, or integrations.

### Lost policy boundary

The YAML adapter under `modules/lost/infrastructure` parses and validates one public document into the domain-owned
`LostPolicy`. Bootstrap loads and validates the source before server binding. Until the first Lost policy consumer is
implemented, the parsed result is intentionally not retained or exposed through `Runtime`; later phases inject it at
the composition root. Infrastructure knows YAML/Zod mechanics but does not invent fallback weights or coaching rules.

### Advice-memory infrastructure

The in-memory adapter implements a narrow Lost-owned port. It may use a `Map` keyed by stable `clientId` and return
owned immutable values. It cannot store full context or hide match invalidation/hysteresis rules inside generic
`save` behavior.

### Presentation, translation, and renderer boundary

The application presentation builder receives selected candidate facts, confidence, unknowns, and guardrails and
maps stable domain codes to typed `{ key, params }` messages. The infrastructure locale catalog maps those messages
to copy; the renderer only composes translated voice/text output. None of these steps recomputes scores, accesses raw
context, invents game facts, or uses an LLM.

Only the selected primary action and its voice lead render a concrete destination in this slice. Alternative copy
remains generic. DEFEND target selection happens once inside scoring, so rendered structure copy cannot diverge from
the structure that produced the score. REGROUP uses the already selected cluster and never exposes its coordinates.

`LostTranslationKey` is a closed TypeScript union derived from the parameter map. Every catalog must satisfy the full
mapped type, so a new reason/action/guardrail cannot silently omit its translation. Catalogs are TypeScript modules,
not YAML and not policy data. Russian count-sensitive messages use native `Intl.PluralRules('ru')`; no i18n package is
introduced for the single-locale MVP. Adding a locale later means adding its short key, exhaustive catalog, and
factory registration. Runtime wiring chooses the translator from `RuntimeSettings.coachLocale` in Phase 6.

### Time boundary

Monotonic milliseconds own advice age, hysteresis, building-window ages, and fixture-controlled evaluation. Game time
may appear as a factual reason but never orders requests. Tests use fake clocks and do not use real waits.

### Public module APIs

- `modules/match/public.ts` exports only the additional factual types needed by GSI and Lost.
- `modules/lost/public.ts` initially exports the policy contract/parser required by bootstrap and is extended in
  Phase 6 with `createRecommendLostAction` plus its command/result types.
- Future Discord imports `lost/public.ts` and does not call Lost internals or reconstruct scoring itself.
- `lost` never re-exports raw GSI, store internals, YAML document types, or mutable domain collections.

## Contract Baseline

Exact TypeScript names may improve during implementation, but the semantic boundaries remain equivalent to the
following.

### Factual match additions

```ts
type TeleportReadiness =
  | Readonly<{ status: "ready" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "unknown" }>;

type NormalizedHeroStatus = Readonly<{
  stunned: boolean | null;
  silenced: boolean | null;
  hexed: boolean | null;
  muted: boolean | null;
  disarmed: boolean | null;
}>;

type NormalizedStructureObservation = Readonly<{
  structureId: string;
  team: Team;
  kind: "tower" | "barracks" | "ancient";
  tier: 1 | 2 | 3 | 4 | null;
  positions: readonly Position[];
}>;

type NormalizedBuildingObservation = Readonly<{
  buildingId: string;
  structureId: string;
  team: Team;
  health: number | null;
  maxHealth: number | null;
}>;
```

The exact disable vocabulary is limited to raw fields confirmed by targeted fixture inspection. Unsupported semantics
are not added merely to make the shape appear complete.

```ts
type BuildingPressure = Readonly<{
  buildingId: string;
  structureId: string;
  currentHealth: number;
  maxHealth: number;
  activeDamage: number;
  activeDamageEvents: number;
  recentDamage: number;
  recentDamageEvents: number;
  pressureDamage: number;
  lastDamageAgeMs: number | null;
}>;
```

### Lost structure-risk signal

```ts
type StructureRiskLevel = "stable" | "pressured" | "critical";

type StructureRisk = Readonly<{
  buildingId: string;
  level: StructureRiskLevel;
}>;
```

`StructureRisk` belongs to `lost`, not `match`. It classifies current evidence without producing time-to-loss,
survival, or arrival-time estimates.

### Lost action and result

```ts
type LostAction = "RESET" | "DEFEND" | "REGROUP" | "FARM_SAFELY";
type LostOutcomeAction = LostAction | "HOLD_AND_WAIT";
type LostConfidence = "high" | "medium";

type LostGuardrail =
  | "avoid_solo_defense"
  | "do_not_farm_deep"
  | "retreat_on_enemy_visibility_drop"
  | "regroup_only_with_confirmed_cluster";

type LostUnknown =
  | MatchContextUnknown
  | "requester_readiness_unknown"
  | "teleport_readiness_unknown"
  | "structure_position_unknown"
  | "defender_readiness_partial"
  | "enemy_count_is_lower_bound"
  | "safe_destination_unknown";

type LostReasonCode =
  | "requester_low_health"
  | "requester_low_mana"
  | "requester_disabled"
  | "active_structure_damage"
  | "recent_structure_damage"
  | "repeated_structure_damage"
  | "critical_structure"
  | "requester_already_near_structure"
  | "requester_can_teleport"
  | "requester_would_arrive_outnumbered"
  | "allied_defenders_already_present"
  | "requester_deep_and_isolated"
  | "enemies_missing"
  | "enemies_visible_elsewhere"
  | "confirmed_allied_cluster"
  | "partial_evidence";

type LostScoreTerm = Readonly<{
  code: LostReasonCode;
  value: number | string | boolean;
  contribution: number;
}>;

type ScoredLostCandidate = Readonly<{
  action: LostAction;
  score: number;
  reasons: readonly LostScoreTerm[];
  penalties: readonly LostScoreTerm[];
  blockers: readonly string[];
  unknowns: readonly LostUnknown[];
  guardrails: readonly LostGuardrail[];
}>;

type LostRecommendation = Readonly<{
  action: LostOutcomeAction;
  primary: ScoredLostCandidate | null;
  alternative: ScoredLostCandidate | null;
  confidence: LostConfidence;
  coverage: number;
  voiceText: string;
  textTitle: string;
  textBody: string;
  unknowns: readonly LostUnknown[];
  guardrails: readonly LostGuardrail[];
}>;
```

`HOLD_AND_WAIT` has `primary: null` and `alternative: null` because it is a hard-gate outcome, not a scored candidate.

Domain values stop at `LostScoreTerm`. The application layer represents user-facing semantics as a
discriminated `LostMessage` union keyed by short values such as `lost.action.reset` and
`lost.reason.requester_would_arrive_outnumbered`, with typed parameters such as `enemyCount`. Application specs assert
keys, parameters, ordering, and composition; they do not assert exact Russian sentences. Infrastructure specs verify
catalog completeness through TypeScript and exercise non-empty output and Russian plural categories without pinning
whole phrases.

### Application result

```ts
type RecommendLostActionCommand = Readonly<{
  discordUserId: string;
}>;

type LostUnavailableReason = ContextUnavailableStatus | "game_not_in_progress";

type RecommendLostActionResult =
  | Readonly<{ status: "recommended"; recommendation: LostRecommendation }>
  | Readonly<{ status: "unavailable"; reason: LostUnavailableReason }>;
```

The future Discord adapter may add request correlation and transport acknowledgement around this command. It must not
change its decision semantics.

### Advice memory

```ts
type LostAdviceMemory = Readonly<{
  clientId: string;
  matchId: string;
  team: Team;
  action: LostOutcomeAction;
  score: number;
  contextKey: string;
  createdAt: number;
}>;
```

The context key is generated from stable normalized Lost signals. It is not a serialization or hash of raw
`CoachContext` and contains no private values.

## Decision Pipeline

```text
BuildCoachContextResult
  ├─ unavailable                         → unavailable result
  └─ ready
      ├─ game not in progress            → unavailable result
      ├─ paused                          → HOLD_AND_WAIT
      ├─ requester dead                  → HOLD_AND_WAIT
      └─ active and alive
          │
          ├─ derive RequesterReadiness
          ├─ derive StructurePressure
          ├─ derive DefenseFeasibility
          ├─ derive IsolationRisk
          └─ derive TeamCluster
                   │
                   ▼
          generate four candidates
                   │
                   ▼
          apply hard blockers
                   │
                   ▼
          score eligible candidates
                   │
                   ▼
          apply bounded hysteresis
                   │
                   ▼
          confidence floor met?
             ├─ no  → HOLD_AND_WAIT
             └─ yes → primary + optional alternative
                         │
                         ▼
          typed presentation + locale rendering
```

Candidate tie-breaking is fixed and documented rather than relying on sort stability. The exact precedence is resolved
in Phase 5 before RED specs and must prefer the safer action when scores are equal.

## Confidence and Coverage Baseline

Confidence is evaluated per recommendation, not by a direct `N/5` lookup:

| Evidence area            | One requester can prove                   | Connected teammates add                              |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------- |
| Local `RESET`            | Exact requester HP/mana/status            | Usually no additional confidence                     |
| Solo-defense danger      | Enemy cluster + no current defenders      | Exact readiness for connected defenders already near |
| `DEFEND` feasibility     | Requester readiness/TP + own pressure     | Better current-defender readiness                    |
| `REGROUP` destination    | Current allied minimap cluster            | Exact readiness for connected cluster members        |
| `FARM_SAFELY` guardrails | Requester depth + visible/missing enemies | Better allied-cluster alternatives                   |
| Enemy objective race     | Not provable                              | Still not provable                                   |

High confidence does not promise a successful fight or saved structure. It means the selected macro action is robust
against the remaining known uncertainty.

## Approved Scenario Baseline

The teammate count below excludes the requester.

| Fresh teammates | Factual situation                                                                  | Expected result                            | Confidence |
| --------------: | ---------------------------------------------------------------------------------- | ------------------------------------------ | ---------- |
|               0 | Requester has 18% HP and is away from base                                         | `RESET`                                    | high       |
|               0 | Three enemies are visible near damaged own T2; requester would arrive alone        | `FARM_SAFELY` + `avoid_solo_defense`       | medium     |
|               0 | Requester is deep/isolated and three enemies are missing                           | `FARM_SAFELY` + retreat/depth guardrails   | medium     |
|               1 | Requester and one ready teammate are already near own T2 against one visible enemy | `DEFEND`                                   | medium     |
|               2 | Requester is isolated; two ready teammates form a safe current cluster             | `REGROUP`                                  | high       |
|               2 | Ready requester and teammates are remote while three enemies pressure own T2       | `FARM_SAFELY` + `avoid_solo_defense`       | medium     |
|             3–4 | Ready allies are already defending own T3 and requester can arrive                 | `DEFEND`                                   | high       |
|             any | Requester is dead                                                                  | `HOLD_AND_WAIT` with respawn/buyback facts | high       |
|             any | Requester snapshot is stale                                                        | unavailable; no directional advice         | —          |

For the approved Lich cross-map scenario, the engine may render:

> Не телепортируйся защищать T2 один: рядом видны три противника. Оставайся на противоположной стороне карты, но не
> углубляйся после исчезновения врагов.

It must not render:

> Добейте вражескую T2 за десять секунд, затем телепортируйтесь втроём.

The second statement requires unavailable enemy structure HP/DPS plus team-scoped orchestration and is outside this
vertical.

## Lost Policy Baseline

Phase 1–2 introduces only the policy needed to normalize and derive factual Lost context. The YAML field names may
improve while Phase 1 is active, but the committed context document remains semantically equivalent to:

```yaml
schema_version: 1

map_depth:
  center_half_width: 1200
  base_boundary: 7700

proximity:
  structure_radius: 1600
  team_cluster_radius: 1200
  minimum_cluster_size: 2

structure_risk:
  critical_health_percent: 25
  pressured_health_percent: 60
  repeated_active_damage_events: 2
```

These are the first implementation defaults resolved from the Phase 1 evidence below. Phase 2 commits the equivalent
valid local context YAML document. Production code never accepts placeholder or missing values.

Phase 3 fixes the readiness extension consumed for the first time in Phase 4:

```yaml
readiness:
  low_health_percent: 25
  low_mana_percent: 20
```

Both thresholds are finite and strictly inside `0..100`; equality is classified as low. Low health is strong reset
evidence. Low mana is supporting evidence only and cannot independently force `RESET`, block another action, or create
`HOLD_AND_WAIT`.

Phase 3 resolves readiness thresholds and Phase 4 adds them when the first Lost signals consume them. Phase 5 then
resolves action bases, fixed reason-code weights, confidence floors, and stability values from approved scenarios.
Phase 6 extends the parser and tracked YAML atomically with those sections, including
`stability.hysteresis_ms: 30000`, before wiring `recommendLostAction`. These are deliberate completions of the same
pre-release `schema_version: 1`, not compatibility-bearing schema migrations. Phase 1–2 must not invent placeholder
readiness or scoring sections merely to anticipate those extensions.

Phase 5 fixes the following decision-policy extension. Zero bases are deliberate: only `FARM_SAFELY` has a
conservative fallback prior, while every other action requires positive factual evidence.

```yaml
scoring:
  action_bases:
    RESET: 0
    DEFEND: 0
    REGROUP: 0
    FARM_SAFELY: 20
  contributions:
    RESET:
      requester_low_health: 70
      requester_low_mana: 15
      requester_disabled: 45
    DEFEND:
      active_structure_damage: 40
      recent_structure_damage: 20
      repeated_structure_damage: 15
      critical_structure: 25
      requester_already_near_structure: 15
      requester_can_teleport: 10
      allied_defenders_already_present: 15
      requester_would_arrive_outnumbered: -55
      partial_evidence: -10
    REGROUP:
      requester_deep_and_isolated: 35
      enemies_missing: 15
      confirmed_allied_cluster: 30
      partial_evidence: -10
    FARM_SAFELY:
      requester_would_arrive_outnumbered: 35
      requester_deep_and_isolated: 25
      enemies_missing: 20
      enemies_visible_elsewhere: 25

confidence:
  medium_score_floor: 20
  high_score_floor: 65
  alternative_score_gap: 15

stability:
  hysteresis_ms: 30000
  previous_action_bonus: 5
```

The decision-policy document is strict and owns exactly the listed action/reason keys. Bases and floors are finite
non-negative integers; contribution weights are finite non-zero integers with the signs shown above. The high floor
is strictly greater than the medium floor, the alternative gap is non-negative, hysteresis is a positive integer,
and the previous-action bonus is positive and strictly smaller than the alternative gap. Phase 6 adds these sections
atomically to the canonical parser and tracked YAML; Phase 5 only fixes their contract and RED coverage.

Score ranks already eligible candidates and does not determine evidence quality by itself. `medium` requires the
action-specific evidence predicate and `score >= 20`; `high` additionally requires `score >= 65` and direct,
non-contradicted decision-critical facts. Exact local low-health `RESET` may be high under partial team coverage.
`DEFEND` may be high only with current active pressure, reachable arrival, acceptable numerical risk, no uncertain
support, and unambiguous enemy observation. `REGROUP` may be high only for a deep/isolated requester with a confirmed
cluster containing a fresh connected member and a non-unknown destination. `FARM_SAFELY` is capped at medium in this
slice. Low mana alone cannot make `RESET` reach the medium floor, while the deliberate `FARM_SAFELY` base prevents it
from creating `HOLD_AND_WAIT`.

Exact score ties use `FARM_SAFELY`, `RESET`, `REGROUP`, `DEFEND` precedence. An alternative must be eligible, reach
medium confidence, and have an inclusive score gap of at most `15` from the primary. Voice output contains at most
two strongest reasons; detailed text retains the full deterministic breakdown.

Hysteresis applies only for `0 <= age < 30_000` milliseconds, adds `5` to the still-eligible previous action, and is
ignored at the exact upper boundary or for a negative age. Its stable context key contains categorical readiness,
map-depth/isolation, missing-enemy count, relevant structure risk/activity, arrival/numerical/defense response,
selected-cluster identity/risk, and decision-critical unknowns. It excludes exact HP, coordinates, damage age, raw
context, and rendered text. Match/team mismatch, a changed categorical key, a hard hold, newly feasible critical
defense, newly unsafe defense, readiness collapse, or material visibility/safety change bypasses the bonus.

The initial `ru` copy is deterministic, short, informal second-person text. `recent_structure_damage` is distinct
from `active_structure_damage`; the presentation mapping never upgrades recent evidence into a current-damage claim.
Voice reasons, text reasons, penalties, unknowns, and guardrails are mapped from stable codes rather than numeric
policy values or embedded domain strings.

### Phase 1 Fixture Evidence and First Defaults

The calibration source is the `2_125`-snapshot `tmp/gsi_valid_turbo_match.json` capture. Every result below came from
a bounded `jq` projection; the capture was not line-read, copied, or committed. These values are conservative first
defaults from one Turbo match, not statistical claims about every patch or match. Recalibration may change policy
values later without changing the domain model.

#### Confirmed factual adapter fields

- The local `hero` object exposes `respawn_seconds`, `buyback_cost`, `buyback_cooldown`, `alive`, `stunned`,
  `silenced`, `hexed`, `muted`, and `disarmed`. The five explicit disable booleans cross the adapter; aggregate
  `has_debuff` and unsupported effect semantics do not.
- `items.teleport0` contained `item_tpscroll` in `2_062` observations. `cooldown` ranged from `0` to `59`, and
  `item_charges`/`charges` both ranged from `1` to `6` with zero mismatches in the capture.
- Technical TP readiness therefore requires the confirmed scroll name, zero cooldown, and a positive charge. Hero
  life/disable state is evaluated separately. `can_cast` is not readiness evidence: it was `true` in `1_778`
  observations, including `453` dead and `9` stunned observations.
- Provider building IDs and minimap unit names join directly for T1–T3 and Ancient by adding the `npc_` prefix.
  Barracks join by mapping `good_rax_<type>_<lane>` to
  `npc_dota_goodguys_<type>_rax_<lane>`; the equivalent Dire names are covered by mirrored synthetic specs.
- The minimap exposes two same-name T4 markers per team while the provider exposes top/bottom T4 IDs. Both markers
  form one spatial defense area; the adapter must not fabricate a top/bottom identity from their order.
- The capture has local building health only for Radiant, while minimap structure positions exist for both teams.
  Provider/minimap joins are fixture-backed for Radiant and team symmetry is verified synthetically for Dire.

#### Team-oriented map depth

For position `(x, y)`, raw diagonal depth is `x + y`. Team-oriented depth is `x + y` for Radiant and `-(x + y)`
for Dire, so negative always points toward the requester's own base and
`radiantDepth(x, y) == direDepth(-x, -y)`. Two positive policy values make asymmetric configuration impossible.
Boundary equality is assigned explicitly so opposite positions always map to opposite zones:

```text
depth < -7700           → own_base
-7700 <= depth < -1200  → own_half
-1200 <= depth <= 1200  → river_or_center
1200 < depth <= 7700    → enemy_half
depth > 7700            → enemy_base
```

Static structure anchors from both teams use the same owner-relative direction after that projection, while retaining
the map's real geometric asymmetry:

| Owner-relative structure | Observed depth range |
| ------------------------ | -------------------: |
| Ancient                  |   `-11_272..-10_528` |
| Barracks                 |    `-10_640..-8_519` |
| T4                       |    `-10_584..-9_712` |
| T3                       |    `-10_064..-8_031` |
| T2                       |     `-7_373..-4_608` |
| T1                       |       `-4_480..-762` |

`7_700` is the rounded midpoint between the closest-to-center T3 anchor (`-8_031`) and the deepest T2 anchor
(`-7_373`), leaving roughly equal calibration margin on both sides. The symmetric `±1_200` center band sits at the
river-facing edge of the observed T1 anchors. The map itself is not an exact central mirror: Radiant T1 depths are
`-4_480..-1_520`, while Dire T1 depths are `-4_029..-762`; therefore two physical Dire T1 positions fall in
`river_or_center`. This is intentional physical-depth behavior and does not reclassify zones by tower tier.

As a sanity check, `9_240` unambiguous allied primary-marker observations distribute as `19.88% own_base`,
`45.49% own_half`, `16.39% river_or_center`, `12.71% enemy_half`, and `5.54% enemy_base`; no zone is rendered
unreachable by the defaults.

#### Spatial radii

Allied calibration uses only team-2 hero markers with `minimap_herocircle` or `minimap_herocircle_self`. Frames with
a duplicate marker for the same hero are excluded. Enemy/structure calibration uses consecutive building-health
decreases and only unambiguous `minimap_enemyicon` hero identities; a nearby enemy remains correlation, never a
confirmed attacker.

| Projection                                                                  | Evidence                                               |                  Default |
| --------------------------------------------------------------------------- | ------------------------------------------------------ | -----------------------: |
| Nearest allied pair in `2_061` eligible frames                              | median `657`; p75 `1_342`                              |   `1_200` cluster radius |
| Frames containing at least one allied pair within `1_200`                   | `71.76%`; `20.89%` of all pair observations            |                          |
| Nearest visible unambiguous enemy during `262` structure-damage transitions | median `839`; p75 `1_584`                              | `1_600` structure radius |
| Damage transitions with such an enemy within `1_600`                        | `193/262` overall; `193/257` when an enemy was visible |                          |

The radii are intentionally separate: `1_200` asks for a compact current allied group, while `1_600` conservatively
captures the local danger area around a damaged structure. Neither radius is converted into travel time or TTI.

#### Non-temporal StructureRisk thresholds

The capture contains `262` health-decrease observations affecting all `18` local structures. Grouping consecutive
decreases for the same structure with the existing `6_000 ms` active-window gap yields `53` damage episodes.

| Evidence                                      | Observed value                                       | Default consequence                                  |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Post-damage health percent                    | p25 `24.52%`; median `55%`                           | critical at `<= 25%`, pressured boundary at `<= 60%` |
| Events at or below the selected health bounds | `66/262` at `25%`; `139/262` at `60%`                | both boundaries exercise real fixture states         |
| Damage events per active episode              | p25 `3`; median `4`; p75 `7`; p90 `9`                | repeated from `2` events                             |
| Episodes meeting repetition                   | `45/53` with at least `2`; `41/53` with at least `3` | two is the earliest non-single-hit evidence          |

Health thresholds do not independently claim urgency or time to loss. Phase 3 combines them with structure kind,
timeline availability, active/recent damage, event counts, and last-damage age to derive `stable`, `pressured`, or
`critical`.

The Phase 1–2 validation contract is now fixed:

- `schema_version` must be exactly `1`, the document must be an object, and unknown keys are rejected;
- all numeric values must be finite;
- `0 < center_half_width < base_boundary`;
- both radii must be positive and `minimum_cluster_size` must be an integer of at least `2`;
- health percentages must be within `0..100`, with
  `critical_health_percent < pressured_health_percent`;
- `repeated_active_damage_events` must be a positive integer.

## Proposed File Layout

Exact filenames may change when implementation reveals a clearer local name, but ownership and dependency direction
must remain stable.

```text
apps/runtime/src/
├── bootstrap/
│   ├── create-runtime.spec.ts
│   └── create-runtime.ts
├── integrations/
│   └── gsi/
│       ├── normalize-gsi-snapshot.fixtures.ts
│       ├── normalize-gsi-snapshot.spec.ts
│       ├── normalize-gsi-snapshot.ts
│       └── raw-gsi.types.ts
├── modules/
│   ├── match/
│   │   ├── public.ts
│   │   ├── application/
│   │   │   ├── build-coach-context.spec.ts
│   │   │   └── build-coach-context.ts
│   │   └── domain/
│   │       ├── building-memory.spec.ts
│   │       ├── building-memory.ts
│   │       └── normalized-snapshot.ts
│   └── lost/
│       ├── public.ts
│       ├── application/
│       │   ├── build-lost-presentation.spec.ts
│       │   ├── build-lost-presentation.ts
│       │   ├── lost-advice-store.ts
│       │   ├── lost-translator.ts
│       │   ├── recommend-lost-action.spec.ts
│       │   ├── recommend-lost-action.ts
│       │   ├── render-lost-recommendation.spec.ts
│       │   └── render-lost-recommendation.ts
│       ├── domain/
│       │   ├── candidate.ts
│       │   ├── confidence.ts
│       │   ├── derive-lost-signals.spec.ts
│       │   ├── derive-lost-signals.ts
│       │   ├── lost-policy.ts
│       │   ├── map-depth.spec.ts
│       │   ├── map-depth.ts
│       │   ├── recommendation.ts
│       │   ├── scoring.spec.ts
│       │   ├── scoring.ts
│       │   ├── select-recommendation.spec.ts
│       │   ├── select-recommendation.ts
│       │   ├── stability.spec.ts
│       │   └── stability.ts
│       └── infrastructure/
│           ├── create-lost-translator.ts
│           ├── in-memory-lost-advice-store.spec.ts
│           ├── in-memory-lost-advice-store.ts
│           ├── parse-lost-policy.spec.ts
│           ├── parse-lost-policy.ts
│           ├── russian-lost-translator.spec.ts
│           └── russian-lost-translator.ts
└── platform/
    ├── config/
    │   ├── parse-runtime-settings.spec.ts
    │   └── parse-runtime-settings.ts
    └── i18n/
        └── locale.ts

ops/dev/config/runtime/
└── lost-policy.yaml
```

Files may be split when one pure decision has an independent invariant set. Do not collapse signals, scoring, storage,
rendering, and orchestration into a generic engine/manager, and do not create empty future integration directories.

## Milestone Status

| Milestone                                    | RED phase | GREEN phase | Status      |
| -------------------------------------------- | --------- | ----------- | ----------- |
| M0. Contract baseline                        | —         | Phase 0     | `completed` |
| M1. Lost factual context enablement          | Phase 1   | Phase 2     | `completed` |
| M2. Lost signals and candidate safety        | Phase 3   | Phase 4     | `completed` |
| M3. Scoring, rendering, and advice stability | Phase 5   | Phase 6     | `completed` |
| M4. Verification and handoff                 | —         | Phase 7     | `completed` |

## Phase 0 — Contract Baseline

Status: `completed`

Target end state: `green`

Confirm and record:

- requester-scoped advice with connected teammates as evidence only;
- four scored actions and non-scored `HOLD_AND_WAIT`;
- explicit unavailable result versus hold behavior;
- exact match/lost ownership and one-way public API dependencies;
- minimum match factual extensions for disable/respawn/buyback/TP and structure positions;
- current minimap selection without cross-client union;
- team-oriented diagonal map depth and no polygon/pathfinding model;
- pressure versus defense-feasibility separation;
- outer-structure suicide blockers and Ancient last-stand exception;
- connected readiness versus inferred intent distinction;
- confidence semantics and no low-confidence directional action;
- deterministic Russian output, guardrails, and optional alternative;
- public startup-loaded Lost YAML policy and `30_000 ms` hysteresis;
- no Discord, TTS, team coordination, objective race, event scoring, or external catalog.

Confirm the sanitized fixture/scenario baseline:

- targeted requester status, TP slot, and structure-marker projections from `tmp/gsi_valid_turbo_match.json`;
- low-resource local `RESET`;
- dead and paused `HOLD_AND_WAIT`;
- fresh versus stale/rebaselining building pressure;
- repeated outer-tower damage with one requester against several visible enemies;
- feasible defense with allies already at the structure;
- remote connected teammates who must not be counted as defenders;
- deep isolated requester with visible versus missing enemies;
- safe and unsafe team clusters;
- one through five connected-client coverage;
- equal-score deterministic ordering and hysteresis override.

Completed:

- Approved requester-scoped advice with connected teammates as evidence only.
- Approved four scored actions, non-scored `HOLD_AND_WAIT`, and explicit unavailable results.
- Confirmed the one-way `lost` → `match/public.ts` dependency and transport-neutral internal runtime API.
- Approved the minimum factual Match extensions for requester readiness, TP, structure positions, and repeated
  building-pressure evidence.
- Approved mirrored coarse map depth, factual spatial association, and no marker union, polygons, or pathfinding.
- Approved pressure/feasibility separation, outer-structure suicide blockers, and the Ancient last-stand exception.
- Confirmed that remote connected teammates improve evidence but never become inferred defenders or advice recipients.
- Approved high/medium confidence semantics, no low-confidence directional action, deterministic localized rendering,
  guardrails, and an optional eligible alternative.
- Approved the public startup-loaded Lost YAML policy and `30_000 ms` requester-scoped hysteresis.
- Confirmed the fixture/scenario baseline and exclusions for Discord, TTS, team coordination, objective races, event
  scoring, hero-specific threat data, and external catalogs.

Exit criteria:

- The plan changes from `draft` to `approved` before Phase 1 implementation starts.
- Fixture requirements prohibit tokens, Discord identities, aliases, player names, chat, raw snapshots, and unrelated
  inventory details.
- No unresolved decision blocks policy calibration or context-enablement RED specs.

## Phase 1 — Lost Context Enablement RED

Status: `red-expected`

Target end state: `red-expected`

Resolve before writing RED specs:

- exact raw current fields used for respawn, buyback, confirmed disables, and TP readiness;
- exact confirmed minimap unit-name families for tower, barracks, and Ancient markers;
- canonical structure-ID normalization between provider and minimap names;
- evidence-calibrated map-depth, structure-proximity, and cluster-radius defaults;
- evidence-calibrated non-temporal `StructureRisk` thresholds;
- complete Phase 1–2 context-policy keys and validation relationships;
- exact factual `StructureRisk` inputs without time-to-loss or arrival-time estimates.

Evidence discipline:

- inspect `tmp/gsi_valid_turbo_match.json` only with targeted `jq` projections;
- do not stream, copy, commit, or line-read the multi-million-line capture;
- add only small sanitized fixture fragments containing consumed fields;
- derive factual adapter shapes from the capture and use synthetic domain scenarios only for business combinations not
  present in one recorded match.

Add compile-safe seams and failing specs for:

- normalized respawn/buyback/disable fields with null-safe tolerant handling;
- TP ready/unavailable/unknown mapping from the current local TP slot;
- conservative current structure-marker normalization and deterministic ordering;
- duplicate/malformed/unrecognized marker handling;
- stable canonical join between own `buildings` facts and matching minimap structure identity;
- no use of frame-local `oN` as identity;
- no enemy structure HP fabrication;
- repeated-damage counts and last-damage age in `BuildingPressure`;
- stale/rebaselining suppression of current-pressure facts;
- structurally stable immutable `CoachContext` with the additional facts;
- unchanged GSI `200` response for partial/malformed optional fields;
- `LOST_POLICY_PATH` process validation;
- YAML syntax/schema/semantic failures and deeply immutable parsed policy;
- a public context-policy schema that rejects secret/unknown fields; the tracked local YAML is added in Phase 2.

Keep production wiring compile-safe and preserve all existing behavior. Context RED specs may use unwired seams, but no
Lost candidate, score, renderer, advice store, or runtime recommendation use case is implemented in this phase.

Completed:

- Added compile-safe Match/GSI contracts for requester readiness, semantic building/spatial identities, current
  structure areas, and extended building-pressure evidence.
- Added sanitized intent-driven RED specs for TP mapping, requester status, Radiant/Dire semantic identities, T4 area
  handling, duplicate/conflicting markers, repeated damage evidence, and freshest-snapshot context selection.
- Added the context-only `LostPolicy` domain contract, minimal `modules/lost/public.ts`, an unwired parser seam, and
  strict RED specs for syntax, schema, semantics, immutability, and secret/unknown key rejection.
- Added RED startup/process specs for required `LOST_POLICY_PATH` and safe `lost_policy` source/syntax/validation
  failures before server binding.
- Preserved empty `200 OK` ingest for malformed optional hero/item/structure facts and did not add Lost scoring,
  candidates, rendering, storage, recommendation wiring, or a route.

Verification evidence (`2026-07-21`):

- `npm run typecheck` — passed;
- `npm run lint` — passed;
- `npm run format:check` — passed;
- `npm test -- --runInBand` — intentional RED: `5` suites / `23` assertions fail only at the approved missing Phase 2
  behavior; `16` suites / `116` tests pass.

Exit criteria:

- New specs fail only for the intentionally missing factual normalization/context/policy behavior.
- Existing runtime and Match Context suites remain green.
- No raw GSI types cross into `match` or `lost`.
- No recommendation behavior is implemented prematurely.

## Phase 2 — Lost Context Enablement GREEN

Status: `completed`

Target end state: `green`

Implement:

- targeted raw GSI adapter fields and tolerant current-fact normalization;
- immutable requester status, respawn/buyback, and TP-readiness facts;
- current structure-marker normalization and canonical identity;
- factual repeated/last-age building-pressure extension;
- coaching-context projection of the new current facts;
- strict versioned Lost context-policy parser and immutable domain policy;
- required `LOST_POLICY_PATH` setting, startup source loading, and local Compose value;
- complete tracked `ops/dev/config/runtime/lost-policy.yaml` with calibrated context defaults and no unused scoring
  sections.

Verification:

- Phase 1 specs pass;
- existing auth, response, lifecycle, memory, and context contracts pass unchanged;
- current minimap remains one freshest snapshot rather than a union;
- first/stale/returning source frames do not fabricate repeated damage;
- malformed optional fields are discarded without state corruption;
- public Lost policy contains no credentials or private identity data;
- configuration failure occurs before server binding and does not expose file content.

Completed:

- Implemented tolerant requester respawn, buyback, confirmed-disable, and current TP-scroll normalization without
  expanding into full inventory semantics or using `can_cast`.
- Implemented Radiant/Dire semantic building and structure identities, exact marker deduplication, conflicting non-T4
  suppression, and the approved two-position T4 area.
- Implemented repeated active/recent damage-event counts and last-damage age while preserving baseline, stale, and
  rebaselining behavior.
- Confirmed the existing `BuildCoachContext` projection already exposes the new requester facts and one freshest
  shared minimap snapshot without acquiring Lost meanings.
- Implemented the strict versioned YAML/Zod Lost context-policy adapter, semantic validation, safe error mapping, and
  deeply immutable domain result.
- Added required `LOST_POLICY_PATH` process validation and validation-only startup loading before server creation. The
  parsed policy is intentionally not retained or exposed until a later phase introduces its first consumer.
- Added the tracked non-secret local policy, read-only Compose mount, and smoke-runtime fixture without adding
  production manifests or secret data.
- Kept Lost candidates, signals, scoring, rendering, advice memory, recommendation wiring, and transport routes out of
  scope.

Verification evidence (`2026-07-21`):

- `npm run check` — passed, including typecheck, ESLint, Prettier, `21` Jest suites / `140` tests, ESM build, and the
  built-runtime smoke test;
- the tracked local Lost policy parses through the built production adapter;
- the local Compose document parses as valid YAML;
- `git diff --check` — passed.

Exit criteria:

- M1 is `completed`.
- `BuildCoachContext` exposes all approved facts and no Lost meanings.
- No intentional RED spec remains from Phase 1.
- No candidate/scoring implementation exists yet.

## Phase 3 — Lost Signals and Candidate Safety RED

Status: `red-expected`

Target end state: `red-expected`

Resolve before writing those specs:

- exact policy-backed low-health and supporting low-mana readiness thresholds;
- validation boundaries for the readiness-policy section added in Phase 4.

Add compile-safe pure seams and failing specs for:

- Radiant/Dire mirrored diagonal map depth and exact threshold boundaries;
- unknown position handling;
- unique hero proximity to a structure;
- team cluster minimum size/radius and deterministic cluster selection;
- connected exact readiness versus unconnected positional-only evidence;
- requester readiness with strong HP, supporting mana, disables, TP, respawn, and buyback context;
- active/recent/repeated structure pressure and structure criticality;
- non-temporal `StructureRisk` levels and exact threshold boundaries;
- defense arrival classes;
- current defenders already near a structure;
- visible enemy lower-bound counts and ambiguity penalties;
- T1/T2 isolated-outnumbered `DEFEND` blockers;
- T3/barracks strong penalties and Ancient last-stand override;
- deep/isolated/missing-enemy risk;
- unsafe regroup destination rejection;
- four fixed candidate keys and no hidden fifth scored action;
- dead/paused/insufficient-evidence `HOLD_AND_WAIT`;
- explicit unavailable context/game-state mapping.

Use scenario-first specs for:

- solo Lich cross-map against three visible enemies at own T2;
- Lich plus two remote fresh teammates near enemy T2;
- two allies already at own T2 before requester arrival;
- requester low HP regardless of partial coverage;
- requester deep with three missing enemies;
- requester far from a safe ready allied cluster;
- stale timeline with current visibility but no current-damage claim.

Completed:

- Fixed policy-backed inclusive readiness defaults at `25%` HP and `20%` mana; low mana remains supporting evidence
  and cannot independently force `RESET`, `HOLD_AND_WAIT`, or block another action.
- Added compile-safe, pure Lost seams for mirrored map-depth projection, requester/structure/cluster/defense/isolation
  signals, hard outcomes, and exactly four ordered directional candidates.
- Added RED specs for Radiant/Dire boundary symmetry, unknown positions, immutable outputs, readiness thresholds,
  non-temporal `StructureRisk`, and stale/rebaselining damage semantics.
- Added deterministic cluster specs covering unique membership, inclusive pairwise radius, requester exclusion, larger
  cluster precedence, binary connected-presence tie-breaking, compactness, and unsafe destination rejection.
- Added defense-feasibility and safety specs for the approved Lich scenarios, current versus remote defenders,
  unconnected positional support, visible-enemy lower bounds, outer-tower blockers, high-ground penalties, Ancient
  last stand, deep isolation, and missing enemies.
- Added hard-gate and candidate specs for unavailable context, inactive game, dead/paused hold behavior, insufficient
  evidence, local low-HP reset, supporting low mana, stale pressure, regroup safety, and conservative farm guardrails.
- Extended the parser contract specs with the required readiness section and strict `0 < threshold < 100` validation;
  the parser and tracked YAML remain intentionally unchanged until Phase 4 GREEN.
- Kept scoring, confidence, Russian rendering, advice persistence, recommendation orchestration, public runtime wiring,
  and transport integration out of scope.

Verification evidence (`2026-07-21`):

- `npm run typecheck` — passed;
- `npm run lint` — passed;
- `npm run format:check` — passed;
- `npm run build` — passed;
- `npm run test:smoke` — passed against the built runtime;
- `npm test -- --runInBand` — intentional RED: `4` suites / `69` assertions fail only at the approved missing Phase 4
  behavior; `20` suites / `144` tests pass;
- `git diff --check` — passed.

Exit criteria:

- New specs fail only for missing Lost signal/gate/candidate behavior.
- Phase 2 factual context and all previous suites remain green.
- No numeric scoring, Russian rendering, advice persistence, or runtime use-case wiring is implemented.

## Phase 4 — Lost Signals and Candidate Safety GREEN

Status: `completed`

Target end state: `green`

Implement pure domain behavior for:

- the strict readiness-policy extension in the same pre-release `schema_version: 1` and its tracked YAML source;
- map-depth and distance projections;
- current structure/enemy/ally association without attacker claims;
- requester readiness;
- pressure severity and non-temporal `StructureRisk`;
- defense feasibility;
- isolation and team clusters;
- directional candidate generation;
- hard gates, candidate blockers, unknown propagation, and guardrail selection.

Implementation sequence:

1. Complete the canonical policy contract:
   - add `readiness` directly to `LostPolicy` and remove the temporary signal-only distinction;
   - extend the strict parser with finite `0 < threshold < 100` validation;
   - add the approved `25%` HP and `20%` mana defaults to the tracked YAML without changing `schema_version: 1`;
   - keep startup behavior validation-only and do not wire recommendation generation into runtime.
2. Implement spatial primitives:
   - use `x + y` for Radiant depth and `-(x + y)` for Dire with the documented inclusive boundaries;
   - preserve unknown positions;
   - add only Euclidean distance, nearest-structure-position, and maximum pair-distance helpers required by Lost;
   - treat any confirmed position of a multi-position T4 area as the same defense destination.
3. Build deterministic current observations:
   - exclude the requester from destination clusters;
   - deduplicate heroes by identity;
   - prefer a fresh connected local position over the shared minimap marker for the same hero, falling back to the
     current shared marker only when the local position is unavailable;
   - keep connected readiness separate from unconnected positional evidence.
4. Derive immutable signals:
   - requester readiness and mirrored map depth;
   - health-based `StructureRisk` from current own-building facts even when temporal pressure is unavailable;
   - active/recent/repeated urgency only from healthy available building-pressure evidence;
   - compact team-cluster candidates using inclusive pairwise radius and the approved deterministic ranking;
   - isolation from requester depth and nearby allied positional evidence, plus unique visible/missing enemy counts;
   - defense arrival, confirmed `readyDefenders`, separate `uncertainSupports`, numerical risk, and the approved
     outer/high-ground/Ancient response.
5. Apply candidate safety without scoring:
   - map context failures and inactive game state to explicit unavailability;
   - apply dead, paused, and the narrow combined `insufficient_evidence` holds before candidate generation;
   - return exactly `RESET`, `DEFEND`, `REGROUP`, and `FARM_SAFELY` in stable order;
   - apply blockers before future scoring and propagate risks, unknowns, and guardrails without selecting a winner.
6. Close the GREEN phase:
   - make every Phase 3 RED assertion pass without weakening its scenarios;
   - run typecheck, lint, format, the full Jest suite, ESM build, built-runtime smoke, and `git diff --check`;
   - mark Phase 4 and M2 completed only after no intentional Phase 3 RED remains.

Verification:

- Phase 3 specs pass;
- remote TP-ready teammates never become current defenders;
- unconnected allies never acquire fabricated readiness;
- ambiguous/duplicate enemy markers never inflate precise enemy counts;
- zero visible enemies never becomes proof of safety;
- fresh damage opens but does not force `DEFEND`;
- outer-structure suicidal defense is blocked before scoring;
- every signal function is deterministic, immutable, clock-free, and transport-free.

Completed:

- Extended the canonical deeply immutable `LostPolicy`, strict parser, tracked local YAML, runtime composition
  fixture, and built-runtime smoke fixture with the approved inclusive `25%` HP and `20%` mana thresholds without a
  schema-version change or recommendation wiring.
- Implemented immutable Radiant/Dire diagonal map-depth projection with exact boundary ownership, unknown-position
  preservation, and normalized zero symmetry.
- Implemented deterministic current ally/enemy observations with unique hero identities, requester exclusion, fresh
  connected-position precedence, minimap fallback, and visible-enemy lower-bound semantics.
- Implemented requester readiness, health-preserving stale `StructureRisk`, healthy-timeline damage activity,
  high-ground criticality, compact team-cluster enumeration/ranking, isolation, and missing-enemy signals.
- Implemented coarse defense arrival and the confirmed-only defender model: ready requester after arrival, ready
  connected allies already near, separate uncertain positional support, no remote teammate commitment, conservative
  numerical comparison, outer blockers, high-ground penalties, and Ancient last stand.
- Implemented explicit unavailable and hold outcomes plus exactly four immutable ordered safety candidates with
  pre-score blockers, risks, unknown propagation, and deterministic guardrails.
- Added intent coverage for low/unknown connected readiness, confirmed disables, low mana, low-health requester
  arrival, remote allies, ambiguous/duplicate enemies, stale pressure, unsafe regroup, and deep isolated farming.
- Kept numeric scoring, confidence, recommendation selection, Russian rendering, advice memory, application
  orchestration, runtime exposure, and transport integration out of scope.

Verification evidence (`2026-07-21`):

- `npm run check` — passed, including typecheck, ESLint, Prettier, `24` Jest suites / `219` tests, ESM build, and the
  built-runtime smoke test;
- refreshed code graph confirms Lost remains an internal domain/infrastructure boundary with no new service or
  transport layer;
- `git diff --check` — passed.

Exit criteria:

- M2 is `completed`.
- All four candidates and `HOLD_AND_WAIT` have distinct approved semantics.
- No intentional RED spec remains from Phase 3.
- No scoring or renderer behavior is implemented prematurely.

## Phase 5 — Scoring, Rendering, and Stability RED

Status: `red-expected`

Target end state: `red-expected`

Completed:

- Fixed the exact action bases, action-scoped signed reason weights, medium/high score floors, inclusive alternative
  gap, safer-action tie precedence, `30_000 ms` half-open hysteresis window, and `5`-point compatible-action bonus.
- Added `recent_structure_damage` as a distinct stable reason code so recent evidence is never rendered or scored as
  active damage.
- Fixed action-specific confidence predicates: local exact low-health `RESET` remains high under partial coverage;
  exact feasible `DEFEND` and connected safe-cluster `REGROUP` may reach high; `FARM_SAFELY` is capped at medium; no
  directional candidate below the medium floor is emitted.
- Fixed categorical context-key compatibility, exact score-tie and alternative selection semantics, deterministic
  short informal initial `ru` copy, the two-reason voice limit, detailed text breakdowns, and prohibited future-state
  or attacker semantics.
- Added required strict `COACH_LOCALE` process configuration with short keys, only `ru` in the initial registry, and
  no implicit fallback. Local Compose and built-runtime smoke configuration use `ru` explicitly.
- Split domain scoring terms from localized copy. The application presentation seam now produces typed
  `{ key, params }` messages, the exhaustive TypeScript catalog owns Russian wording and pluralization, and the
  renderer receives an injected translator.
- Replaced exact Russian sentence assertions in application specs with stable key/parameter/composition assertions;
  catalog specs cover non-empty translations and Russian plural categories without pinning whole phrases.
- Added final reusable decision-policy subtypes without making them premature required fields of canonical
  `LostPolicy`; the parser and tracked YAML remain intentionally unchanged until Phase 6.
- Added compile-safe seams for scoring, confidence, selection, categorical keys, stability, presentation building,
  localized rendering,
  requester-scoped advice storage, and the application recommendation use case. Each seam fails explicitly with a
  bounded `not implemented` error rather than returning fabricated neutral behavior.
- Added RED intent specs covering exact policy parsing/validation, all approved scoring and confidence cases,
  blocker-first filtering, immutable deterministic breakdowns, safer tie precedence, inclusive alternatives,
  categorical compatibility, hysteresis boundaries/bypass, bounded immutable storage, typed presentation mapping,
  localized output, requester-scoped orchestration, unavailable/hold mapping, and safe decision metadata.

Verification evidence (`2026-07-21`):

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test:smoke` — passed;
- locale parsing and Russian catalog infrastructure pass separately: `2` suites / `21` tests;
- all original parser-contract assertions pass separately: `15` passed;
- full Jest run is intentional RED: `10` suites / `50` assertions fail only on the explicit Phase 6 seams or the
  absent decision-policy parser extension; `24` suites / `237` tests pass;
- no runtime wiring, public Lost API, Discord, HTTP route, TTS, timer, or proactive delivery was added.

Resolve before writing RED specs:

- exact action bases, reason-code weights, confidence floors, and stability values that extend the same pre-release
  `schema_version: 1`;
- strict validation relationships for the new scoring/confidence/stability sections;
- safer-action deterministic precedence for exact score ties;
- exact policy reason-code keys and contribution signs;
- confidence calculation and exact medium/high boundaries;
- compatible versus materially changed Lost context-key fields;
- maximum voice reasons and deterministic alternative eligibility;
- initial `ru` copy for actions, approved reason codes, guardrails, hold cases, and unknowns;
- typed message-key/parameter mapping and strict runtime locale selection.

Add compile-safe seams and failing specs for:

- policy-driven base scores and signed contributions;
- blocker-first candidate filtering;
- deterministic candidate/reason/penalty/unknown ordering;
- score/confidence separation;
- high confidence with exact local facts under partial coverage;
- medium confidence for conservative cross-map safe-farm advice;
- no low-confidence directional output;
- primary and optional eligible alternative;
- deterministic typed presentation plus localized voice and detailed text output;
- conditional guardrail rendering without future-state claims;
- prohibited wording around attacker, enemy tower HP/DPS, guaranteed defense, and teammate intent;
- one bounded advice entry per client;
- same-match `30_000 ms` hysteresis and exact boundary;
- urgent/material-change bypass;
- match/team mismatch invalidation and bounded overwrite;
- immutable store-owned advice values;
- application-level mapping from `BuildCoachContextResult` to `RecommendLostActionResult`;
- safe decision metadata and absence of private/raw fields.

Exit criteria:

- New specs fail only for missing scoring/rendering/stability/use-case behavior.
- Phase 4 signals and all earlier suites remain green.
- No Discord, HTTP route, TTS, timer, or proactive delivery is added.

## Phase 6 — Scoring, Rendering, and Stability GREEN

Status: `completed`

Target end state: `green`

Completed:

- Atomically extended the canonical `LostPolicy`, strict parser, and tracked local YAML with the approved scoring,
  confidence, and stability sections. Numeric signs and integer constraints, ordered confidence floors, positive
  hysteresis, and `previousActionBonus < alternativeScoreGap` are validated before server binding.
- Replaced the split signal/decision dependency with one canonical policy while retaining narrow `LostSignalPolicy`
  and decision-section inputs at pure domain boundaries.
- Implemented blocker-first policy-driven scoring with four local action-specific scorers, typed
  `reason code → factual value` terms, signed reason/penalty breakdowns, deterministic ordering, and deep immutable
  outputs.
- Implemented action-specific confidence, safer exact-tie precedence, inclusive alternative selection, and
  `HOLD_AND_WAIT` when no directional candidate reaches medium confidence.
- Implemented versioned categorical context keys without exact HP, coordinates, or damage age, plus immutable
  match/team/context-aware hysteresis over the half-open `0 <= age < 30_000` window and urgent critical-defense
  bypass.
- Implemented the bounded in-memory requester advice store with one owned immutable latest entry per client.
- Implemented exhaustive typed presentation mapping, strongest-two voice reasons, complete text breakdowns, injected
  locale translation, and renderer composition without domain rescoring or embedded application copy.
- Added typed immutable action destinations to scored candidates: DEFEND carries the exact selected `structureId`,
  while REGROUP carries the already selected cluster hero names. Primary voice/text renders the approved Russian
  Dota shorthand and hero list; alternatives remain generic and no lane/route inference was added.
- Implemented requester-scoped orchestration from `BuildCoachContext` through signals, safety, scoring, stability,
  confidence, selection, presentation, rendering, memory, and bounded decision metadata.
- `HOLD_AND_WAIT` now replaces prior advice memory with `score: 0` and is logged with stable `holdReason` and empty
  `reasonCodes`; unavailable context creates neither memory nor decision metadata.
- Added the public Lost capability facade and internal `Runtime.recommendLostAction`; bootstrap retains the parsed
  policy, selects the translator through `COACH_LOCALE`, and emits safe structured decision logs.
- Kept the existing health/GSI routes and transport behavior unchanged; no Lost HTTP route, Discord adapter, TTS,
  timer, worker, or proactive delivery was introduced.

Verification evidence (`2026-07-22`):

- `npm run check` — passed, including typecheck, ESLint, Prettier, all `35` Jest suites / `312` tests, ESM build, and
  built-runtime smoke;
- all former Phase 5 RED seams are GREEN; no `not implemented` production stub remains in the Lost vertical;
- policy/parser, scoring, confidence, selection, context-key, hysteresis, store, presentation, locale, renderer,
  orchestration, HOLD memory/logging, and runtime facade intent cases pass;
- refreshed code graph reports no Lost domain import into application/infrastructure and no deep Lost import into the
  Match module;
- runtime startup retains strict Lost policy and locale validation and exposes no new route.

Exit criteria:

- M3 is `completed`.
- Internal runtime callers can request a complete deterministic recommendation.
- No intentional RED spec or compile-safe production stub remains.
- Existing GSI/health behavior and module boundaries remain unchanged.

## Phase 7 — Verification and Handoff

Status: `completed`

Target end state: `green`

Completed:

- Verified type checking, ESLint, Prettier, the complete Jest suite, TypeScript ESM build, built-runtime smoke, and
  `git diff --check`. The final repository-local check is green with 35 suites and 312 tests.
- Verified the Docker image and local Compose runtime, including health, authenticated ingest, unchanged HTTP
  contracts, source hot reload, and startup validation of the tracked Lost policy.
- Verified approved requester scenarios, stale and foreign context handling, defense safety, bounded advice memory,
  logging privacy, module boundaries, and the absence of new routes or external integrations.
- Completed the implementation handoff. The Lost Recommendation Vertical has no intentional RED specs or production
  stubs and is ready for a later Discord text/voice integration.

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
- existing `GET /health` and `POST /gsi` contracts remain unchanged;
- hot reload still observes runtime source changes in local Compose;
- startup succeeds with the tracked local Lost policy and fails safely for invalid policy;
- one through five fresh same-team clients produce the approved deterministic scenario results;
- foreign match/team and stale requester return explicit unavailable results;
- stale/rebaselining timeline never produces current-damage urgency;
- solo outer-tower defense against a stronger visible cluster is blocked;
- allies already at the structure may make defense feasible;
- remote ready teammates never count as committed defenders;
- high local `RESET` confidence does not require full team coverage;
- no enemy building HP, DPS, attacker, target, route, or teammate-intent claim appears;
- advice storage remains bounded across repeated requests and match rollover;
- no new route, production external integration, persistence, timer, generic scoring abstraction, or future placeholder
  exists;
- no raw snapshot, token, Discord ID, alias, chat, detailed inventory, or position appears in logs; the explicit
  local-only rendered console output is documented below;
- cross-module imports use `match/public.ts` and `lost/public.ts` only;
- docs, YAML defaults, parser rules, and implementation remain aligned.

Exit criteria:

- All repository-local and container checks pass.
- Approved requester scenarios are covered by deterministic fixtures/specs.
- Milestones M0–M4 and Phases 0–7 are marked `completed`.
- Plan status becomes `completed` only after verification evidence is recorded.
- The internal Lost API is ready for a later Discord text/voice integration without decision duplication.

## Post-completion Local Console Harness

Status: `completed`

An opt-in local debug adapter was added after the vertical handoff to exercise the existing multi-client Match → Lost
path before Discord integration:

- `LOST_CONSOLE_DEBUG_ENABLED=false` remains the safe default;
- when enabled, each requester receives its own 30-second warm-up and output throttle;
- a successfully recorded GSI snapshot drives the adapter, so no background timer or scheduler was added;
- match rollover starts a fresh warm-up window for that requester;
- output contains the configured `client_id`, recommendation text, and safe status metadata, but no token, Discord ID,
  alias, or raw snapshot;
- adapter failures are contained and cannot change the authenticated empty `200 OK` GSI contract;
- console observations call the existing requester-scoped `RecommendLostAction` use case and therefore intentionally
  participate in its advice-memory hysteresis while the debug mode is enabled;
- the adapter imports Lost only through `lost/public.ts` and does not change Match or Lost domain/application rules.

## Acceptance Matrix

| Capability            | Required evidence                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| HTTP compatibility    | Existing health/GSI status, body, auth, and error contracts remain unchanged                     |
| Factual normalization | Only approved status/TP/structure facts cross from GSI; malformed values remain absent           |
| Structure identity    | Provider and minimap IDs join canonically without using `oN` as identity                         |
| Enemy-data honesty    | No enemy HP/level/items/cooldowns/DPS or exact attacker/target is fabricated                     |
| Shared current view   | Current heroes/structures come from one freshest shared snapshot, never a client union           |
| Building pressure     | Active/recent/repeated facts honor 6/15/30-second windows and stale/rebaseline guards            |
| Structure risk        | Stable/pressured/critical classification is non-temporal and never estimates time to loss        |
| Map depth             | Radiant/Dire mirroring and exact configured boundaries are deterministic                         |
| Team cluster          | At least two nearby allies are required; unsafe/unknown destinations degrade honestly            |
| Connected readiness   | Exact teammate state improves relevant evidence without implying future action                   |
| Requester scope       | One invocation returns advice for one requester and never assigns teammate actions               |
| Action catalog        | Four scored actions only; `HOLD_AND_WAIT` is a hard-gate result                                  |
| Defense safety        | Fresh damage opens `DEFEND`; isolated outnumbered outer defense is blocked before scoring        |
| Critical defense      | T3/barracks penalties and Ancient override expose danger without guaranteeing success            |
| Safe farming          | Deep isolated/missing-enemy contexts add retreat/depth guardrails                                |
| Regroup safety        | `REGROUP` requires a current non-contradicted allied cluster                                     |
| Scoring               | Policy-driven contributions are deterministic, explained, and unable to bypass blockers          |
| Confidence            | High/medium reflect evidence robustness; no low-confidence directional command is returned       |
| Rendering             | Russian voice/text output uses stable codes and contains no unsupported future-state claims      |
| Stability             | 30-second requester/match hysteresis prevents oscillation but urgent changes bypass it           |
| Advice retention      | One immutable latest entry per trusted client; no full context/raw/private values are retained   |
| Configuration         | Versioned public YAML is startup-validated, immutable, non-secret, and locally tracked           |
| Module boundary       | Lost imports Match public API; Match imports no Lost; future integrations use Lost public API    |
| Observability         | Logs contain bounded decision metadata and no raw/private gameplay payload                       |
| Scope                 | No Discord/TTS, team coordinator, objective simulator, event planner, persistence, timer, or LLM |

## Status Update Rule

When implementation starts or a phase completes:

1. Change plan status from `draft` to `approved` before Phase 1 starts.
2. Mark Phase 0 and M0 `completed` only after the fixed contract is explicitly accepted.
3. Set the active implementation phase to `in-progress`; at most one GREEN/verification phase is active at a time.
4. Update the phase and its milestone together when exit criteria are met.
5. Record blockers in the affected phase instead of weakening defense-safety, factual-honesty, or requester-scope
   decisions.
6. Resolve deferred contract decisions before writing specs that depend on them.
7. Do not mark a RED phase `completed` unless its new specs fail only for the intended missing behavior and prior
   coverage is green.
8. Do not mark a GREEN phase `completed` unless its paired RED specs and regression suite pass.
9. Record actual verification commands and results in each completed GREEN phase.
10. Do not mark Phase 7 or the plan complete while an intentional RED spec, production stub, unsafe defense path,
    unsupported factual claim, privacy leak, unbounded memory path, boundary violation, or scope leak remains.
