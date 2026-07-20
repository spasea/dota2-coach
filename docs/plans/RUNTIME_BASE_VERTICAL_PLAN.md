# Runtime Base Vertical Implementation Plan

## Status

- Plan status: `draft`
- Issue: not assigned
- Current implementation phase: `Phase 1 — Toolchain and ESM foundation (not started)`
- Last updated: `2026-07-20`

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
9. npm remains local to `apps/runtime`; a root JavaScript workspace is deferred until another JavaScript application
   creates a concrete need for it.
10. Jest is the spec runner. `@swc/jest` transforms TypeScript for Jest, while `tsc --noEmit` remains the authoritative
    type check.
11. Jest may execute transformed tests as CommonJS internally. The built runtime and its smoke test must execute the
    emitted ESM with Node.js.
12. Specs use the `*.spec.ts` naming convention and import Jest APIs explicitly from `@jest/globals`.
13. The first vertical slice contains runtime bootstrap, typed configuration, structured logging, graceful shutdown,
    `GET /health`, authenticated `POST /gsi`, and an in-memory latest-client-state store.
14. `POST /gsi` authenticates clients with a bearer token resolved against trusted YAML client configuration.
15. A successful GSI ingest returns `204 No Content`; a missing or unknown bearer token returns `401`; a syntactically
    valid JSON value that is not an accepted snapshot object returns `422`.
16. Initial snapshot validation is deliberately shallow: the request body must be a non-null JSON object and not an
    array. The slice does not invent a complete GSI schema before fields are consumed.
17. The latest state stores the resolved client identity, server receive time, and in-memory snapshot. It does not
    persist raw snapshots.
18. Bearer tokens and raw GSI snapshots must not be emitted to application or request logs.
19. Application construction and network listening are separate. Tests build the Express application through a
    dependency-injected factory without binding a real port.
20. Zod validates process-level configuration and parsed YAML configuration. YAML parsing and semantic validation are
    separate responsibilities.
21. Pino provides structured JSON logging. Human-readable local output may be enabled outside the core runtime without
    changing log event contracts.
22. TypeScript path aliases are excluded from the base slice. Relative imports avoid extra runtime and Jest resolvers.
23. Module directories stay shallow until additional use cases create a real need for internal
    `domain/application/infrastructure` sublayers.
24. Local development runs through Docker Compose. Production Kubernetes, KSOPS, Kustomize, GitOps, custom resources,
    rollout, and secret-delivery design are not part of this plan.
25. This plan is documentation-only. Implementation begins only after the plan status changes to `approved`.

## Deferred Decisions

The following decisions are intentionally not guessed in this slice:

1. Repository location and naming for example or real client YAML files.
2. The exact mechanism that supplies the YAML path or content to the local Compose container.
3. Production YAML/secret generation, encryption, mounting, rotation, and reconciliation through Kubernetes tooling.
4. The exact `GET /health` response payload beyond a successful JSON health response.
5. The response code and public error shape for malformed JSON and unsupported media types.
6. The default and maximum accepted GSI request-body size.
7. A future readiness probe distinct from the initial liveness-style health endpoint.
8. The full normalized GSI snapshot contract and which Dota fields become mandatory for later match processing.
9. Freshness thresholds, match grouping, same-team validation, and timeline-source policy.
10. Public frontend APIs and API versioning.
11. Discord, TTS, recommendation-engine, and Python LLM transport contracts.

Deferred decisions must be resolved before the phase that requires them. They must not be hidden inside route handlers,
environment defaults, Compose wiring, or Kubernetes assumptions.

## Scope Exclusions

- Discord bot startup, interactions, role buttons, text delivery, and voice delivery
- TTS provider selection, audio queue, watchdog, and deadlines
- `MatchMemory`, match lifecycle, sticky timeline source, freshness policy, and multi-client context building
- Snapshot normalization beyond the minimum ingest boundary
- `I'm lost` and `Buy` recommendation engines
- Curated hero, item, threat, or capability data
- Database, durable state, raw snapshot archive, and restart recovery
- Frontend endpoints, browser concerns, CORS policy, and shared frontend contracts
- Python runtime, LLM prompts, HTTP/gRPC client, retries, and circuit breaking
- Kubernetes resources, Kustomize overlays, KSOPS files, GitOps reconciliation, and production rollout
- Root npm workspace, monorepo task runner, and speculative shared packages
- Authentication, authorization, onboarding, or multi-tenancy beyond static trusted GSI client tokens
- CI provider configuration and repository branch/release policy

