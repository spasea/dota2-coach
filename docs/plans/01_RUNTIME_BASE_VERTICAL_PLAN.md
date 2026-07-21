# Runtime Base Vertical Implementation Plan

## Status

- Plan status: `completed`
- Issue: not assigned
- Current implementation phase: `Phase 7 — Verification and Handoff (completed)`
- Last updated: `2026-07-21`

Status values:

- `draft` — plan is being reviewed and is not yet an implementation contract
- `approved` — fixed decisions and phase boundaries are accepted
- `completed` — phase exit criteria are met
- `in-progress` — phase is active
- `not-started` — phase has not started
- `red-expected` — phase intentionally ends with its new specs failing for the expected missing behavior
- `blocked` — a contract decision or external dependency prevents progress

An intentional RED phase is valid when the new specs fail for the expected missing behavior, compile-safe seams exist,
and previously green unrelated coverage remains green.

## Inputs

- [MVP rollout specification](../dota2_ai_coach_mvp_spec.md)
- [Dota 2 AI Coach draft plan](../dota2_ai_coach_draft_plan.md)
- [GSI Turbo match report](../gsi_turbo_match_report.md)
- [Current runtime package](../../apps/runtime/package.json)
- [Current runtime Dockerfile](../../ops/services/runtime/Dockerfile)
- [Current development Compose file](../../ops/dev/docker-compose.yml)
- [Implementation-plan format reference](./ISSUE_169_TYPED_RELATION_GRAPH_PLAN.md)

## Fixed Decisions

1. The MVP runs as one Node.js process inside one runtime container.
2. The existing top-level structure remains: application code lives under `apps/`, service images under
   `ops/services/`, and local orchestration under `ops/dev/`.
3. Future frontend and Python-based LLM runtimes will be added as separate applications and processes. This slice does
   not pre-create their modules, contracts, shared packages, or deployment manifests.
4. The runtime uses the Node.js 24 line already selected by the Dockerfile.
5. Production application code is TypeScript compiled to native ESM.
6. `package.json` uses `type: module`; TypeScript uses Node-aware ESM resolution through `NodeNext` and explicit `.js`
   extensions for relative runtime imports.
7. Express 5 is the HTTP framework for the base runtime.
8. The runtime remains a modular monolith. Modules are code boundaries inside the process, not independent services.
9. Application dependencies and scripts remain local to `apps/runtime`. The root npm package owns repository-only
   development tooling for Husky, lint-staged, and Prettier; it is not an npm workspace or application package.
10. Jest is the spec runner. `@swc/jest` transforms TypeScript for Jest, while `tsc --noEmit` remains the authoritative
    type check.
11. Jest may execute transformed tests as CommonJS internally. The built runtime and its smoke test must execute the
    emitted ESM with Node.js.
12. Specs use the `*.spec.ts` naming convention and import Jest APIs explicitly from `@jest/globals`.
13. The first vertical slice contains runtime bootstrap, typed configuration, structured logging, graceful shutdown,
    `GET /health`, authenticated `POST /gsi`, and an in-memory latest-client-state store.
14. `POST /gsi` authenticates native Dota GSI clients with the JSON payload field `auth.token`, resolved against trusted
    YAML client configuration. HTTP `Authorization` is not part of this integration contract.
15. A successful GSI ingest returns an empty `200 OK`; an object without a valid `auth.token` or with an unknown token
    returns `401`; a syntactically valid JSON value that is not an accepted snapshot object returns `422`.
16. Initial snapshot validation is deliberately shallow: the request body must be a non-null JSON object and not an
    array. Shape validation precedes authentication, so null, arrays, and primitives return `422`; object payloads are
    then authenticated. The slice does not invent a complete GSI schema before fields are consumed.
17. The latest state stores the resolved client identity, server receive time, and in-memory snapshot. It does not
    persist raw snapshots. The transport-only `auth` field is removed before the snapshot crosses into `match`.
18. GSI auth tokens and raw GSI snapshots must not be emitted to application or request logs.
19. Application construction and network listening are separate. Tests build the Express application through a
    dependency-injected factory without binding a real port.
20. Zod validates process-level configuration and parsed YAML configuration. YAML parsing and semantic validation are
    separate responsibilities.
21. Pino provides structured JSON logging. Human-readable local output may be enabled outside the core runtime without
    changing log event contracts.
22. TypeScript path aliases are excluded from the base slice. Relative imports avoid extra runtime and Jest resolvers.
23. Runtime source is separated by responsibility: `modules/` contains business capabilities, `integrations/` contains
    external protocols and SDKs, `platform/` contains technical runtime capabilities, and `bootstrap/` is the
    composition root.
24. `match` is a core module and owns latest client state. It will later own match lifecycle, normalized match facts,
    temporal memory, coverage, and factual match-context queries.
25. GSI is an inbound integration. It owns HTTP transport mapping, `auth.token` extraction and removal, raw payload
    validation, and later raw-GSI normalization, then invokes the public `match` API. It does not own latest-state
    storage.
26. `buy` and `lost` are independent sibling business modules. Each owns its context, candidates, hard gates, scoring,
    hysteresis, feature data, decision types, and use cases.
