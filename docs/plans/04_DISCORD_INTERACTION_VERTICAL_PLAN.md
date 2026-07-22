# Discord Interaction Vertical Implementation Plan

## Status

- Plan status: `in-progress`
- Issue: not assigned
- Current implementation phase: `Phase 3 — Interaction Routing and Delivery RED (not-started)`
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
- [Completed runtime base vertical](./01_RUNTIME_BASE_VERTICAL_PLAN.md)
- [Completed match-context vertical](./02_MATCH_CONTEXT_VERTICAL_PLAN.md)
- [Completed Lost recommendation vertical](./03_LOST_RECOMMENDATION_VERTICAL_PLAN.md)
- [Current runtime composition root](../../apps/runtime/src/bootstrap/create-runtime.ts)
- [Current runtime entrypoint](../../apps/runtime/src/main.ts)
- [Current process settings parser](../../apps/runtime/src/platform/config/parse-runtime-settings.ts)
- [Current trusted-client configuration](../../apps/runtime/src/platform/config/config.types.ts)
- [Current Match public API](../../apps/runtime/src/modules/match/public.ts)
- [Current Lost public API](../../apps/runtime/src/modules/lost/public.ts)
- [Discord interaction contract](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Discord component reference](https://docs.discord.com/developers/components/reference)
- [Discord Gateway and intents](https://docs.discord.com/developers/events/gateway)
- [Discord message and pin API](https://docs.discord.com/developers/resources/message)
- [Discord bot registration quick start](https://docs.discord.com/developers/quick-start/getting-started)
- [Discord OAuth2 scopes and bot permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions)
- [Discord ID lookup instructions](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID)
- [discord.js Client API](https://discord.js.org/docs/packages/discord.js/main/Client%3Aclass)

## Starting Point

The completed runtime, Match, and Lost verticals already provide:

- one Node.js/TypeScript ESM runtime process and one development container;
- strict process, public YAML, and private YAML configuration loaded before HTTP binding;
- one-to-five trusted clients with unique Discord user mappings and configured `coachAlias` values;
- authenticated tolerant `POST /gsi`, immutable same-match state, requester lookup, and match-scoped role overrides;
- synchronous requester-scoped `recommendLostAction({ discordUserId })` through `lost/public.ts`;
- deterministic localized Lost output with primary action, score, confidence, coverage, reasons, penalties, alternative,
  unknowns, guardrails, and individual voice audience composition;
- bounded Lost advice hysteresis and privacy-safe decision logs;
- an opt-in local Lost console harness for pre-Discord live validation;
- an async runtime `start`/`stop` lifecycle and signal-driven shutdown.

The runtime does not yet contain a Discord dependency, Gateway client, Discord configuration documents, control-panel
provisioner, component router, action debounce, interaction acknowledgement, public text delivery, or Discord lifecycle
composition. The existing Lost and role-override use cases are internal runtime capabilities only.

This slice adds the first Discord text interaction adapter around those capabilities. It does not change GSI ingest or
Lost scoring and does not introduce TTS, voice, Buy scoring, a second service, or a second container.

## Fixed Decisions

### Vertical, ownership, and compatibility

1. This slice is the `Discord Interaction Vertical`: one configured guild, one configured guild text channel, one
   explicitly provisioned pinned control message, requester-scoped Lost requests, and match-scoped role buttons.
2. Discord runs in the existing runtime process in normal serving mode. No bot microservice, worker, queue, database,
   webhook receiver, interactions HTTP endpoint, slash command, or second container is added.
3. The implementation uses the current stable compatible `discord.js` package and commits the resolved version in the
   existing runtime lock file. No thin custom Discord REST/Gateway client is written.
4. Interactions arrive through one persistent Gateway `interactionCreate` handler. Message collectors are not used
   because the panel is long-lived across process restarts.
5. The client requests only the non-privileged `Guilds` intent. `MessageContent`, `GuildMembers`, `GuildPresences`, and
   other privileged intents are not enabled.
6. Discord SDK objects and SDK-specific errors remain inside `integrations/discord`. `modules/match` and
   `modules/lost` never import `discord.js`.
7. Discord consumes Match and Lost only through their public module APIs. It never reads GSI payloads, stores, Match
   internals, Lost scoring internals, or rendered console output.
8. Existing `GET /health`, `POST /gsi`, authentication, empty `200 OK` ingest response, body limit, normalization,
   scoring, hysteresis, and console-debug behavior remain unchanged.
9. Discord text delivery is on-demand only. No timer, proactive coaching, automatic recommendation, or unsolicited
   channel output is added.

### Configuration and GitOps boundary

10. Discord uses a separate versioned public YAML document and, when enabled, a separate private YAML document. It is
    not embedded into the client registry or Lost policy.
11. The public document owns `enabled`, and its enabled variant owns `guild_id`, `text_channel_id`,
    `control_message_id`, and `action_debounce_ms`. The private document owns only `bot_token`.
12. The application repository tracks the public local-development document and a credentials example. Real local
    credentials remain in an ignored file. Production values and age-encrypted secrets remain owned by the separate
    GitOps repository and its existing Argo CD/SOPS/Kustomize flow.
13. Process environment owns only file locations and startup mode:
    `DISCORD_CONFIG_PATH`, `DISCORD_CREDENTIALS_PATH`, and `DISCORD_CREATE_PANEL`. The public path is required;
    credentials path/file/token are required only when Discord is enabled, including provisioning mode.
14. `DISCORD_CREATE_PANEL` is a strict `true|false` boolean with safe default `false`. It is never read inside the
    Discord SDK adapter or domain modules; bootstrap resolves it into one explicit process mode.
15. Discord snowflakes remain strings from parsing through SDK calls. They are never converted to JavaScript numbers.
16. Configuration is strict and fail-fast. Unknown YAML fields, duplicate YAML keys, malformed snowflakes, blank
    required tokens, unsupported schema versions, and invalid debounce values fail before any network lifecycle starts.
17. `enabled: false` is a minimal strict public variant containing only `schema_version` and `discord.enabled`. Guild,
    channel, message, debounce, credentials path, and token values are neither required nor accepted in that variant.
    It means no login, panel validation, handler registration, credentials loading, or Discord network work.
18. `DISCORD_CREATE_PANEL=true` requires `enabled: true` and requires `control_message_id` to be absent.
19. Normal mode with `enabled: true` requires `control_message_id`. Supplying it together with
    `DISCORD_CREATE_PANEL=true` is a configuration error rather than an ignore/precedence rule.
20. Token values are never included in errors, logs, test snapshots, or returned configuration views.

### Explicit panel provisioning mode

21. Panel creation is an explicit provisioning-only process mode. It runs before and instead of normal runtime
    construction: Match/Lost stores are not created and the HTTP/GSI server never binds.
22. Provisioning loads and validates only common process logging/locale settings plus Discord public/private
    configuration. It does not require valid client or Lost-policy documents.
23. The provisioner logs in, waits for ready, resolves the exact configured guild and channel, validates channel type
    and effective permissions, creates one canonical panel message, pins that exact message, and then logs its ID.
24. Required channel capabilities are `ViewChannel`, `ReadMessageHistory`, `SendMessages`, and the current dedicated
    `PinMessages` permission. Broad `Administrator` permission is neither required nor recommended.
25. A successful provision emits one structured record with code `DISCORD_PANEL_CREATED`, `guildId`, `channelId`, and
    `controlMessageId`; destroys the Discord client; returns normally; and lets the process exit with code `0`.
26. A provisioning failure emits a safe stage/code without token or raw SDK payload, destroys the client if created,
    and terminates with a non-zero process result.
27. If message creation succeeds but pinning fails, the provisioner makes one best-effort deletion of the newly
    created bot message. Cleanup failure is logged explicitly so the operator can remove the orphan manually.
28. The provisioner never searches for a similar message, reuses an old message, edits an existing message, or
    silently creates a second message from normal mode.
29. After success, the operator copies `controlMessageId` into the public configuration, removes/disables the
    provisioning flag, and restarts in normal serving mode.

### Normal-mode panel contract

30. Normal mode logs in and fetches exactly the configured guild, text channel, and control message before the runtime
    is considered ready.
31. Normal mode is read-only with respect to panel lifecycle. It does not create, edit, repin, migrate, or repair the
    panel.
32. Startup fails if the guild/channel/message is missing, the channel is not the configured guild text channel, the
    message is not pinned, the message was not authored by the current bot, or its content/component contract does not
    match the canonical payload for the configured locale. Changing `COACH_LOCALE` therefore requires explicit panel
    reprovisioning.
33. The canonical initial message is:

```text
Dota Coach
Выбери действие или роль на текущий матч.

[ I'm lost ] [ Buy ]
[ 1 Carry ] [ 2 Mid ] [ 3 Offlane ] [ 4 Support ] [ 5 Hard Support ]
```

34. The first action row contains `I'm lost` and disabled `Buy`. The second row contains all five role buttons.
35. `Buy` is rendered disabled and has no executable routing path in this slice.
36. Stable versioned custom IDs are fixed to:

```text
coach:v1:action:lost
coach:v1:action:buy
coach:v1:role:1
coach:v1:role:2
coach:v1:role:3
coach:v1:role:4
coach:v1:role:5
```

37. Custom IDs contain no Discord user ID, client ID, match ID, alias, token, locale, or mutable state. Discord supplies
    requester identity in the interaction.
38. Role buttons do not attempt shared-message selected state. A public panel cannot truthfully visualize a separate
    effective role for every user.
39. The canonical panel payload is built by one pure function and reused by provisioning, startup validation, and
    contract specs so those paths cannot drift.

### Interaction validation and acknowledgement

40. Only button interactions from the configured guild, channel, and exact `control_message_id` are accepted.
    Interactions from DMs, copied messages, other channels/guilds, unsupported component types, or unknown versions
    are rejected without invoking Match/Lost.
41. The custom-ID parser is exhaustive and returns a small immutable application command:
    `lost`, `buy_disabled`, or `set_role(role)`.
42. Every recognized interaction receives an initial reply or defer within Discord's three-second contract. No Lost
    scoring, public channel send, retry, or reconnect is allowed before acknowledgement.
43. Rejected validation, identity, context, duplicate, disabled-action, and role results are ephemeral. Successful
    Lost recommendations are published as a separate public message in the configured text channel.
44. An accepted Lost request is acknowledged with an ephemeral defer. After public delivery, that deferred response
    is edited to a short ephemeral confirmation. If recommendation or delivery fails, it is edited to a localized
    ephemeral error.
45. The SDK event callback contains failures and resolves normally after the safe response/log path. Rejected
    promises never escape the event emitter.
46. The adapter disables all generated mentions with `allowedMentions`/equivalent empty parsing. A configured alias or
    rendered recommendation can never ping users, roles, or everyone.

### Lost action scope and debounce

47. Before Lost scoring, the handler resolves the requester through the trusted Discord mapping and obtains a ready
    factual Match context through the existing public Match query.
48. That preflight provides the stable `matchId` and requester identity required for routing/debounce. It does not
    make a recommendation and does not inspect Match stores directly. The audience and effective role actually used
    by Lost are returned by the recommendation use case for presentation consistency.
49. The in-memory Lost debounce key is exactly `(matchId, discordUserId, actionType)`, where the only enabled action in
    this slice is `lost`.
50. Enabled configuration requires an explicit `action_debounce_ms`; there is no parser default. The tracked initial
    value is `5_000`. Its window is half-open: `0 <= now - acceptedAt < actionDebounceMs`; the exact boundary is
    accepted.
51. A duplicate inside the window receives an immediate ephemeral localized acknowledgement and never calls
    `recommendLostAction`.
52. The debounce entry is recorded only after guild/channel/message/custom-ID, identity, and ready-match validation
    succeed and immediately before the accepted interaction is deferred.
53. Debounce is not advice hysteresis. Discord debounce prevents duplicate work/click storms; Lost advice memory
    continues to control recommendation stability across irregular request intervals.
54. Entries are bounded to trusted users/current action scopes and expired entries are pruned on access. Match changes
    naturally create a new key; no background cleanup timer is added.
55. The debounce store uses an injected monotonic clock. Wall-clock changes cannot reopen or extend a window.

### Lost text delivery

56. Accepted Lost interactions call the existing public `RecommendLostAction` exactly once with the interacting
    Discord user ID. Discord does not duplicate scoring, candidate selection, confidence, rendering, or hysteresis.
57. The public text mirror contains requester `coachAlias`, effective role, primary action and score, confidence,
    coverage, rendered reasons/penalties, eligible alternative, unknowns, and guardrails already produced by Lost.
58. Discord presentation consumes typed fields. It never parses `voiceText`, `textTitle`, `textBody`, debug logs, or
    console output to recover score, audience, role, or metadata.
59. The Lost application result is extended with a transport-neutral immutable delivery envelope containing the
    individual audience and effective role from the exact context used for that recommendation. This reuses the
    existing individual-audience abstraction and leaves room for a later command-wide audience without hardcoded
    addressing. It never acquires Discord channel/message/interaction types.
60. The initial public format is plain Discord text, not embeds. Existing `textTitle` and `textBody` remain the
    recommendation copy; the Discord presenter adds a compact requester/role/score/confidence/coverage header.
61. `HOLD_AND_WAIT` is a valid public recommendation with no fabricated primary score or alternative. An unavailable
    Lost result is an ephemeral error and is never published publicly.
62. Public delivery targets the configured channel object, not the interaction's arbitrary channel reference, even
    though validation requires them to match.
63. Sending one public message is the success boundary. There is no automatic retry because a timed-out request may
    already have reached Discord and a blind retry can duplicate advice.

### Role buttons

64. Role buttons call only the existing public `setRequesterRoleOverride({ discordUserId, role })` use case.
65. Role selection is requester-scoped, match-scoped, idempotent, and does not trigger Lost, Buy, text publication,
    voice, or debounce.
66. A successful role update returns a localized ephemeral confirmation containing the resulting role.
67. Unknown, missing, stale, unavailable, or outside-session requesters receive a localized ephemeral error and do
    not change the configured default role.
68. Discord does not own role state and does not cache a selected role separately from Match.

### Localization, errors, and observability

69. Panel labels, ephemeral confirmations/errors, and Discord text-layout labels use stable typed locale keys selected
    by the existing strict `COACH_LOCALE` setting. The initial catalog supports `ru` only and has no implicit fallback.
70. Orchestration specs assert keys, parameters, routing, and visibility rather than full Russian sentences. Catalog
    specs assert exhaustive non-empty translations and focused formatting cases.
71. Initial error mapping preserves the MVP semantics:

| Internal result                                                         | Discord visibility      | Meaning                                                      |
| ----------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| unknown Discord mapping / `client_not_found`                            | ephemeral               | no GSI client is configured for this Discord user            |
| `snapshot_missing` / `snapshot_stale`                                   | ephemeral               | fresh game data is unavailable                               |
| `match_unavailable` / `outside_active_session` / `game_not_in_progress` | ephemeral               | advice or role override is unavailable for the current match |
| duplicate Lost request                                                  | ephemeral               | the request is already being processed/debounced             |
| disabled Buy                                                            | ephemeral               | Buy is not available in this vertical                        |
| public message send failure                                             | ephemeral when possible | advice could not be published; retry manually                |
| role `updated`                                                          | ephemeral               | effective role changed for the active match                  |

72. Expected user/config/platform failures use bounded stable codes. Raw SDK error bodies and tokens are not surfaced
    to Discord users.
73. Structured logs may include request ID, safe stage/code, action type, `clientId`, match ID, role, delivery status,
    latency, guild/channel/control-message infrastructure IDs, and Discord API error category.
74. Logs must not include bot token, GSI token, Discord user ID, alias, recommendation text, raw interaction payload,
    raw SDK response, raw GSI snapshot, or arbitrary message content.
75. Provisioning is the explicit exception for `controlMessageId`: its whole purpose is to emit the operator-facing
    ID. No secret or user identity is emitted with it.
76. Reconnect/resume after a successful initial connection is delegated to `discord.js` and observed with safe
    lifecycle logs. Interaction handlers never perform login/reconnect.

### Runtime lifecycle

77. Bootstrap resolves one process mode before side effects:
    `provision_discord_panel` or `serve`.
78. Provisioning mode runs the one-shot provisioner and returns. It never registers signal handlers for a long-lived
    server and never calls `Runtime.start()`.
79. Normal serving mode constructs Match/Lost/HTTP exactly once, constructs Discord only when enabled, and composes
    both resources under the existing runtime `start`/`stop` contract.
80. The Discord listener is registered before login; normal startup waits for ready and validates the configured
    panel before HTTP binding and before logging `runtime started`.
81. If a later startup step fails, every resource already started in that attempt is stopped in reverse order. A
    Discord startup failure leaves no HTTP listener; an HTTP bind failure destroys the logged-in Discord client.
82. Shutdown first prevents new Discord interactions, then closes HTTP and destroys the Discord client. Stop is
    idempotent and attempts all cleanup even if one resource fails.
83. Normal runtime readiness means all enabled mandatory adapters are ready. `GET /health` is not exposed while an
    enabled Discord adapter is invalid or still starting.
84. A Discord disconnect after successful startup does not terminate the HTTP/GSI runtime immediately. SDK reconnect
    is allowed and state transitions are logged; policy for prolonged outage is deferred until live evidence exists.

## Deferred Decisions

The following remain deliberately outside this implementation contract:

1. TTS provider, voice channel, voice connection, speech queue, deadlines, playback watchdogs, and text-only circuit
   breaker.
2. Buy scoring, Buy text rendering, and enabling the existing disabled Buy button.
3. Commands addressed to several players, party-wide recommendations, per-recipient delivery, or coordinated action
   reservation.
4. Slash/admin commands, automatic panel migration, panel edits in normal mode, dynamic channel discovery, and
   multiple guild/channel support.
5. Embeds, attachments, reactions, threads, localization per Discord user, and locale negotiation from interaction
   metadata.
6. Persistent/distributed debounce, exactly-once delivery, durable interaction jobs, restart recovery, and multi-pod
   leader election.
7. Prolonged Gateway-outage readiness policy, operational alerts, and Kubernetes probes tied to Discord connectivity.
8. Discord HTTP rate-limit tuning beyond SDK defaults and safe logging. Live evidence must precede custom retries or
   backoff policy.
9. Automatic deletion of an old panel during reprovisioning. Operators explicitly remove obsolete panels.
10. A generic integration lifecycle framework. A small composed lifecycle is sufficient for HTTP plus one Discord
    client; extraction requires a second proven use case.

## Scope Exclusions

This vertical must not add:

- TTS, voice, audio dependencies, encoders, queues, timers, or media files;
- Buy recommendation logic or a clickable Buy execution path;
- a Discord REST interaction endpoint, Express Discord route, webhook, or public coaching HTTP route;
- new Match/Lost scoring rules, GSI normalization, map mechanics, or policy weights;
- persistence, Redis, database, distributed lock, scheduler, worker, second process, or second container;
- dynamic guild/channel lookup, message-content ingestion, chat parsing, or privileged Gateway intents;
- automatic panel mutation in normal mode;
- raw Discord/GSI payload retention or private identity logging;
- frontend, Python/LLM integration, Kubernetes manifests, Argo CD resources, SOPS files, or production deployment work.

## Target Vertical

### Provisioning process

```text
DISCORD_CREATE_PANEL=true
          │
          ▼
parse process mode + Discord YAML/credentials
          │
          ▼
discord.js login → ready → configured guild/channel validation
          │
          ▼
build canonical panel → send once → pin exact message
          │
          ▼
structured DISCORD_PANEL_CREATED { controlMessageId }
          │
          ▼
destroy client → successful process exit (0)

No Match/Lost construction and no HTTP/GSI bind
```

### Normal serving process

```text
configured pinned panel button
          │ interactionCreate (Gateway, Guilds intent)
          ▼
integrations/discord SDK boundary
  validate guild/channel/message/version
  parse stable custom ID
          │
          ├── role ──► ephemeral ACK ──► Match.setRequesterRoleOverride
          │                                └── ephemeral result
          │
          ├── disabled Buy ───────────────► ephemeral result
          │
          └── Lost
                │
                ▼
          trusted identity + Match public preflight
                │
                ▼
          debounce(matchId, userId, lost)
                │ accepted
                ▼
          ephemeral defer
                │
                ▼
          Lost.recommendLostAction exactly once
                │ recommended
                ▼
          Discord text presenter
                │
                ▼
          configured channel public send
                │
                ▼
          ephemeral delivery confirmation

Discord SDK types stop at integrations/discord.
Match and Lost remain transport-neutral.
```

## Architectural Boundaries

### Bootstrap boundary

Bootstrap owns process-mode selection, mode-aware configuration loading, dependency construction, lifecycle ordering,
rollback, and final exit semantics. `main.ts` remains small: run the selected mode, install signal handling only for a
long-lived runtime, and map an uncaught startup/provisioning failure to exit code `1`.

Provisioning is not modeled as a special HTTP runtime. It is a one-shot application operation with explicit cleanup.

### Discord SDK boundary

`integrations/discord` owns `discord.js` Client construction, Gateway intents, login/destroy, channel/message fetch,
permission inspection, panel send/pin, SDK interaction acknowledgement, message publication, and SDK error mapping.

No `Client`, `ButtonInteraction`, `Message`, `TextChannel`, collection, builder, or SDK enum crosses this boundary.

### Discord application boundary

Small transport-independent functions inside the integration package own custom-ID parsing, panel description,
interaction routing, debounce policy, user-result mapping, and typed Discord presentation messages. Their dependencies
are narrow function ports supplied by bootstrap:

- trusted Discord identity resolution;
- `BuildCoachContext` preflight;
- `RecommendLostAction`;
- `SetRequesterRoleOverride`;
- monotonic clock;
- acknowledgement/publication ports;
- safe structured logging.

The router coordinates existing use cases but does not become a recommendation domain.

### Match boundary

Match remains the source of active requester/session/effective-role facts. The Discord preflight consumes the existing
public context query and projects only the action scope needed by debounce/presentation. Discord never retains the full
`CoachContext` after that request.

Role updates continue through the existing requester-scoped public use case.

### Lost boundary

Lost remains the only owner of signals, safety, scoring, confidence, hysteresis, selection, recommendation rendering,
and unknown/guardrail semantics. Discord calls its public use case once and presents the typed result without
recomputing any decision.

If requester/effective-role presentation metadata is added to the Lost result, it is an application delivery envelope,
not a Discord dependency and not a domain scoring input.

### Localization boundary

The shared platform locale registry continues to define supported locale codes. Discord owns a typed transport-copy
catalog for panel labels, headers, confirmations, and errors. Lost continues to own Lost recommendation wording.

No adapter orchestration branch embeds user-facing Russian text.

## Contract Baseline

### Public Discord configuration

Disabled mode is the minimal strict document:

```yaml
schema_version: 1

discord:
  enabled: false
```

Enabled normal mode requires every shown field:

```yaml
schema_version: 1

discord:
  enabled: true
  guild_id: "000000000000000000"
  text_channel_id: "000000000000000000"
  control_message_id: "000000000000000000"
  action_debounce_ms: 5000
```

Provisioning uses the enabled public document with `control_message_id` omitted. `action_debounce_ms` remains required
even though the one-shot provisioner does not consume it, so the same document becomes a complete normal-mode config
after the operator adds the created message ID. No parser default is applied.

### Private Discord credentials

```yaml
schema_version: 1

discord:
  bot_token: "replace-me"
```

### Process settings

```text
DISCORD_CONFIG_PATH=/etc/dota2-coach/discord.yaml
DISCORD_CREDENTIALS_PATH=/run/secrets/dota2-coach/discord-credentials.yaml
DISCORD_CREATE_PANEL=false
```

### Parsed configuration

```ts
type DiscordConfiguration = Readonly<{
  enabled: boolean;
  guildId: string;
  textChannelId: string;
  controlMessageId: string | null;
  actionDebounceMs: number;
  botToken: string | null;
}>;

type RuntimeProcessMode =
  Readonly<{ kind: "serve" }> | Readonly<{ kind: "provision_discord_panel" }>;
```

The actual implementation may split enabled/disabled parsed variants into a discriminated union. It must preserve the
conditional invariants above and never make an unavailable token appear as a usable string.

### Parsed panel action

```ts
type DiscordPanelAction =
  | Readonly<{ kind: "request_lost" }>
  | Readonly<{ kind: "buy_disabled" }>
  | Readonly<{ kind: "set_role"; role: 1 | 2 | 3 | 4 | 5 }>;
```

### Lost action scope

```ts
type DiscordLostActionScope = Readonly<{
  matchId: string;
  discordUserId: string;
  clientId: string;
}>;

type DiscordActionDebounceKey = Readonly<{
  matchId: string;
  discordUserId: string;
  actionType: "lost";
}>;
```

This scope is request-local. Debounce storage retains only its stable key and monotonic acceptance time, not alias,
context, recommendation, rendered output, or raw interaction.

The successful Lost application result adds the metadata used by the same scoring invocation:

```ts
type LostRecommendationDelivery = Readonly<{
  audience: Readonly<{
    kind: "individual";
    displayName: string;
  }>;
  effectiveRole: 1 | 2 | 3 | 4 | 5;
}>;
```

The Discord presenter receives `{ delivery, recommendation }`; it does not derive the display name or effective role
from the earlier debounce preflight.

### Public Lost message

```text
{coachAlias} · роль {effectiveRoleLabel}
{textTitle}
Score: {primaryScore | "—"} · Confidence: {confidence} · Coverage: {coverage}/5
{textBody}
```

The exact localized header labels belong to the typed Discord catalog. The structural fields are fixed. Discord does
not mention/ping the requester and does not include raw IDs.

### Provisioning result

```ts
type ProvisionDiscordPanelResult = Readonly<{
  guildId: string;
  channelId: string;
  controlMessageId: string;
}>;
```

The result exists only long enough to write the operator-facing structured log and complete cleanup.

## Manual Operator Prerequisite — Discord Bot Registration

Operator action status: `completed`

Required by: live provisioning and Phase 7 Discord smoke test. It may be completed in parallel with Phase 1 and does
not block deterministic RED/GREEN unit tests, which use SDK-free fakes and never consume a real token.

Registration is a manual external action. The runtime never creates a Discord application, bot user, install link,
guild membership, role, or token.

### 1. Create the Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application for this runtime, for example `Dota Coach`.
3. Keep the application owner/team under the intended operator account. No Application ID or Public Key is required
   by this text-only Gateway vertical.

New Discord applications normally have a bot user enabled. If the portal shows no bot user, create one from the
`Bot` page.

### 2. Generate and retain the bot token

1. Open the application's `Bot` page.
2. Under `Token`, use `Reset Token` to generate a token.
3. Copy it immediately to a password manager or other operator-controlled secret store; Discord does not show the
   complete value again without another reset.
4. Do not paste it into chat, issues, plans, tracked YAML, shell history, logs, screenshots, or test fixtures.
5. When the Phase 2 credentials example exists, place the token only in ignored
   `ops/dev/secrets/runtime/discord-credentials.local.yaml`.

If the token is exposed, reset it in the Developer Portal before any further run and replace every deployed/local
copy. A bot token authenticates Gateway and REST requests as the bot and must be treated as a password.

### 3. Keep Gateway access minimal

On the `Bot` page, leave all `Privileged Gateway Intents` disabled:

- Presence Intent — disabled;
- Server Members Intent — disabled;
- Message Content Intent — disabled.

The runtime identifies with the standard `Guilds` intent only. Standard intents need no portal toggle.

### 4. Configure guild installation

1. Open `Installation` and keep `Guild Install` enabled. User installation is not required for this vertical.
2. Use the Discord-provided install link.
3. Configure the guild install with the `bot` scope. If the portal automatically includes
   `applications.commands`, it may remain, but this vertical registers no commands.
4. Request only these bot permissions:
   - View Channels;
   - Send Messages;
   - Read Message History;
   - Pin Messages.
5. Do not request `Administrator`. As of the current Discord permission model, `Pin Messages` is a dedicated
   permission and `Manage Messages` alone is not a substitute.

The installing Discord member must be allowed to install apps/manage the target guild.

### 5. Install into the target test guild

1. Open the generated install link and add the app to the configured test guild.
2. Confirm the bot appears as a guild member.
3. On the target text channel, verify channel-level permission overrides still grant the four permissions above.
   Guild-level grants can be denied by channel overrides.

### 6. Collect non-secret infrastructure IDs

1. In the Discord client, enable `User Settings → Advanced → Developer Mode`.
2. Copy the target server ID and text-channel ID from their context menus.
3. Use those values as `guild_id` and `text_channel_id` in the enabled public YAML created in Phase 2.
4. Leave `control_message_id` absent for the first provisioning run. The one-shot provisioner will create/log it.

Server, channel, and later control-message IDs are infrastructure identifiers, not credentials. They remain strings
and are still kept out of arbitrary user-facing output.

### Operator checkpoint

Before live provisioning, the operator must have:

- one application with one bot user;
- one retained bot token in an operator-controlled secret store;
- privileged intents disabled;
- the bot installed in the target guild with the minimum permissions;
- copied guild and text-channel IDs;
- no token committed to the application repository.

## Proposed File Layout

Exact helper names may change during implementation, but ownership must remain equivalent:

```text
apps/runtime/src/
  bootstrap/
    create-runtime.ts
    run-application.ts                         # mode selection and one-shot/serve orchestration
  integrations/
    discord/
      discord.types.ts                         # SDK-free local ports/value types
      panel/
        discord-panel.ts                       # canonical panel description/custom IDs
        parse-panel-action.ts
        provision-discord-panel.ts             # SDK-free orchestration over a gateway port
      application/
        action-debounce.ts
        handle-discord-button.ts
        present-discord-lost-message.ts
        discord-message.ts                     # typed locale keys/params
      infrastructure/
        create-discord-client.ts               # discord.js construction/login/destroy
        discord-gateway-adapter.ts              # fetch/send/pin/event/ACK/public send
        russian-discord-translator.ts
      *.spec.ts
  platform/
    config/
      parse-discord-config.ts
      load-discord-config.ts
      parse-runtime-settings.ts
ops/dev/
  config/runtime/
    discord.yaml
  secrets/runtime/
    discord-credentials.example.yaml
    discord-credentials.local.yaml              # ignored
```

Do not create empty future `voice`, `tts`, `buy`, command-wide, or generic lifecycle directories.

## Milestone Status

| Milestone                                                     | RED phase | GREEN phase | Status        |
| ------------------------------------------------------------- | --------- | ----------- | ------------- |
| M0. Contract baseline                                         | —         | Phase 0     | `completed`   |
| M1. Configuration and explicit panel provisioning             | Phase 1   | Phase 2     | `completed`   |
| M2. Interaction routing, debounce, localization, and delivery | Phase 3   | Phase 4     | `not-started` |
| M3. Discord Gateway and HTTP runtime lifecycle                | Phase 5   | Phase 6     | `not-started` |
| M4. Verification and handoff                                  | —         | Phase 7     | `not-started` |

## Phase 0 — Contract Baseline

Status: `completed`

Target end state: `completed`

Resolve and record before implementation:

- one configured guild/text channel/pinned control message;
- full `discord.js` Gateway client with `Guilds` intent only;
- public Lost result and ephemeral errors/role confirmations;
- disabled Buy button with no execution path;
- exact panel content and versioned custom IDs;
- separate public/private YAML documents and process path settings;
- explicit mutually exclusive provisioning-only mode;
- successful provisioning exit `0`, failed provisioning non-zero;
- normal-mode panel read-only validation;
- `(matchId, discordUserId, actionType)` monotonic debounce with `5_000 ms` default;
- SDK boundary, public Match/Lost dependencies, privacy, localization, and lifecycle rules;
- explicit exclusions for TTS, Buy, persistence, extra processes, HTTP interactions, and deployment work.

Exit criteria:

- M0 is `completed`.
- Plan status becomes `approved`.
- No unresolved contract question is required to write Phase 1 specs.
- No production code or dependency is changed by this phase.

## Phase 1 — Configuration and Provisioning RED

Status: `red-expected`

Target end state: `red-expected`

Completed:

- Added final SDK-free immutable contracts for disabled/enabled Discord configuration, optional credentials sources,
  process settings, canonical panel values, typed panel actions, required channel permissions, panel observations, and
  provisioning/validation commands.
- Extended safe configuration-source codes with `discord`, `discord_credentials`, and `discord_combined` without
  changing existing configuration behavior.
- Added six explicit compile-safe production seams for process parsing, combined YAML parsing, canonical panel
  building, custom-ID parsing, one-shot provisioning, and read-only normal validation. Every seam fails with one
  bounded `not implemented` error and is not wired into runtime startup.
- Added RED intent specs for strict minimal `enabled: false`, complete enabled normal/provisioning variants, required
  explicit debounce, string snowflakes, strict public/private fields and versions, safe syntax/validation errors, and
  secret non-disclosure.
- Added RED panel specs for the exact two-row Russian layout, enabled Lost, disabled Buy, five role buttons, immutable
  nested values, versioned custom IDs, and exhaustive unsupported-ID rejection.
- Added RED lifecycle specs for exact one-shot operation order, required permissions, immutable created-message
  result, safe stage errors, pin compensation, cleanup-failure reporting, cleanup after every startup failure stage,
  normal-mode read-only validation, current-bot authorship, pinned state, and canonical payload matching.
- Recorded the operator-owned Discord application/bot registration, minimal install permissions, disabled privileged
  intents, token handling, and ID collection. The operator reports this prerequisite complete; no token was added to
  the repository.
- Kept `discord.js`, package/lockfile changes, config loading, tracked ops files, Compose, HTTP/runtime wiring, and all
  real network work out of Phase 1.

Verification evidence (`2026-07-22`):

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test:smoke` — passed;
- previous regression set excluding the four new Discord RED suites — `35` suites / `313` tests passed;
- full Jest run is intentional RED — `4` new suites / `49` assertions fail only on the six explicit missing seams,
  while the same `35` suites / `313` previous tests pass;
- refreshed code graph indexes the new configuration/panel boundaries and confirms they remain unwired; no
  `discord.js` import or package dependency exists;
- `git diff --check` and Prettier checks passed.

Add compile-safe seams and failing intent specs for:

- strict process parsing of Discord paths and `DISCORD_CREATE_PANEL`;
- separate strict public/private versioned Discord YAML parsing;
- minimal `enabled: false` and complete `enabled: true` discriminated variants;
- explicit required `action_debounce_ms` with no parser default;
- enabled/disabled, provisioning, token, message-ID, and mutual-exclusion invariants;
- string snowflakes and safe configuration errors;
- canonical two-row panel description, disabled Buy, exact versioned custom IDs, and pure action parsing;
- provisioning success order: login/ready, guild/channel validation, permissions, send, pin, structured result, destroy;
- no HTTP/runtime/Match/Lost construction in provisioning mode;
- pin failure compensation and cleanup-failure reporting;
- guaranteed client destroy on every post-construction failure;
- no token/raw SDK payload in errors or logs;
- normal-mode panel validation as read-only behavior.

Document the manual application/bot registration, minimum guild-install permissions, privileged-intent exclusions,
token handling, and ID collection. Real registration remains operator-owned and is not called from tests or runtime.

The seams may throw a bounded `not implemented` error. Existing typecheck/build and all previous green specs must
remain green.

Exit criteria:

- New specs fail only for the explicit missing configuration/provisioning behavior.
- Previous runtime, Match, Lost, HTTP, and console-debug coverage remains green.
- No Gateway connection, Discord package wiring, panel creation, or HTTP lifecycle change is active in production.

## Phase 2 — Configuration and Provisioning GREEN

Status: `completed`

Target end state: `completed`

Completed:

- Added `discord.js 14.27.0`, compatible with the runtime's Node 24 contract, and committed its resolved dependency
  graph in the runtime lock file.
- Implemented strict immutable Discord process parsing, discriminated public YAML parsing, private credentials
  parsing, mode invariants, string snowflakes, safe source/syntax/validation errors, and mode-aware loading that never
  reads or accepts credentials when Discord is disabled.
- Added the tracked disabled local public document, tracked credentials example, ignored `*.local.yaml` secret path,
  and Compose config/mount/env seams. The default local stack remains Discord-disabled; an enabled run must explicitly
  supply `DISCORD_CREDENTIALS_PATH`.
- Implemented the immutable canonical two-row Russian panel and exhaustive versioned custom-ID parser. Provisioning,
  validation, and later interaction routing share the same SDK-free panel value.
- Added a narrow SDK-free Gateway port and a `discord.js` adapter using only the `Guilds` intent. SDK values remain in
  `integrations/discord`; the adapter owns login/ready, exact guild-text resolution, effective permission projection,
  message send/pin/delete/fetch, observed panel mapping, mention suppression, and destroy.
- Implemented one-shot provisioning with safe stage errors, permission checks, immutable operator result, guaranteed
  destroy, pin-failure message compensation, and explicit cleanup-failure reporting.
- Implemented read-only normal validation for required permissions, exact location, current-bot authorship, pinned
  state, and canonical content/components without create/edit/pin/delete repair behavior.
- Added deterministic loader and lifecycle coverage for disabled secret non-loading, source failures, permission
  failure, every provisioning failure stage, single destroy behavior, compensation, and read-only validation. No test
  opens a Discord connection.
- Kept config loading, Gateway construction, provisioning, and validation behind unwired seams; existing runtime,
  HTTP, Match, Lost, and console behavior remains unchanged until lifecycle phases.

Verification evidence (`2026-07-22`):

- `npm run check` — passed: typecheck, ESLint, Prettier, `40` suites / `370` tests, ESM build, and built-runtime smoke;
- focused Phase 2 run — `5` suites / `57` tests passed;
- `git diff --check` passed and the tracked ops YAML is covered by Prettier-compatible formatting;
- refreshed code-graph inbound traces report no production caller for `loadDiscordConfig`,
  `createDiscordGatewayAdapter`, or `createProvisionDiscordPanel`, confirming the Phase 2 boundary remains unwired;
- no real Discord token, Gateway connection, panel mutation, HTTP bind, or secret-bearing log/snapshot was used.

Implement:

- the compatible `discord.js` dependency and lockfile update;
- strict immutable Discord process/public/private parsing and mode-aware loading;
- tracked public local config, tracked secret example, ignored local secret path, and Compose mounts/env placeholders;
- pure canonical panel builder and exhaustive custom-ID parser;
- narrow SDK port plus `discord.js` implementation for login/ready, channel resolution, permission validation, send,
  pin, best-effort cleanup, fetch, and destroy;
- one-shot provisioning application service with safe structured result/log metadata;
- read-only normal panel validator;
- deterministic specs with fakes and no real Discord network calls.

Verification:

- typecheck, focused Jest, ESLint, Prettier, ESM build, and `git diff --check`;
- configuration failures occur before network calls;
- provisioner specs prove no HTTP bind and cleanup on every failure stage;
- no secret appears in thrown errors, snapshots, or log metadata.

Exit criteria:

- M1 is `completed`.
- Every Phase 1 RED spec is green.
- The provisioner is complete behind an unwired bootstrap seam.
- Normal runtime behavior remains unchanged until lifecycle wiring phases.

## Phase 3 — Interaction Routing and Delivery RED

Status: `not-started`

Target end state: `red-expected`

Resolve initial short `ru` copy and add compile-safe seams/failing specs for:

- exact guild/channel/message/version/button validation;
- typed action routing and disabled Buy rejection;
- prompt ephemeral reply/defer before Lost scoring/public send;
- Match preflight projection into `DiscordLostActionScope`;
- half-open monotonic debounce, exact boundary, match separation, bounded pruning, and no duplicate scoring;
- accepted Lost calling `RecommendLostAction` exactly once;
- unavailable Lost mapping to ephemeral errors without public output;
- public Lost presenter with alias, effective role, primary score, confidence, coverage, and existing detailed text;
- `HOLD_AND_WAIT` formatting without fabricated score/alternative;
- configured-channel send, mention suppression, no blind retry, and delivery confirmation/failure mapping;
- five idempotent role paths through `SetRequesterRoleOverride` with ephemeral results and no Lost/debounce call;
- typed Discord translation messages and exhaustive `ru` catalog;
- containment of SDK callback failures and safe structured request/delivery metadata;
- immutable request/result values and absence of SDK types from Match/Lost.

Exit criteria:

- New specs fail only for missing interaction/debounce/presentation/delivery behavior.
- Phase 2 and every previous suite remain green.
- No production event handler or Discord startup wiring is active.

## Phase 4 — Interaction Routing and Delivery GREEN

Status: `not-started`

Target end state: `completed`

Implement:

- pure interaction guards and exhaustive custom-ID dispatch;
- request-local Match action-scope projection through the public API;
- bounded injected-clock action debounce;
- Lost and role application handlers with explicit acknowledgement ordering;
- the fixed transport-neutral Lost delivery envelope without reparsing/re-querying audience and role facts;
- plain-text public Lost presenter and typed localized ephemeral responses;
- Discord adapter mapping for defer/reply/edit/public send with mention suppression;
- safe result/error mapping and contained event callback;
- intent-driven specs using fakes for every accepted/rejected/concurrent path.

Verification must prove:

- Lost scoring starts only after defer and only once per accepted request;
- duplicate clicks never call Lost;
- role clicks never call Lost or public delivery;
- invalid/copy-panel interactions never reach application use cases;
- success publishes exactly one public message to the configured channel;
- failure after defer is completed ephemerally when Discord permits it;
- output does not parse existing rendered strings to recover typed facts;
- no raw/private data enters logs.

Exit criteria:

- M2 is `completed`.
- Every Phase 3 RED spec is green.
- The interaction handler is complete behind an unwired Gateway listener seam.
- Match and Lost remain independent of Discord SDK/types.

## Phase 5 — Runtime Lifecycle RED

Status: `not-started`

Target end state: `red-expected`

Add failing integration intent specs for:

- bootstrap selection between provisioning and serving before side effects;
- provisioning success returning without runtime start/signal registration;
- provisioning failure producing non-zero startup result;
- disabled Discord preserving the current HTTP-only lifecycle;
- enabled normal startup registering handler, login/ready, panel validation, then HTTP bind;
- startup rollback in reverse order for Discord validation and HTTP bind failures;
- readiness/start log only after every enabled adapter is ready;
- idempotent shutdown preventing new interactions and attempting both HTTP/Discord cleanup;
- safe reconnect/disconnect lifecycle logs without handler-level login;
- startup errors containing safe stage/code only;
- built-runtime/Compose seams that do not require real Discord for disabled/smoke configurations.

Exit criteria:

- New specs fail only for missing process/lifecycle composition.
- All unit/application behavior from Phases 2 and 4 remains green.
- Production `main.ts` still follows the prior lifecycle until Phase 6.

## Phase 6 — Runtime Lifecycle GREEN

Status: `not-started`

Target end state: `completed`

Implement:

- explicit application-mode bootstrap orchestration;
- one-shot provisioning path with natural successful exit and failure exit code mapping;
- normal Discord construction from validated configuration;
- one persistent `interactionCreate` listener;
- ordered enabled-Discord startup and HTTP binding;
- reverse rollback and idempotent multi-resource shutdown;
- disabled-Discord path for repository smoke tests and local troubleshooting;
- Compose config/mounts/env documentation for both normal and one-shot commands;
- safe lifecycle/request/delivery logs.

Verification:

- complete `npm run check`;
- built-runtime smoke with Discord disabled and no external network dependency;
- focused lifecycle specs for all failure/rollback permutations;
- Docker/Compose config rendering and health smoke in normal disabled mode;
- `git diff --check` and module-boundary inspection.

Exit criteria:

- M3 is `completed`.
- Every Phase 5 RED spec is green.
- Provisioning and normal mode are both reachable only through their explicit configuration.
- Existing HTTP/GSI and Lost behavior remains unchanged.

## Phase 7 — Verification and Handoff

Status: `not-started`

Target end state: `completed`

Run repository and container verification:

- clean dependency install from the committed lock file;
- typecheck, complete Jest suite, ESLint, Prettier, ESM build, built-runtime smoke, and `git diff --check`;
- Docker image build and Compose health/authenticated-GSI smoke;
- module-boundary and log-privacy inspection;
- no focused, skipped, intentional RED, or production `not implemented` seam.

Run an operator-controlled Discord smoke test:

1. Configure a test bot/guild/text channel with the minimum required permissions.
2. Run `DISCORD_CREATE_PANEL=true` and verify no HTTP port binds.
3. Verify one pinned canonical panel, one structured ID log, Discord client cleanup, and process exit code `0`.
4. Copy the ID into public config, set provisioning false, and start normal mode.
5. Verify normal mode reuses and does not mutate the panel.
6. Click disabled Buy and verify an ephemeral response with no engine call.
7. Click each role with and without a fresh active match; verify requester-only match-scoped behavior.
8. Click `I'm lost` with an unmapped user, missing/stale data, and a valid requester.
9. Verify valid Lost publishes one public configured-channel message and one ephemeral confirmation.
10. Verify alias, effective role, score, confidence, coverage, reasons/penalties, alternative, unknowns, and guardrails.
11. Double-click within `5_000 ms` and at the exact boundary; verify only the accepted requests score/publish.
12. Click from a copied message/other channel and verify no Match/Lost invocation.
13. Restart normal mode and verify no new panel is created.
14. Stop the process and verify HTTP plus Discord cleanup without an unhandled rejection.

Exit criteria:

- M4 is `completed`.
- All repository-local, container, provisioning, and live Discord checks pass.
- The plan status becomes `completed` only after actual evidence is recorded.
- TTS/voice and Buy remain explicitly deferred with no placeholder implementation.

## Acceptance Matrix

| Capability           | Required evidence                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Process modes        | Provisioning and serving are explicit, mutually exclusive, and selected before side effects            |
| Provision exit       | Successful creation/pin logs the ID, cleans up, and exits `0`; failure exits non-zero                  |
| No bind in provision | HTTP/GSI never listens and Match/Lost runtime state is not constructed                                 |
| Configuration        | Public/private YAML split, strict schema, string snowflakes, conditional invariants, no secret leakage |
| Panel ownership      | Provisioner creates once; normal mode validates exact pinned panel without mutation                    |
| Panel contract       | Two rows, enabled Lost, disabled Buy, five roles, stable `coach:v1:*` IDs                              |
| SDK boundary         | `discord.js` types stay in `integrations/discord`; Match/Lost use public APIs only                     |
| Gateway              | One persistent listener and `Guilds` intent only; no collector or privileged intent                    |
| Validation           | Only configured guild/channel/message/version/button reaches application use cases                     |
| ACK                  | Every recognized accepted/rejected interaction replies or defers before the Discord deadline           |
| Debounce             | Half-open monotonic `(matchId,userId,lost)` window prevents duplicate scoring and stays bounded        |
| Lost scope           | One accepted click produces one requester-scoped Lost invocation                                       |
| Text delivery        | One public configured-channel message contains alias, role, score, confidence, coverage, and details   |
| Error visibility     | Validation/context/duplicate/delivery errors and role results are ephemeral                            |
| Role override        | Five role buttons remain requester-only, match-scoped, idempotent, and independent of Lost             |
| Localization         | Typed keys and strict current locale; orchestration tests are not coupled to full Russian strings      |
| Privacy              | No token, Discord user ID, alias, raw payload, or recommendation text in structured logs               |
| Lifecycle            | Enabled Discord readiness precedes HTTP bind; failures roll back; stop is complete and idempotent      |
| Compatibility        | Existing health/GSI/Lost/scoring/hysteresis/console contracts and checks remain green                  |
| Scope                | No TTS/voice, Buy engine, HTTP interactions, persistence, extra process/container, or deploy work      |

## Status Update Rule

When implementation starts or a phase completes:

1. Change plan status from `draft` to `approved` before Phase 1 starts.
2. Mark Phase 0 and M0 `completed` only after this complete contract is explicitly accepted.
3. Set the active implementation phase to `in-progress`; at most one GREEN/verification phase is active at a time.
4. Update the phase and its milestone together when exit criteria are met.
5. Record blockers in the affected phase instead of weakening configuration, acknowledgement, privacy, or lifecycle
   invariants.
6. Resolve deferred contract decisions before writing specs that depend on them.
7. Do not mark a RED phase `completed`; its valid target is `red-expected` with prior coverage green.
8. Do not mark a GREEN phase completed until its paired RED specs and regression suite pass.
9. Record actual commands/results in every completed GREEN and verification phase.
10. Do not mark Phase 7 or the plan complete while an intentional RED spec, production stub, unhandled event rejection,
    panel mutation in normal mode, secret leak, boundary violation, or scope leak remains.