## Target Vertical

```text
YAML client config
        │
        ▼
validated runtime config ───────────────┐
                                       │
GET /health ───────────────────────────►│ Express application
                                       │
POST /gsi + Bearer token ──────────────►│
        │                              │
        ▼                              │
trusted client identity                │
        │                              │
        ▼                              │
minimal snapshot validation            │
        │                              │
        ▼                              │
InMemoryLatestStateStore ◄─────────────┘
        │
        ▼
structured metadata log, never raw snapshot/token
```

The vertical is complete when the runtime starts in the development container, reports health, accepts an authenticated
snapshot, rejects unauthenticated or invalid input according to the fixed contract, stores the latest in-memory state,
logs safe metadata, and stops cleanly.

## Architectural Boundaries

### Composition root

`main.ts` is the process entry point. It may:

- load process-level settings;
- load and validate trusted client configuration through an injected source;
- create the logger, clock, store, use case, and Express application;
- bind the HTTP server;
- handle startup failure and graceful `SIGTERM` / `SIGINT` shutdown.

`main.ts` must not contain route behavior, token resolution rules, YAML parsing rules, or latest-state mutation logic.

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

1. obtain process-level values and a YAML source;
2. parse YAML syntax;
3. validate the trusted client mapping;
4. map it into immutable runtime configuration.

The configuration module must not know about Compose, Kubernetes, KSOPS, or GitOps. Those systems only supply the
configured source at the process boundary.

### GSI module

The initial GSI module owns:

- bearer-token extraction and trusted client lookup;
- minimum snapshot validation;
- ingest use-case orchestration;
- latest-client-state contracts;
- the in-memory latest-state implementation;
- its HTTP router and transport mapping.

It does not own Discord identity behavior beyond retaining configured identity metadata, and it does not infer match,
team, role, or recommendation state.

### Observability

The base logger records bounded metadata such as request ID, route, status, latency, resolved internal client ID, and
receive time. It must redact authorization headers and avoid serializing request bodies.

## HTTP Contract Baseline

| Request | Confirmed behavior | Notes |
| --- | --- | --- |
| `GET /health` | Success response with JSON content | Exact payload is deferred before HTTP RED specs |
| `POST /gsi` without bearer token | `401` | Same public behavior as an unknown token |
| `POST /gsi` with unknown bearer token | `401` | Do not reveal whether a token is registered |
| `POST /gsi` with a valid token and accepted object body | `204` with no response body | State is updated synchronously in memory |
| `POST /gsi` with a valid token and non-object, null, or array body | `422` | Full GSI field validation is out of scope |
| malformed JSON | Deferred | Must be fixed before Phase 4 |
| unsupported media type | Deferred | Must be fixed before Phase 4 |