27. `buy` and `lost` must not import each other. `match` must not import either recommendation module. Discord may invoke
    their public APIs but must not reach into their internals.
28. Similar scoring pipelines do not justify a shared scoring-engine implementation. Stable cross-feature value types
    may be extracted only after both modules exist and demonstrate identical semantics.
29. Each business module exposes an explicit `public.ts` API. Cross-module deep imports are forbidden; module internals
    remain replaceable without changing consumers.
30. Internal `application/`, `domain/`, `data/`, and `infrastructure/` directories are created according to actual module
    responsibilities. Empty future `buy`, `lost`, Discord, TTS, or LLM directories are not created by this slice.
31. Local development runs through Docker Compose. Production Kubernetes, KSOPS, Kustomize, GitOps, custom resources,
    rollout, and secret-delivery design are not part of this plan.
32. This plan is documentation-only. Implementation begins only after the plan status changes to `approved`.
33. Trusted client configuration is split into two versioned YAML documents joined by a stable `client_id`. The public
    document contains `client_id` and `default_role`; the private document contains `gsi_token`, Discord user ID, and
    coach alias.
34. A `client_id` is a neutral non-sensitive mapping key. It must not contain a player name, Discord identity, GSI
    credential, or other personal data.
35. Both documents use `schema_version: 1`. Every public client has exactly one private credential entry; unknown,
    missing, or duplicate cross-document identities fail startup validation.
36. The runtime receives the documents through required `CLIENT_CONFIG_PATH` and `CLIENT_CREDENTIALS_PATH` process
    values, reads them once during startup, and keeps the resulting configuration immutable. Hot reload is excluded.
37. Each client has one active high-entropy GSI token in this slice. Tokens are 32–128 character Base64URL-compatible
    opaque values without whitespace; `openssl rand -hex 32` is the recommended generator. Tokens are secret YAML
    values rather than keys; duplicate values are rejected, and only SHA-256 token digests remain in the long-lived
    lookup registry.
38. Local public configuration is tracked under `ops/dev/config/runtime/`. A private example is tracked under
    `ops/dev/secrets/runtime/`, while `*.local.yaml` credentials in that directory are ignored by Git.
39. Production Kubernetes resources live in a separate GitOps repository and are reconciled by Argo CD with KSOPS and
    SOPS age encryption. This application repository does not define that contour; production must mount the same two
    application-level documents and provide their paths.
40. `GET /health` is a liveness-style endpoint that returns `200`, JSON content, and exactly `{ "status": "ok" }`.
41. Non-success HTTP responses use the stable public shape `{ "error": { "code": "<CODE>" } }`. Correlation is returned
    through `X-Request-Id`, not duplicated in the response body, and private error details are never exposed.
42. The initial GSI request-body limit is `1_048_576` bytes. `createApp` receives it as a dependency; process-level
    configuration wiring remains part of Phase 6.
43. HTTP failures map to the fixed status/code pairs: malformed JSON is `400 INVALID_JSON`, oversized input is
    `413 PAYLOAD_TOO_LARGE`, absent or unsupported media type is `415 UNSUPPORTED_MEDIA_TYPE`, failed GSI authentication
    is `401 UNAUTHORIZED`, invalid top-level snapshot shape is `422 INVALID_SNAPSHOT`, an unknown route is
    `404 NOT_FOUND`, and an unexpected failure is `500 INTERNAL_ERROR`.
44. Request IDs are generated by the runtime for every request; caller-supplied `X-Request-Id` values are ignored. GSI
    accepts `application/json` with standard media-type parameters such as `charset=utf-8`; missing, non-JSON, and
    vendor `application/*+json` media types return `415 UNSUPPORTED_MEDIA_TYPE`.
45. Process settings use required `CLIENT_CONFIG_PATH` and `CLIENT_CREDENTIALS_PATH` values with defaults
    `HOST=0.0.0.0`, `PORT=3000`, and `LOG_LEVEL=info`. Invalid process settings fail startup before port binding.
46. MVP signal handling uses the native HTTP server close lifecycle for `SIGTERM` and `SIGINT`. It stops accepting new
    connections without custom request tracking, a separate drain timeout, or forced socket destruction.

## Deferred Decisions

The following decisions are intentionally not guessed in this slice:

1. The exact Compose mounts that supply the approved local configuration paths to the runtime container.
2. Production GitOps repository layout, Kubernetes resources, age key management, rotation, and reconciliation details.
3. Overlapping GSI credentials for zero-downtime token rotation.
4. A future readiness probe distinct from the initial liveness-style health endpoint.
5. The full normalized GSI snapshot contract and which Dota fields become mandatory for later match processing.
6. Freshness thresholds, match grouping, same-team validation, and timeline-source policy.
7. Public frontend APIs and API versioning.
8. Discord, TTS, recommendation-engine, and Python LLM transport contracts.

Deferred decisions must be resolved before the phase that requires them. They must not be hidden inside route handlers,
environment defaults, Compose wiring, or Kubernetes assumptions.

## Scope Exclusions

- Discord bot startup, interactions, role buttons, text delivery, and voice delivery
- TTS provider selection, audio queue, watchdog, and deadlines
- `MatchMemory`, match lifecycle, sticky timeline source, freshness policy, and multi-client context building
- Snapshot normalization beyond the minimum ingest boundary
- Implementation of the `lost` and `buy` modules, while preserving their fixed future boundaries
- Curated hero, item, threat, or capability data
- Database, durable state, raw snapshot archive, and restart recovery
- Frontend endpoints, browser concerns, CORS policy, and shared frontend contracts
- Python runtime, LLM prompts, HTTP/gRPC client, retries, and circuit breaking
- Kubernetes resources, Kustomize overlays, KSOPS files, GitOps reconciliation, and production rollout
- npm workspaces, monorepo task runner, and speculative shared packages
- Authentication, authorization, onboarding, or multi-tenancy beyond static trusted GSI client tokens
- CI provider configuration and repository branch/release policy

## Target Vertical

```text
YAML client config
        │
        ▼
validated runtime config ───────────────────────────┐
                                                    │
GET /health ───────────────────────────────────────►│ platform/http
                                                    │
POST /gsi + JSON auth.token                         │
        │                                           │
        ▼                                           │
integrations/gsi                                    │
  authenticate + validate raw boundary              │
        │                                           │
        ▼                                           │
modules/match public API ◄──────────────────────────┘
  recordClientSnapshot
        │
        ▼
InMemoryLatestStateStore
        │
        ▼
structured metadata log, never raw snapshot/token
```

The vertical is complete when the runtime starts in the development container, reports health, accepts an authenticated
snapshot, rejects unauthenticated or invalid input according to the fixed contract, stores the latest in-memory state,
logs safe metadata, and stops cleanly.

## Architectural Boundaries

### Runtime source categories

- `modules/` owns business capabilities and their invariants.
- `integrations/` translates external protocols and SDK events into module inputs and maps results back outward.
- `platform/` provides configuration, HTTP hosting, logging, time, and process-level technical behavior.
- `bootstrap/` selects concrete implementations and connects modules, integrations, and platform capabilities.

No category is a generic shared-code bucket. In particular, `platform/` must not contain match, item, coaching, or
recommendation rules.

### Composition root

`main.ts` is the minimal process entry point. `bootstrap/create-runtime.ts` may:

- load process-level settings;
- load and validate trusted client configuration through an injected source;
- create the logger, clock, store, use case, and Express application;
- bind the HTTP server;
- handle startup failure and graceful `SIGTERM` / `SIGINT` shutdown.

Neither bootstrap file may contain route behavior, token resolution rules, YAML parsing rules, or latest-state mutation
logic.

### HTTP application

`createApp(dependencies)` returns an Express application without listening on a port. It owns:

- JSON parsing and request-size configuration;
- request correlation metadata;
- module router composition;
- not-found behavior;
- public error mapping and final error middleware.

Express request and response types do not cross into the GSI use case or store.

### Configuration

Configuration has separate stages:

1. obtain the two required process-level paths and load their YAML text;
2. parse each YAML document independently;
3. validate each document's schema and safe field constraints;
4. join public clients to private credentials and validate cross-document invariants;
5. map the result into an immutable digest-backed trusted-client registry.

The configuration module must not know about Compose, Kubernetes, KSOPS, or GitOps. Those systems only supply the
configured source at the process boundary.

### Match module

The initial `match` module owns:

- latest-client-state contracts and invariants;
- client-scoped latest-state replacement;
- the `RecordClientSnapshot` application use case;
- the latest-state store port;
- the in-memory latest-state implementation;
- the public API consumed by inbound integrations.

Future match lifecycle, temporal memory, coverage, and factual context belong here, but are not implemented in this
slice. The module must not depend on Express, raw GSI field names, Discord, `buy`, or `lost`.

### GSI integration

The initial `integrations/gsi` boundary owns:

- its Express router and HTTP response mapping;
- `auth.token` extraction/removal and trusted client lookup;
- minimum raw snapshot validation;
- mapping an accepted request into the public `match` command.

It does not own latest-state contracts or storage. Later raw-GSI normalization may remain in this integration, but the
result passed to `match` must use canonical match input vocabulary rather than Express or transport types.

### Future recommendation modules

`buy` and `lost` remain separate sibling modules when their slices begin:

- `buy` owns item candidates, curated threat/capability data, item filters, item scoring, context hash, hysteresis, and
  `BuyDecision`;
- `lost` owns macro-action candidates, temporal/readiness gates, action scoring, previous-advice hysteresis, and
  `LostDecision`.

Both may consume the public factual query surface of `match`. Neither may access GSI payloads, Discord SDK values, or
the other module's internals. A shared recommendation contract, if later justified, contains stable value types only
and no generic candidate generation, hard gates, scoring formula, sorting, hysteresis, configuration, or rendering.

### Module APIs and dependencies

Every business module exposes a `public.ts`. Consumers import that entry point rather than internal files. Dependency
direction is:

```text
integrations/gsi ──► modules/match

                     modules/match
                       ▲       ▲
                       │       │
               modules/buy   modules/lost
                       ▲       ▲
                       │       │
                  integrations/discord

bootstrap ──► composes all concrete implementations
```