The initial store update is synchronous and does not imply downstream normalization or match-memory completion. A `204`
only confirms that the authenticated latest snapshot was accepted into process memory.

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
- `typescript-eslint`
- `prettier`

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
│   ├── app.ts
│   ├── config/
│   │   ├── config.types.ts
│   │   ├── load-runtime-config.ts
│   │   └── parse-client-config.ts
│   ├── http/
│   │   ├── http-error.ts
│   │   ├── error-handler.ts
│   │   └── request-context.ts
│   ├── logging/
│   │   └── create-logger.ts
│   └── modules/
│       ├── health/
│       │   ├── health.router.ts
│       │   └── health.router.spec.ts
│       └── gsi/
│           ├── gsi.router.ts
│           ├── gsi.router.spec.ts
│           ├── ingest-gsi-snapshot.ts
│           ├── ingest-gsi-snapshot.spec.ts
│           ├── latest-client-state.ts
│           ├── latest-state-store.ts
│           ├── in-memory-latest-state-store.ts
│           └── in-memory-latest-state-store.spec.ts
├── test/
│   └── fixtures/
├── eslint.config.js
├── jest.config.js
├── package-lock.json
├── package.json
├── tsconfig.build.json
└── tsconfig.json
```

Avoid empty future-facing directories for Discord, TTS, recommendations, LLM, persistence, or frontend contracts.

## Milestone Status

| Milestone | RED phase | GREEN phase | Status |
| --- | --- | --- | --- |
| M0. Contract baseline | — | Phase 0 | `completed` |
| M1. ESM toolchain | — | Phase 1 | `not-started` |
| M2. Configuration and auth | Phase 2 | Phase 3 | `not-started` |
| M3. HTTP ingest vertical | Phase 4 | Phase 5 | `not-started` |
| M4. Container runtime | — | Phase 6 | `not-started` |
| M5. Verification and handoff | — | Phase 7 | `not-started` |

## Phase 0 — Contract Baseline

Status: `completed`

Completed:

- Confirmed one process and one runtime container for MVP.
- Confirmed preservation of the current repository structure.
- Confirmed TypeScript ESM, Express 5, Jest specs, and modular-monolith boundaries.
- Confirmed Jest transformation strategy and a real ESM build smoke test.
- Confirmed the first health and GSI ingest vertical.
- Confirmed bearer-token authentication and the main `204`, `401`, and `422` responses.
- Confirmed YAML as the trusted client configuration format.
- Recorded local secret delivery and production Kubernetes configuration as deferred rather than assumed.

Exit criteria:

- No unresolved decision blocks Phase 1 toolchain work.
- Decisions deferred to later phases are named explicitly.

## Phase 1 — Toolchain and ESM Foundation

Status: `not-started`

Target end state: `green`

Implement:

- Update runtime package metadata for a private ESM application.
- Add runtime and development dependencies from the approved baseline.
- Generate and commit the npm lock file.
- Add strict TypeScript configuration for Node.js ESM and a separate build configuration.
- Add Jest with `@swc/jest`, explicit `@jest/globals` imports, and `*.spec.ts` discovery.
- Add ESLint flat configuration and keep Prettier as a separate formatting concern.
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

Status: `not-started`

Target end state: `red-expected`

Resolve before starting:

- the process-boundary input used to identify the YAML source for local runtime execution;
- the minimum client entry fields required in this slice;
- whether duplicate bearer tokens are structurally impossible or explicitly rejected after YAML parsing.

Add RED specs for:

- valid YAML client configuration maps tokens to immutable trusted client identities;
- invalid YAML syntax fails with a configuration error that does not expose file contents;
- missing clients, invalid client entries, invalid roles, and empty tokens fail startup validation;
- a missing or unknown bearer token produces the same authentication result;
- token lookup does not return or log the original credential;
- configuration output cannot be mutated through a caller-owned input reference.

Add compile-safe seams for:

- YAML text loading at the process boundary;
- YAML parsing;
- Zod-backed semantic validation;
- trusted client lookup;
- safe configuration-error representation.

Exit criteria:

- New specs compile and fail only on missing configuration/authentication behavior.
- No Express route or Compose/Kubernetes-specific source implementation is added.

## Phase 3 — Configuration and Authentication GREEN

Status: `not-started`

Implement:

- Separate YAML syntax parsing from semantic validation.
- Map validated YAML into immutable runtime configuration.
- Implement constant-contract bearer lookup without exposing registered-token details.
- Emit safe startup diagnostics that identify the configuration stage but not secrets or file content.
- Compose the approved local process-boundary YAML source without introducing Kubernetes vocabulary into application
  modules.

Exit criteria:

- Phase 2 specs pass.
- Invalid trusted configuration fails before the HTTP server binds a port.
- Tokens are not present in logs, thrown public messages, or inspectable latest-state values.
- Production secret delivery remains deferred.

## Phase 4 — HTTP Health and GSI Ingest RED

Status: `not-started`

Target end state: `red-expected`

Resolve before starting:

- exact `GET /health` response payload;
- malformed JSON and unsupported media-type responses;
- initial request-body size limit and its configuration boundary;
- stable public JSON error shape for non-`204` responses.

Add RED unit specs for:

- latest-state replacement for repeated snapshots from the same client;
- independent latest state for different clients;
- server receive time supplied through an injected clock;
- stored snapshot/reference behavior does not allow accidental caller mutation;
- ingest use case stores resolved identity and accepted snapshot metadata.

Add RED HTTP specs with Supertest for:

- health success contract;
- authenticated object snapshot returns `204` and no body;
- missing and unknown bearer tokens return `401` without distinguishable detail;
- null, array, and primitive JSON bodies return `422`;
- malformed JSON and unsupported media type follow the approved contract;
- request-size rejection follows the approved contract;
- route errors pass through one final JSON error mapper;
- authorization headers and request bodies are absent from captured logs.

Add compile-safe seams for:

- `Clock` or equivalent receive-time dependency;
- latest-client-state and store contracts;
- in-memory store;
- ingest use case;
- health and GSI routers;
- application factory and error middleware.

Exit criteria:

- New specs compile and fail only on missing HTTP, ingest, or store behavior.
- Specs construct the application without listening on a network port.
- No match, Discord, TTS, or recommendation behavior is introduced.

## Phase 5 — HTTP Health and GSI Ingest GREEN

Status: `not-started`

Implement:

1. Build the in-memory latest-state store with client-scoped replacement semantics.
2. Implement the ingest use case independently of Express types.
3. Implement bearer extraction and client resolution at the GSI HTTP boundary.
4. Validate only the approved minimum snapshot shape.
5. Add health and GSI routers.
6. Add request correlation, bounded request logging, not-found handling, and final error mapping.
7. Build the Express app through `createApp(dependencies)`.
8. Ensure successful ingest logging contains safe metadata only.

Exit criteria:

- Phase 4 specs pass.
- A successful request synchronously updates the correct client's latest in-memory state.
- Rejected requests do not mutate state.
- Express types remain at the transport boundary.
- Raw snapshots and credentials are absent from logs.

## Phase 6 — Runtime and Container Integration

Status: `not-started`

Target end state: `green`

Implement:

- Compose validated config, logger, clock, store, ingest use case, and Express app in `main.ts`.
- Fail startup before listening when required runtime configuration is invalid.
- Bind the server on the configured host and port.
- Handle `SIGTERM` and `SIGINT` with bounded graceful HTTP shutdown.
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

Status: `not-started`

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
- no bearer token or raw GSI snapshot appears in logs or error responses;
- no Express request/response object crosses into the ingest use case or store;
- no frontend, Discord, TTS, LLM, persistence, or Kubernetes scope leaked into the slice;
- deferred decisions remain documented and are not implemented through accidental defaults;
- the MVP specification links and fixed decisions remain accurate.

Exit criteria:

- All repository-local verification commands pass.
- The containerized vertical works end to end with a safe development fixture.
- Milestones M1–M5 and Phases 1–7 are marked `completed`.
- The document records any unavailable external verification explicitly.
- The implementation is ready for review as the foundation for `MatchMemory` and Discord verticals.

## Acceptance Matrix

| Capability | Required evidence |
| --- | --- |
| ESM runtime | `tsc` output starts through Node.js without a TypeScript loader |
| Type safety | `tsc --noEmit` passes independently of Jest |
| Spec runner | Jest executes `*.spec.ts` through SWC |
| Health | Approved `GET /health` contract passes at app and running-process levels |
| Authentication | Missing and unknown bearer credentials produce the same `401` contract |
| Ingest | Valid authenticated object produces `204` and replaces client latest state |
| Validation | Invalid top-level snapshot shapes produce `422` without state mutation |
| Isolation | Different clients retain independent latest states |
| Logging | Correlation and bounded metadata are present; credentials and raw bodies are absent |
| Startup | Invalid required config prevents port binding |
| Shutdown | `SIGTERM` / `SIGINT` closes the HTTP server cleanly |
| Container | Docker build and local Compose smoke path succeed |
| Scope | No deferred subsystem or production deployment design is introduced |

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