The diagram describes allowed knowledge, not process boundaries. All components remain in one runtime process for MVP.

### Observability

The base logger records bounded metadata such as request ID, route, status, latency, resolved internal client ID, and
receive time. It must avoid serializing request bodies, including their transport-only `auth` field.

## HTTP Contract Baseline

| Request                                                        | Confirmed behavior              | Notes                                                                               |
| -------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /health`                                                  | `200` with `{ "status": "ok" }` | Liveness only; readiness remains deferred                                           |
| `POST /gsi` with an object missing a valid `auth.token`        | `401`                           | Same public behavior as an unknown token                                            |
| `POST /gsi` with an object containing an unknown `auth.token`  | `401`                           | Do not reveal whether a token is registered                                         |
| `POST /gsi` with a known `auth.token` and accepted object body | Empty `200 OK`                  | `auth` is removed; state is updated synchronously in memory                         |
| `POST /gsi` with a non-object, null, or array body             | `422`                           | Shape validation precedes authentication; full GSI field validation is out of scope |
| malformed JSON                                                 | `400 INVALID_JSON`              | Stable public error shape                                                           |
| body larger than `1_048_576` bytes                             | `413 PAYLOAD_TOO_LARGE`         | Limit is injected into `createApp`                                                  |
| absent or unsupported media type                               | `415 UNSUPPORTED_MEDIA_TYPE`    | Accept `application/json` with standard parameters only                             |
| unknown route                                                  | `404 NOT_FOUND`                 | Stable public error shape                                                           |
| unexpected failure                                             | `500 INTERNAL_ERROR`            | Internal details are not exposed                                                    |

The initial store update is synchronous and does not imply downstream normalization or match-memory completion. An
empty `200 OK` only confirms that the authenticated latest snapshot was accepted into process memory.

## Package and Tooling Baseline

Runtime dependencies:

- `express`
- `pino`
- `pino-http`, if request logging remains a thin configured adapter
- `yaml`
- `zod`

Development dependencies:

- `typescript`
- `tsx`
- `@types/node`
- `@types/express`
- `jest`
- `@jest/globals`
- `@swc/core`
- `@swc/jest`
- `supertest`
- `@types/supertest`
- `eslint`
- `@eslint/js`
- `typescript-eslint`
- `prettier`

Repository development dependencies remain in the root package and do not become runtime dependencies:

- `husky`
- `lint-staged`
- `prettier`

The root pre-commit hook runs lint-staged from the repository root. lint-staged formats staged code and structured
configuration files only, using the existing `apps/runtime/.prettierrc`; it does not rewrite Markdown or run the
complete runtime type-check, lint, test, or build suite. Activating Husky is an explicit local setup step and is not
performed implicitly during `npm install`.

Required repository scripts:

- `hooks:install` — explicitly activate the tracked Husky hooks in the local Git checkout
- `lint:staged` — run the staged-only Prettier tasks used by pre-commit

Install mutually compatible current releases during implementation and commit the resulting `package-lock.json`. Do not
record guessed patch versions in this plan.

Required package scripts:

- `dev` — run the TypeScript entry point in watch mode
- `build` — emit the ESM runtime to `dist/`
- `start` — execute the built ESM runtime with Node.js
- `typecheck` — run TypeScript without emit
- `lint` — run ESLint
- `format` — write formatting changes
- `format:check` — verify formatting without writes
- `test` — run Jest once
- `test:watch` — run Jest in watch mode
- `check` — compose non-mutating type, lint, format, test, and build verification

## Proposed File Layout

The exact filenames may change locally when implementation makes a clearer name obvious, but ownership boundaries must
remain stable.

```text
apps/runtime/
├── src/
│   ├── main.ts
│   ├── bootstrap/
│   │   ├── create-runtime.spec.ts
│   │   └── create-runtime.ts
│   ├── platform/
│   │   ├── config/
│   │   │   ├── config.types.ts
│   │   │   ├── configuration-error.ts
│   │   │   ├── load-runtime-config.spec.ts
│   │   │   ├── load-runtime-config.ts
│   │   │   ├── parse-client-config.spec.ts
│   │   │   ├── parse-client-config.ts
│   │   │   ├── parse-runtime-settings.spec.ts
│   │   │   └── parse-runtime-settings.ts
│   │   ├── http/
│   │   │   ├── create-app.spec.ts
│   │   │   ├── create-app.ts
│   │   │   ├── errors/
│   │   │   │   ├── error-handler.spec.ts
│   │   │   │   ├── http-error.ts
│   │   │   │   └── error-handler.ts
│   │   │   ├── health/
│   │   │   │   └── health.router.ts
│   │   │   ├── middleware/
│   │   │   │   ├── request-context.ts
│   │   │   │   └── request-logging.ts
│   │   │   └── not-found-handler.ts
│   │   ├── logging/
│   │   │   └── create-logger.ts
│   │   └── time/
│   │       └── clock.ts
│   ├── modules/
│   │   └── match/
│   │       ├── public.ts
│   │       ├── application/
│   │       │   ├── latest-state-store.ts
│   │       │   ├── record-client-snapshot.ts
│   │       │   └── record-client-snapshot.spec.ts
│   │       ├── domain/
│   │       │   └── latest-client-state.ts
│   │       └── infrastructure/
│   │           ├── in-memory-latest-state-store.ts
│   │           └── in-memory-latest-state-store.spec.ts
│   └── integrations/
│       └── gsi/
│           ├── authenticate-gsi-client.spec.ts
│           ├── authenticate-gsi-client.ts
│           ├── gsi.router.ts
│           └── middleware/
│               ├── authenticate-gsi-request.ts
│               ├── gsi-request-context.ts
│               └── parse-gsi-request.ts
├── test/
│   └── smoke-built-runtime.mjs
├── eslint.config.js
├── jest.config.js
├── package-lock.json
├── package.json
├── tsconfig.build.json
└── tsconfig.json
```

Later slices add `modules/buy`, `modules/lost`, `integrations/discord`, and `integrations/tts` as siblings. They are not
created as empty placeholders in this slice. Do not add a generic `recommendations`, `common`, `shared`, `services`, or
`utils` directory as a substitute for assigning ownership.

## Milestone Status

| Milestone                    | RED phase | GREEN phase | Status      |
| ---------------------------- | --------- | ----------- | ----------- |
| M0. Contract baseline        | —         | Phase 0     | `completed` |
| M1. ESM toolchain            | —         | Phase 1     | `completed` |
| M2. Configuration and auth   | Phase 2   | Phase 3     | `completed` |
| M3. HTTP ingest vertical     | Phase 4   | Phase 5     | `completed` |
| M4. Container runtime        | —         | Phase 6     | `completed` |
| M5. Verification and handoff | —         | Phase 7     | `completed` |

## Phase 0 — Contract Baseline

Status: `completed`

Completed:

- Confirmed one process and one runtime container for MVP.
- Confirmed preservation of the current repository structure.
- Confirmed TypeScript ESM, Express 5, Jest specs, and modular-monolith boundaries.
- Confirmed Jest transformation strategy and a real ESM build smoke test.
- Confirmed the first health and GSI ingest vertical.
- Confirmed native GSI payload authentication through `auth.token` and the main `200`, `401`, and `422` responses.
- Confirmed YAML as the trusted client configuration format.
- Confirmed `modules`, `integrations`, `platform`, and `bootstrap` source categories.
- Confirmed `match` owns latest state and GSI remains an inbound integration.
- Confirmed independent sibling boundaries for future `buy` and `lost` modules.
- Confirmed public module entry points, dependency direction, and the prohibition on cross-module deep imports.
- Confirmed that no generic scoring pipeline is extracted before both engines prove stable shared semantics.
- Recorded local secret delivery and production Kubernetes configuration as deferred rather than assumed.

Exit criteria:

- No unresolved decision blocks Phase 1 toolchain work.
- Decisions deferred to later phases are named explicitly.

## Phase 1 — Toolchain and ESM Foundation

Status: `completed`

Target end state: `green`

Completed:

- Converted the runtime package from CommonJS to a private Node.js 24 ESM application.
- Installed the approved runtime and development dependency baseline with a committed npm lock file.
- Kept Node.js types on major 24 and selected the latest TypeScript release compatible with the current
  `typescript-eslint` peer contract.
- Added strict `NodeNext` type checking and a separate ESM build configuration.
- Added Jest with SWC's internal CommonJS transform and `.js`-extension mapping for TypeScript source imports.
- Added typed ESLint flat configuration, Prettier checks, and enforceable module/integration import restrictions.
- Added repository-level Husky and lint-staged configuration for staged-only Prettier formatting; local hook activation
  remains an explicit developer setup step.
- Added the required npm scripts and a minimal ESM entry-point resolution spec without introducing runtime behavior.
- Verified Node.js `v24.18.0`, one passing Jest suite/test, full `npm run check`, direct built ESM startup, local `tsx`
  execution, and `npm audit` with zero reported vulnerabilities.

Implement:

- Update runtime package metadata for a private ESM application.
- Add runtime and development dependencies from the approved baseline.
- Generate and commit the npm lock file.
- Add strict TypeScript configuration for Node.js ESM and a separate build configuration.
- Add Jest with `@swc/jest`, explicit `@jest/globals` imports, and `*.spec.ts` discovery.
- Add ESLint flat configuration and keep Prettier as a separate formatting concern.
- Encode the agreed source-category and cross-module import boundaries where ESLint can enforce them without depending
  on nonexistent future modules.
- Add the required npm scripts.
- Add a minimal compile-and-test fixture proving TypeScript, Jest, and ESM build output work together.
- Ensure generated `dist/` and test coverage output remain ignored.

Verification:

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run format:check`
- `npm run build`
- execute a minimal built ESM module with Node.js

Exit criteria:

- The TypeScript source compiles to ESM.
- Jest executes TypeScript specs through SWC.
- Type errors fail `typecheck` independently of Jest transformation.
- No runtime route, client configuration, or GSI behavior is implemented yet.

## Phase 2 — Configuration and Authentication RED

Status: `completed`

Target end state: `red-expected`

Completed:

- Fixed the versioned public/private YAML contract, privacy split, startup-only loading, join invariants, and one-token
  MVP policy without adding Kubernetes vocabulary to runtime source.
- Added tracked local public configuration and private example files plus a narrow ignore rule for local credentials.
- Added immutable trusted-client boundary types and a safe configuration-error representation.
- Added compile-safe seams for two-file source loading, configuration parsing/registry construction, and GSI client
  authentication.
- Added intent-driven RED specs covering source loading, safe immutable identity resolution, syntax and semantic
  failures, cross-document joins, uniqueness, and indistinguishable missing/unknown authentication.
- Verified type checking, ESLint, Prettier, and the ESM build remain green; the Phase 1 regression spec remains green;
  20 new Phase 2 assertions fail on the three intentionally unimplemented Phase 3 seams.

Resolved before starting:

- `CLIENT_CONFIG_PATH` and `CLIENT_CREDENTIALS_PATH` identify separate public and private YAML sources;
- public clients contain stable neutral `client_id` mapping keys and `default_role`;
- private credentials contain `gsi_token`, Discord user ID, and coach alias under the corresponding `client_id`;
- GSI tokens are YAML values, so duplicate token values are explicitly rejected after parsing;
- startup-only loading, one active token per client, and digest-backed long-lived lookup are fixed for this slice;
- local public values and private example files are tracked, while local plaintext credentials are ignored;
- Kubernetes, Argo CD, KSOPS, SOPS age, and production repository implementation remain outside this app-repo phase.

Add RED specs for:

- valid public and private YAML documents join into immutable trusted client identities;
- invalid YAML syntax fails with a configuration error that does not expose file contents;
- missing clients, mismatched document versions, invalid client entries, invalid roles, empty tokens, incomplete joins,
  duplicate Discord identities, and duplicate token values fail startup validation;
- a missing or unknown GSI auth token produces the same authentication result;
- token lookup does not return or log the original credential;
- configuration output cannot be mutated through a caller-owned input reference.

Add compile-safe seams for:

- two-file YAML text loading at the process boundary;
- independent public/private YAML parsing;
- Zod-backed semantic validation;
- cross-document joining and digest-backed trusted client lookup;
- safe configuration-error representation.

Exit criteria:

- New specs compile and fail only on missing configuration/authentication behavior.
- No Express route or Compose/Kubernetes-specific source implementation is added.

## Phase 3 — Configuration and Authentication GREEN

Status: `completed`

Completed:

- Implemented sequential process-boundary loading of the public and private YAML sources with safe source-specific
  failures that do not expose paths or underlying filesystem details.
- Separated YAML syntax parsing from strict Zod validation for both versioned documents.
- Enforced neutral client IDs, roles `1..5`, Base64URL-compatible 32–128 character GSI tokens, Discord snowflake
  strings, trimmed coach aliases, strict fields, non-empty documents, exact joins, and uniqueness constraints.
- Joined the documents into frozen trusted identities and a frozen registry that retains SHA-256 token digests rather
  than plaintext credentials.
- Implemented constant public authentication behavior for missing and unknown GSI tokens without exposing credential
  details.
- Verified type checking, ESLint, 21 passing Jest assertions, and safe configuration errors.

Implement:

- Separate YAML syntax parsing from semantic validation.
- Map validated YAML into immutable runtime configuration.
- Implement constant-contract GSI token lookup without exposing registered-token details.
- Return safe startup errors that identify the configuration stage but not secrets, paths, or file content; bootstrap
  logging remains part of Phase 6 composition.
- Compose the approved local process-boundary YAML source without introducing Kubernetes vocabulary into application
  modules.

Exit criteria:

- Phase 2 specs pass.
- Invalid trusted configuration fails registry construction; Phase 6 bootstrap wiring must preserve this before-bind
  ordering.
- Tokens are not present in logs, thrown public messages, or inspectable latest-state values.
- Production secret delivery remains deferred.

## Phase 4 — HTTP Health and GSI Ingest RED

Status: `completed`

Target end state: `red-expected`

Completed:

- Fixed the health, public error, media-type, one-MiB body-limit, correlation-header, and validation-precedence
  contracts before writing HTTP specs.
- Added `match` domain, application port/use-case, in-memory adapter, and public API seams without importing Express or
  GSI transport vocabulary into the module.
- Added the middleware-oriented application composition in the target order: request context, bounded request logging,
  JSON parsing, health and GSI routers, not-found handling, and final error mapping.
- Added intent-driven store and use-case specs for replacement, client isolation, injected receive time, resolved
  identity, and immutable snapshot ownership.
- Added Supertest specs for health, correlation, GSI authentication and auth stripping, validation precedence, every
  fixed error mapping, request-size enforcement, route fallback, and safe logging.
- Verified type checking, ESLint, Prettier, and the ESM build remain green. The 21 Phase 1–3 assertions remain green;
  22 Phase 4 assertions fail on the intentional Phase 5 seams.

Resolved before starting:

- `GET /health` returns `200` with `{ "status": "ok" }`;
- malformed JSON returns `400 INVALID_JSON`; absent or unsupported media type returns `415 UNSUPPORTED_MEDIA_TYPE`;
- the initial request body limit is `1_048_576` bytes and is injected into `createApp`;
- non-success responses use `{ "error": { "code": "<CODE>" }`, while `X-Request-Id` carries correlation.

Add RED unit specs for:

- `match` latest-state replacement for repeated snapshots from the same client;
- independent `match` latest state for different clients;
- server receive time supplied to `match` through an injected clock;
- stored snapshot/reference behavior does not allow accidental caller mutation;
- the `RecordClientSnapshot` use case stores resolved identity and accepted snapshot metadata;
- the GSI integration maps an authenticated request to the public `match` command without exposing Express types.

Add RED HTTP specs with Supertest for:

- health success contract;
- authenticated object snapshot returns an empty `200 OK`;
- object bodies with missing, malformed, or unknown `auth.token` values return `401` without distinguishable detail;
- null, array, and primitive JSON bodies return `422` before authentication;
- `auth` is removed before an accepted snapshot is passed to `match` or stored;
- malformed JSON and unsupported media type follow the approved contract;
- request-size rejection follows the approved contract;
- route errors pass through one final JSON error mapper;
- GSI auth tokens and request bodies are absent from captured logs.

Add compile-safe seams for:

- `Clock` or equivalent receive-time dependency;
- `match` latest-client-state and store contracts;
- `match` in-memory store and `RecordClientSnapshot` use case;
- `match/public.ts` as the only GSI-to-match import surface;
- platform health router and GSI integration router;
- application factory and error middleware.

Exit criteria:

- New specs compile and fail only on missing HTTP, ingest, or store behavior.
- Specs construct the application without listening on a network port.
- The GSI integration does not own or implement latest-state storage.
- No match lifecycle/memory, Discord, TTS, `buy`, or `lost` behavior is introduced.

## Phase 5 — HTTP Health and GSI Ingest GREEN

Status: `completed`

Completed:

- Implemented the in-memory latest-state adapter with client-scoped replacement, owned `structuredClone` snapshots,
  recursive freezing, and immutable lookup results.
- Implemented `RecordClientSnapshot` with an injected clock and ISO receive timestamps, independently of Express and
  GSI transport types.
- Implemented server-owned request correlation, `X-Request-Id`, bounded completion logs, and safe resolved-client
  metadata without request headers or bodies.
- Implemented the liveness router and a composed GSI pipeline with integration-owned parsing and authentication
  middleware, a thin dispatch handler, `auth` removal, and synchronous dispatch through `modules/match/public.ts`.
- Scoped the permissive JSON value parser and one-MiB limit to `/gsi`; accepted `application/json` with standard
  parameters and rejected missing, non-JSON, and vendor JSON media types.
- Implemented stable not-found, expected-error, JSON syntax, payload-size, and unexpected-error response mapping without
  leaking internal details.
- Verified all 8 suites and 47 assertions pass together with TypeScript, ESLint, Prettier, and the ESM build.

Implement:

1. Build the `match` in-memory latest-state store with client-scoped replacement semantics.
2. Implement `RecordClientSnapshot` independently of Express and raw GSI types.
3. Expose the required command and types through `match/public.ts` only.
4. Implement `auth.token` extraction/removal and client resolution at the GSI integration boundary.
5. Validate only the approved minimum raw snapshot shape and map it to the `match` command.
6. Add the platform health router and GSI integration router.
7. Add request correlation, bounded request logging, not-found handling, and final error mapping under `platform/http`.
8. Build the Express app through `createApp(dependencies)`.
9. Ensure successful ingest logging contains safe metadata only.

Exit criteria:

- Phase 4 specs pass.
- A successful request synchronously updates the correct client's latest in-memory state.
- Rejected requests do not mutate state.
- Express types remain at the transport boundary.
- GSI imports `match` through `public.ts`; `match` contains no Express or raw GSI vocabulary.
- Raw snapshots and credentials are absent from logs.

## Phase 6 — Runtime and Container Integration

Status: `completed`

Target end state: `green`

Implemented:

- Added fail-fast Zod validation for required configuration paths and approved host, port, and log-level defaults.
- Composed the immutable trusted-client registry, logger, clock, request IDs, `match` store/use case, Express app, and
  Node.js HTTP server in `bootstrap/create-runtime.ts`.
- Added a minimal process entry point with safe terminal startup logging and idempotent native `SIGTERM` / `SIGINT`
  shutdown initiation.
- Added real-server Jest coverage for health, authenticated GSI ingest, invalid startup configuration, and listener
  shutdown.
- Added a built-ESM process smoke that verifies startup, health, authenticated ingest, clean `SIGTERM`, and exit code
  `1` for invalid process configuration.
- Split the Dockerfile into dependency, development, build, and non-root runtime targets. Wired local Compose to the
  development target, source and dependency volumes, public/private read-only YAML mounts, port publishing, and health.
- Verified the Compose document parses, and `npm run check` passes with 9 suites and 56 Jest assertions plus the built
  process smoke. Docker image build, Compose startup, container health, authenticated ingest, and bind-mount code reload
  were subsequently verified in the developer's local Docker environment.

Implement:

- Compose validated config, logger, clock, the `match` store/use case, the GSI integration, and the Express app in
  `bootstrap/create-runtime.ts`.
- Keep `main.ts` limited to starting the composed runtime and reporting terminal startup failure.
- Fail startup before listening when required runtime configuration is invalid.
- Bind the server on the configured host and port.
- Handle `SIGTERM` and `SIGINT` through native HTTP server close behavior without custom request tracking or forced
  socket destruction.
- Update the runtime Dockerfile to install locked dependencies, build ESM, and execute the built entry point.
- Update the development Compose service for the approved local development command, port, healthcheck, and YAML source
  wiring.
- Keep local Compose conventions separate from future production manifests.

Add integration/smoke coverage for:

- built ESM startup under Node.js;
- health response from the running process;
- one authenticated GSI ingest using a non-secret fixture configuration;
- clean process termination;
- startup failure for invalid configuration.

Exit criteria:

- `docker compose` can build and start the local runtime using the approved local configuration convention.
- Container health becomes healthy only after the HTTP server is listening.
- The running built ESM process accepts the vertical slice end to end.
- Graceful shutdown does not leave the server accepting new requests.
- No Kubernetes or production secret artifacts are added.

## Phase 7 — Verification and Handoff

Status: `completed`

Completed:

- Verified clean dependency installation from the committed lock file, type checking, the complete Jest suite, ESLint,
  Prettier, the TypeScript ESM build, the built-runtime smoke, and `git diff --check`.
- Verified the development Docker image builds and the Compose runtime reaches healthy state with the approved public
  and private local configuration mounts.
- Verified authenticated GSI ingest through the running container and automatic `tsx` restart for source changes on the
  bind mount.
- Confirmed no focused or intentional RED specs, production stubs, credential/raw-snapshot leaks, boundary violations,
  speculative shared ownership buckets, or deferred-scope implementations remain in the base vertical.
- Confirmed all Phase 6 and Phase 7 exit criteria are met and no external verification remains pending.

Run:

- clean npm install from the committed lock file;
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
- no compile-safe stub remains on a production path;
- no GSI auth token or raw GSI snapshot appears in logs or error responses;
- no Express request/response object crosses from `integrations/gsi` into `modules/match`;
- `integrations/gsi` imports `modules/match` only through `public.ts`;
- `modules/match` does not import Express, raw GSI transport types, Discord, `buy`, or `lost`;
- no generic `recommendations`, `common`, `shared`, `services`, or `utils` ownership bucket was introduced;
- no frontend, Discord, TTS, LLM, persistence, or Kubernetes scope leaked into the slice;
- deferred decisions remain documented and are not implemented through accidental defaults;
- the MVP specification links and fixed decisions remain accurate.

Exit criteria:

- All repository-local verification commands pass.
- The containerized vertical works end to end with a safe development fixture.
- Milestones M1–M5 and Phases 1–7 are marked `completed`.
- The document records any unavailable external verification explicitly.
- The implementation is ready for review as the foundation for `MatchMemory` and independent `buy`, `lost`, and
  Discord verticals.

## Acceptance Matrix

| Capability           | Required evidence                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| ESM runtime          | `tsc` output starts through Node.js without a TypeScript loader                                        |
| Type safety          | `tsc --noEmit` passes independently of Jest                                                            |
| Spec runner          | Jest executes `*.spec.ts` through SWC                                                                  |
| Health               | Approved `GET /health` contract passes at app and running-process levels                               |
| Authentication       | Object payloads with missing and unknown GSI credentials produce the same `401` contract               |
| Ingest               | Valid authenticated object produces an empty `200 OK`, strips `auth`, and replaces client latest state |
| Validation           | Invalid top-level snapshot shapes produce `422` without state mutation                                 |
| Isolation            | Different clients retain independent latest states                                                     |
| State ownership      | Latest-state contracts and storage belong to `modules/match`, not `integrations/gsi`                   |
| Integration boundary | GSI maps HTTP/raw input to the public `match` command without leaking transport types                  |
| Module API           | Cross-module imports use `public.ts`; no deep import is required by the vertical                       |
| Future features      | `buy` and `lost` remain independent sibling boundaries with no shared scoring implementation           |
| Logging              | Correlation and bounded metadata are present; credentials and raw bodies are absent                    |
| Startup              | Invalid required config prevents port binding                                                          |
| Shutdown             | `SIGTERM` / `SIGINT` closes the HTTP server cleanly                                                    |
| Container            | Docker build and local Compose smoke path succeed                                                      |
| Scope                | No deferred subsystem or production deployment design is introduced                                    |

## Status Update Rule

When implementation starts or a phase completes:

1. Change the plan status from `draft` to `approved` before Phase 1 begins.
2. Update the current implementation phase.
3. Update the phase status and its milestone status together.
4. Record blockers in the affected phase instead of weakening fixed decisions.
5. Resolve deferred contract decisions before writing the RED specs that encode them.
6. Do not mark a RED phase `completed` unless its new specs fail for the intended missing behavior.
7. Do not mark a GREEN phase `completed` unless its paired RED specs pass.
8. Record verification commands and results in the completed phase.
9. Do not mark Phase 7 complete while an intentional RED spec, production stub, secret leak, or scope violation remains.
