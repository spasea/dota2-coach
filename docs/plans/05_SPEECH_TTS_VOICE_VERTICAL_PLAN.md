# Speech TTS and Discord Voice Vertical Implementation Plan

## Status

- Plan status: `approved`
- Issue: not assigned
- Current implementation phase: `Phase 4 — Silero Service and TTS Client GREEN (completed)`
- Last updated: `2026-07-23`

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
- [Completed match context vertical](./02_MATCH_CONTEXT_VERTICAL_PLAN.md)
- [Completed Lost recommendation vertical](./03_LOST_RECOMMENDATION_VERTICAL_PLAN.md)
- [Completed Discord interaction vertical](./04_DISCORD_INTERACTION_VERTICAL_PLAN.md)
- [Current Lost public API](../../apps/runtime/src/modules/lost/public.ts)
- [Current Lost recommendation contract](../../apps/runtime/src/modules/lost/domain/recommendation.ts)
- [Current Discord interaction orchestration](../../apps/runtime/src/integrations/discord/application/handle-discord-button.ts)
- [Current Discord Gateway adapter](../../apps/runtime/src/integrations/discord/infrastructure/discord-gateway-adapter.ts)
- [Current HTTP composition](../../apps/runtime/src/platform/http/create-app.ts)
- [Current serving composition](../../apps/runtime/src/bootstrap/create-serving-runtime.ts)
- [Current runtime lifecycle](../../apps/runtime/src/bootstrap/runtime-lifecycle.ts)
- [Current development Compose stack](../../ops/dev/docker-compose.yml)
- [Silero models repository](https://github.com/snakers4/silero-models)
- [Silero main model license](https://github.com/snakers4/silero-models/blob/master/LICENSE)
- [Discord voice package](https://discord.js.org/docs/packages/voice/stable)
- [Discord voice connection guide](https://discordjs.guide/voice/voice-connections)
- [PyTorch supported platforms](https://github.com/pytorch/pytorch/blob/main/RELEASE.md)

## Starting Point

The completed verticals already provide:

- one Node.js/TypeScript ESM runtime container with authenticated tolerant GSI ingest;
- immutable requester-scoped Match context for one to five trusted same-match clients;
- deterministic Lost scoring, stability, Russian text rendering, and a short individual `voiceText`;
- a versioned Discord panel with an enabled `I'm lost` button, a disabled `Buy` button, and five role buttons;
- requester resolution, match-scoped role overrides, action debounce, interaction acknowledgement, and public text
  delivery;
- one `discord.js` Gateway client that connects before HTTP bind, validates the configured panel, and owns text
  interaction delivery;
- strict public/private YAML configuration, privacy-safe structured logs, and idempotent runtime start/stop;
- local Compose development with the runtime image and no speech or media dependencies.

For an accepted Lost interaction, the current Discord application path:

1. resolves requester scope;
2. applies the match/user/action debounce;
3. acknowledges the interaction;
4. builds the Lost recommendation;
5. renders and publishes the public text mirror;
6. records text delivery;
7. completes the ephemeral interaction response.

`LostRecommendation.voiceText` already contains the deterministic short individual utterance required by the MVP.
The speech vertical must consume that value. It must not parse public Discord text or reimplement Lost rendering.

The codebase does not yet contain:

- a transport-neutral speech job contract or queue;
- a TTS client or Python service;
- a Silero model artifact, model loader, or synthesis watchdog;
- Discord voice connection or playback;
- `@discordjs/voice`, an Opus implementation, or FFmpeg;
- the required `GuildVoiceStates` Gateway intent;
- voice-channel configuration or permissions validation;
- text-only circuit breaking and asynchronous recovery;
- a protected manual speech endpoint;
- ARM64 container evidence for the intended Raspberry Pi 5 deployment target.

This plan adds those capabilities without changing Match facts, Lost scoring, public Lost text, GSI ingest, the
disabled Buy behavior, or the existing Discord panel.

## Fixed Decisions

### Vertical, ownership, and compatibility

1. This slice is the `Speech TTS and Discord Voice Vertical`.
2. The vertical adds one new internal service boundary: a Python TTS service in a separate container.
3. The existing Node runtime remains the owner of Discord, speech admission, FIFO ordering, job TTL, delivery
   deadlines, circuit state, playback, and interaction behavior.
4. The Python service owns only model loading, speaker validation, deterministic text-to-WAV synthesis, synthesis
   cancellation, and synthesis readiness.
5. The TTS service is domain-agnostic. It never imports or receives Match, Lost, Buy, Discord user, guild, channel,
   role, score, or GSI concepts.
6. The runtime speech module is transport-neutral. It imports neither `discord.js`, `@discordjs/voice`, Express,
   FFmpeg, nor Python/TTS HTTP implementation types.
7. Discord voice SDK objects stay inside `integrations/discord`.
8. TTS HTTP and audio response details stay inside `integrations/tts`.
9. Manual HTTP request/response details stay inside the runtime HTTP integration.
10. Lost remains the only recommendation source connected to speech in this vertical.
11. Buy stays disabled and is not implemented, scored, rendered, enqueued, or spoken by this vertical.
12. The speech module is source-neutral enough that a later Buy consumer can enqueue its own rendered `voiceText`
    without changing queue, TTS, Discord voice, deadline, or circuit behavior.
13. No generic recommendation or scoring framework is introduced to prepare for Buy.
14. Existing `GET /health`, `POST /gsi`, Discord panel IDs/layout, Lost text, role behavior, action debounce, and
    requester mapping remain compatible.
15. Speech is on-demand only. No timer or game event produces unsolicited coaching.

This plan supersedes only the Discord vertical's explicit `Guilds`-only intent, no-TTS, and no-extra-container
constraints. All other completed Discord contracts remain in force.

### Model, licensing, and platform

16. The rollout is strictly internal and non-commercial.
17. The selected model is Silero `v5_5_ru`.
18. The selected device is CPU.
19. The canonical output sample rate is `48_000 Hz`.
20. The recommendation speaker is `baya`.
21. The supported manual speaker allowlist is exactly:
    `aidar`, `baya`, `kseniya`, `xenia`, and `eugene`.
22. Runtime callers may select only a supported speaker. They may not select a model, model URL, artifact path,
    device, sample rate, or arbitrary provider option.
23. The Silero model artifact is pinned by official source URL/version and SHA-256 checksum. It is supplied as an
    untracked local build input and its checksum and size are verified during image construction.
24. Runtime model downloads, `torch.hub` repository execution, and first-request downloads are forbidden.
25. The model is loaded and warmed before the TTS service reports ready.
26. The TTS image carries the required Silero attribution and main model license notice. Model weights remain under
    their upstream license and are not relicensed under the repository license.
27. The TTS image is private and must not be published as a generally distributable application artifact without a
    new licensing review.
28. `linux/arm64` is the required production image architecture because the intended deployment target is a
    Raspberry Pi 5 running K3s.
29. The Python image uses a Debian/glibc base compatible with official PyTorch `aarch64` wheels.
30. The PyTorch dependency is an explicitly pinned CPU-only wheel. A default PyPI resolution that may select
    CUDA-enabled artifacts is not accepted.
31. Local `linux/amd64` support is allowed when dependency locks resolve cleanly, but it is not a rollout acceptance
    substitute for `linux/arm64`.
32. A real Raspberry Pi 5 smoke test is required before the vertical is completed. An ARM Docker build on another
    machine is necessary but insufficient performance evidence.
33. Exact PyTorch thread count and Kubernetes resource requests/limits are operational calibration values recorded
    from Raspberry Pi evidence; they are not guessed in the application contract.

### TTS service boundary

34. The development service name is `tts`; the runtime reaches it over the private Compose network.
35. The TTS container exposes port `8080` only to the container network. Compose does not publish that port to the
    host.
36. The Kubernetes-ready contract is an independent HTTP service boundary. Actual K3s manifests are deferred.
37. The TTS service provides:
    `GET /health`, `GET /ready`, and `POST /v1/speech`.
38. `/health` reports that the HTTP supervisor is alive.
39. `/ready` returns success only while a warmed inference worker is available. It returns unavailable while the
    model is loading or the inference worker is being replaced.
40. `POST /v1/speech` accepts only a bounded JSON object containing opaque `requestId`, allowed `speaker`, and
    validated `text`.
41. Successful synthesis returns raw WAV bytes with `Content-Type: audio/wav`; it never returns a container-local
    filesystem path, shared-volume path, base64 JSON field, or Discord-specific Opus payload.
42. Runtime and TTS containers share no writable media volume.
43. The runtime buffers one bounded completed WAV response before playback. It does not retain a speech cache or
    persist media.
44. The WAV contract is mono signed 16-bit PCM at `48_000 Hz`.
45. The TTS service processes at most one synthesis at a time.
46. It has no application queue. An unexpected concurrent request receives a stable busy response.
47. The runtime never retries a synthesis automatically because a partial phrase may already have been generated or
    played.
48. The TTS HTTP connection is unauthenticated in this MVP because it is private, unexposed, and carries no control
    authority outside speech synthesis. Exposing it beyond the private workload network requires a new authentication
    decision.
49. The TTS service validates again even when the runtime already validated the request.
50. TTS error bodies use bounded codes and never include Python stack traces, request text, model internals, or local
    paths.

### Python process and cancellation model

51. The Python container has one HTTP supervisor process and one long-lived inference subprocess.
52. The inference subprocess loads and warms the Silero model once, then receives bounded synthesis commands from
    the supervisor.
53. A normal job does not spawn a new Python interpreter or reload the model.
54. A coroutine timeout alone is not treated as cancellation of synchronous PyTorch inference.
55. On synthesis timeout, inference crash, malformed worker response, or supervisor cancellation, the supervisor
    terminates the inference subprocess, discards partial output, clears readiness, and starts a fresh worker.
56. No timed-out synthesis result may be returned later or reused for another job.
57. Worker replacement and model warmup happen outside the runtime interaction handler and outside the runtime
    speech queue.
58. TTS service shutdown stops accepting requests, terminates the inference subprocess, and releases model/audio
    resources.
59. Python application logs use `stdout`/`stderr`; the HTTP response channel never doubles as a logging channel.

### Speech job and FIFO behavior

60. One in-memory speech coordinator owns the runtime queue.
61. A `SpeechJob` contains opaque job/request IDs, source, speaker, text, creation/expiration timestamps, and current
    status.
62. Initial sources are `lost` and `manual`. Adding `buy` later must require only a new producer and a localized type
    extension.
63. Job status is one of:
    `queued`, `synthesizing`, `playing`, `completed`, `failed`, or `timed_out`.
64. Only the coordinator mutates internal lifecycle state. Public job values and results are immutable snapshots.
65. At most one job synthesizes or plays at a time.
66. Waiting jobs are processed FIFO.
67. Expired waiting jobs are removed before synthesis.
68. Expiration is rechecked after synthesis and before voice readiness/playback.
69. Job TTL does not replace active synthesis, readiness, or playback deadlines.
70. The initial configurable smoke defaults are:
    job TTL `20_000 ms`, TTS deadline `7_000 ms`, voice-ready deadline `3_000 ms`, playback deadline `15_000 ms`,
    circuit threshold `2`, and queue capacity `10`.
71. Queue capacity is an operational safety bound, not a delivery guarantee. It may be calibrated after live
    evidence without changing FIFO semantics.
72. A full queue rejects a manual request synchronously and skips Lost speech without affecting Lost text.
73. An expired, failed, or timed-out job is never requeued automatically.
74. Every terminal path releases its WAV buffer, abort controller, player subscription/resource, timers, and active
    job reference in `finally`.
75. One job failure never prevents the next eligible job from running.
76. Time and IDs are injected for deterministic queue specs.
77. The coordinator uses a single drain loop. Enqueueing does not create concurrent workers or one timer per waiting
    job.
78. Queue state is not persisted. Runtime restart drops active and waiting jobs.

### Lost text-first integration

79. Lost scoring and rendering remain synchronous and unchanged.
80. Lost speech consumes only `recommendation.voiceText`.
81. A Lost speech job is considered only after the public Discord text message is successfully sent.
82. Lost text delivery never awaits TTS readiness, synthesis, queue availability, voice readiness, or playback.
83. Role buttons never create speech jobs.
84. Rejected, invalid, stale, unavailable, or debounced Lost interactions never create speech jobs.
85. A failed public Lost text send never creates a speech job.
86. Lost uses `speaker: baya`.
87. Lost `voiceText` remains responsible for starting with the requester alias and for its recommendation wording.
    The speech module does not parse or prepend the alias.
88. Enqueue rejection or later voice failure does not change a successful Discord text acknowledgement into an
    interaction failure.
89. The interaction handler performs no voice connect, reconnect, synthesis, playback, or queue drain.

### Discord voice ownership

90. The existing bot account and one serving `discord.js` client are reused. No second bot or Gateway client is
    created.
91. Normal serving adds the non-privileged `GuildVoiceStates` intent alongside `Guilds`.
92. Panel provisioning remains text-only and does not join voice.
93. The configured channel must be a normal guild voice channel in the same configured guild. Stage channels,
    threads, categories, DMs, and dynamic discovery are unsupported.
94. The bot requires `ViewChannel`, `Connect`, and `Speak` in the configured voice channel.
95. The bot joins the configured voice channel during serving startup and remains connected while healthy.
96. A valid but unavailable channel, denied voice permission, unavailable TTS service, model warmup, or voice
    connection failure does not prevent HTTP/GSI/Discord text startup.
97. Invalid local YAML, malformed snowflakes, missing mandatory fields, or missing required manual credentials fail
    before network side effects.
98. One Discord voice adapter owns one voice connection, one audio player, and their subscription.
99. The initial runtime uses `@discordjs/voice`, a supported Opus implementation, and system FFmpeg.
100.  The first ARM64 implementation prefers the supported pure-JavaScript `opusscript` fallback to avoid an
      unproven native addon dependency. Replacing it with `@discordjs/opus` requires ARM64 build and performance
      evidence.
101.  FFmpeg converts the canonical WAV resource for Discord playback; the TTS service stays Discord-agnostic.
102.  Audio player `Idle` after an observed playing state completes a job.
103.  Player error, premature subscription loss, hard playback timeout, or destroyed connection fails the active job.
104.  Playback timeout stops the player and releases the queue even if Discord or FFmpeg does not finish normally.
105.  Runtime stop destroys the voice connection and player before destroying the shared Discord client.

### Manual speech endpoint and authentication

106. The runtime adds exactly one manual endpoint in this vertical:
     `POST /internal/speech-jobs`.
107. The endpoint is enabled in the tracked local configuration.
108. It is protected by a dedicated Bearer secret that is unrelated to GSI client tokens and the Discord bot token.
109. A GSI token can never authorize manual speech.
110. When manual speech is enabled, a missing credentials path/file/token is a startup configuration error.
111. Authentication occurs before JSON body parsing.
112. Token comparison is timing-safe after length validation.
113. The endpoint accepts only `speaker` and `text`. Unknown fields are rejected.
114. `speaker` must be one of the five fixed speakers.
115. `text` is trimmed, non-empty, single-line, contains no control characters, and has at most `300` Unicode code
     points.
116. The endpoint does not accept SSML, raw audio, URLs, file paths, Discord IDs, channel IDs, model IDs, device
     selection, or playback options.
117. A valid accepted request creates `source: manual`, enters the same FIFO as Lost, and returns immediately:
     `202 { jobId, status: "queued" }`.
118. `202` means only that admission succeeded. It does not promise synthesis or playback success.
119. The manual route never waits for queue position, synthesis, or playback.
120. Authentication/validation failures, full queue, stopped coordinator, and open text-only circuit are rejected
     before enqueue with stable HTTP mappings.
121. This vertical adds no job-status route. Operators correlate the returned job ID with sound and structured logs.
122. Manual jobs use the same TTL, deadlines, cleanup, circuit, and no-retry rules as Lost jobs.
123. Manual speech has no text fallback; asynchronous failure is visible only through safe logs.
124. The endpoint may be reachable through the existing runtime ingress/tunnel, so the dedicated secret remains
     mandatory even in local development.

### Configuration and secret boundary

125. Runtime speech uses a separate versioned public YAML document and a separate private credentials YAML document.
126. It is not embedded into client credentials, Discord credentials, Discord public config, or Lost policy.
127. The tracked public document owns:
     enabled state, voice channel ID, TTS base URL, recommendation speaker, queue/deadline/circuit defaults, queue
     capacity, and manual endpoint enabled/max-text settings.
128. The private document owns only the manual Bearer token.
129. Runtime process environment owns only speech config file locations:
     `SPEECH_CONFIG_PATH` and `SPEECH_CREDENTIALS_PATH`.
130. The Python service uses its own versioned public YAML document selected by `TTS_CONFIG_PATH`.
131. TTS public configuration owns:
     model ID, model artifact path, device, sample rate, synthesis timeout, and HTTP bind settings. The artifact
     checksum and size are fixed in service/build code rather than operator YAML.
132. There are no TTS service secrets in this vertical.
133. All YAML is strict: duplicate keys, unknown fields, unsupported versions, invalid URLs, invalid speaker values,
     invalid limits, malformed snowflakes, and non-finite/unsafe durations fail parsing.
134. Speech `enabled: true` requires Discord `enabled: true`.
135. Manual `enabled: true` requires speech enabled and valid credentials.
136. The tracked development configuration enables speech and manual testing.
137. Real local credentials stay in an ignored file. Only a credentials example is tracked.
138. Production secrets remain an external GitOps/SOPS concern; this repository documents the expected file
     contract but does not commit the secret or K3s manifests.

### Degradation, circuit breaking, and recovery

139. Text delivery is primary. Voice is asynchronous best effort.
140. The coordinator distinguishes configuration failure from operational degradation.
141. Configuration failure is fail-fast; operational TTS/voice failure transitions speech to unavailable/text-only
     without terminating the runtime.
142. Synthesis, voice readiness, and playback have separate deadlines and failure stages.
143. Waiting-job expiration and queue-full admission do not increment the consecutive delivery-failure count.
144. Synthesis, TTS protocol, voice readiness, connection, FFmpeg/player, and playback timeout failures do increment
     it.
145. Any completed playback resets the consecutive failure count.
146. After two consecutive delivery failures, the circuit opens.
147. While open, Lost continues text delivery but does not enqueue voice, and manual requests receive a stable
     unavailable response.
148. Opening the circuit aborts/stops the active operation, releases it, and rejects/skips new admissions according
     to source semantics.
149. Recovery occurs outside the interaction handler and queue drain.
150. Recovery probes TTS readiness and attempts to restore the configured Discord voice connection with bounded
     backoff.
151. The circuit closes only when both synthesis readiness and Discord voice readiness are restored.
152. Recovery success resets the failure count and allows new jobs; failed probes do not create speech jobs.
153. The initial recovery probe interval is `5_000 ms`; later backoff calibration requires live evidence.
154. Reconnect behavior already handled by `@discordjs/voice` remains delegated to the library, with application
     deadlines and state observation layered around it.
155. No request waits through repeated full TTS/voice timeouts while the circuit is open.

### Privacy and observability

156. Runtime speech logs may include:
     request ID, speech job ID, source, speaker, status, failure stage, queue depth, circuit state, latency, and safe
     infrastructure state.
157. TTS service logs may include:
     request ID, model ID, speaker, readiness state, result code, synthesis latency, output byte count, and worker
     lifecycle state.
158. Neither process logs:
     Bearer token, Discord token, GSI token, Discord user ID, alias, speech text, recommendation text, raw WAV bytes,
     raw request body, Python traceback, raw Discord payload, or local secret/model path.
159. The TTS service necessarily receives the rendered text, including the configured alias for Lost, over the
     private service network. It does not persist or log it.
160. Final asynchronous delivery is recorded separately using the same request/job IDs.
161. Stable runtime statuses are:
     `queued`, `completed`, `expired`, `failed`, `timed_out`, and `skipped_text_only`.
162. Stable failure stages are:
     `admission`, `tts_readiness`, `synthesis`, `tts_protocol`, `voice_readiness`, `playback`, and `cleanup`.
163. Worker and voice lifecycle transitions use bounded event codes rather than raw SDK/process errors.
164. Existing HTTP request logging remains safe and must not emit Authorization headers or request bodies.
165. No Prometheus stack, database, trace collector, or audio archive is introduced.

### Runtime and service lifecycle

166. All runtime config and credentials are parsed before any network lifecycle starts.
167. The TTS service may be absent or unready when runtime serving starts.
168. Runtime startup still requires the existing enabled Discord text Gateway/panel contract to succeed.
169. After Discord text readiness, runtime starts the speech coordinator and launches voice/TTS recovery without
     making speech readiness a prerequisite for HTTP bind.
170. HTTP bind makes the protected manual endpoint available only after the coordinator can make a deterministic
     admission decision.
171. Runtime shutdown:
     gates Discord interactions, stops speech admission, aborts the active synthesis, stops the audio player, clears
     waiting jobs, closes HTTP, destroys voice resources, and destroys the Discord client.
172. Shutdown does not drain queued speech or promise delivery during termination.
173. Start/stop remain idempotent and clean up in reverse order after partial startup failure.
174. The runtime does not start, stop, or restart the TTS container through Docker/Kubernetes APIs.
175. Compose starts both services but does not gate runtime startup on TTS health.
176. The TTS container exposes Docker health/readiness checks suitable for later K3s probes.
177. K3s Deployment, Service, NetworkPolicy, secret manifests, resource requests/limits, rollout strategy, and
     persistent registry configuration are deferred to the deployment vertical.

## Deferred Decisions

The following remain deliberately outside this implementation contract:

1. Buy scoring, Buy rendering, enabling the Buy button, and the Buy speech producer.
2. A second TTS model, a commercial model, GPU inference, external provider, SSML, style/emotion controls, or
   automatic language selection.
3. Public distribution of the Silero model image or any commercial use.
4. TTS phrase cache, audio persistence, replay, downloadable files, or durable job storage.
5. Job priority, per-source subqueues, fairness scheduling, reservation, or exactly-once delivery.
6. A manual job status/list/cancel endpoint or synchronous wait-for-playback API.
7. Multiple guilds, multiple voice channels, dynamic channel selection, private voice, stage channels, or moving the
   bot based on the caller.
8. Slash commands, Discord-native manual TTS commands, speech recognition, wake word, or proactive coaching.
9. Volume controls, silence trimming, loudness normalization, denoising, effects, or returning Discord-ready Opus
   from the TTS service.
10. Native `@discordjs/opus` optimization without ARM64 evidence.
11. Horizontal TTS scaling, distributed queue, multi-runtime coordination, leader election, or service mesh.
12. Kubernetes/K3s manifests, public ingress, NetworkPolicy, autoscaling, persistent image registry, and GitOps
    deployment wiring.
13. Final Raspberry Pi CPU thread count, pod resources, and production deadline calibration before measured evidence.
14. A generic microservice framework, shared cross-language package, generated SDK, message broker, gRPC, or
    event-streaming platform.

## Scope Exclusions

This vertical must not add:

- Buy recommendation or a clickable Buy execution path;
- changes to GSI normalization, Match memory, Lost weights, Lost stability, or public Lost text;
- a second Discord bot/client or another Discord panel;
- speech before successful Lost text delivery;
- speech for role buttons, rejected interactions, or automatic game events;
- arbitrary model/URL/path/device selection through either HTTP API;
- a shared media filesystem between containers;
- public TTS port exposure;
- raw request/audio logging;
- database, message broker, cache service, or persistent queue;
- production K3s/GitOps deployment resources.

## Target Vertical

### Lost flow

```text
Discord "I'm lost"
  -> existing preflight/debounce/acknowledgement
  -> existing Lost recommendation
  -> existing public text mirror send
  -> enqueueSpeech({
       source: "lost",
       speaker: "baya",
       text: recommendation.voiceText
     })
  -> finish Discord interaction without awaiting speech
```

### Manual flow

```text
POST /internal/speech-jobs
  -> dedicated Bearer authentication
  -> strict { speaker, text } validation
  -> common speech admission
  -> 202 { jobId, status: "queued" }
```

### Background delivery

```text
FIFO speech coordinator
  -> reject expired waiting job
  -> POST tts:8080/v1/speech under TTS deadline
  -> receive bounded audio/wav
  -> recheck expiration
  -> await configured Discord voice readiness under deadline
  -> play with one audio player under playback deadline
  -> record terminal delivery
  -> always cleanup
  -> continue with next job
```

### Operational degradation

```text
TTS/voice/playback failure
  -> fail and cleanup current job
  -> increment consecutive failures
  -> continue queue while circuit remains closed

threshold reached
  -> open text-only circuit
  -> skip Lost voice; keep Lost text
  -> reject manual admission as unavailable
  -> recover TTS + Discord voice outside queue
  -> close circuit only after both are ready
```

### Container topology

```text
host / future K3s ingress
  |
  v
runtime:3000
  |- GET /health
  |- POST /gsi
  |- POST /internal/speech-jobs  [Bearer protected]
  |- Discord Gateway/text/voice
  `- Speech FIFO + deadlines + circuit
          |
          | private HTTP, no retry
          v
tts:8080
  |- GET /health
  |- GET /ready
  `- POST /v1/speech -> audio/wav
          |
          v
     Silero v5_5_ru CPU inference worker
```

## Architectural Boundaries

### Speech module boundary

`modules/speech` owns:

- immutable job/admission/status contracts;
- speaker and source contracts;
- FIFO and queue capacity;
- job TTL and stage deadlines;
- one drain loop;
- terminal cleanup orchestration;
- circuit state and recovery coordination;
- transport-neutral synthesizer and voice-output ports;
- public enqueue/lifecycle/status capability.

It does not own HTTP, Discord SDK, TTS HTTP, FFmpeg, model loading, Lost rendering, or credentials parsing.

### Lost boundary

`modules/lost` remains unchanged. Its public result already owns `voiceText`. It does not import `speech`.

Discord orchestration consumes the Lost result and calls the speech public API after successful public text delivery.

### Discord application boundary

The existing Discord button handler owns the ordering invariant:

```text
publish public text -> attempt speech admission -> finish ephemeral response
```

It receives a narrow `enqueueSpeech` dependency and handles non-accepted admission without throwing away text
success.

### Discord SDK and voice boundary

`integrations/discord/infrastructure` owns one shared serving client and returns SDK-free text/Gateway and voice ports.

Serving uses `Guilds` plus `GuildVoiceStates`. Provisioning remains text-only. Voice channel resolution, permissions,
join/rejoin, `@discordjs/voice`, player/resource/subscription state, FFmpeg, Opus, and SDK errors never cross this
boundary.

### TTS HTTP boundary

`integrations/tts` implements the speech synthesizer port:

- serializes the versioned JSON request;
- applies the runtime TTS deadline/abort signal;
- validates status, content type, response size, and WAV signature;
- returns an immutable bounded audio artifact;
- maps HTTP/network/protocol failures to stable synthesis results.

It does not retry, enqueue, play, or expose raw response objects.

### Python TTS service boundary

`apps/tts` is an independently buildable/testable Python application:

- HTTP supervisor and schemas;
- strict service config;
- Silero inference subprocess lifecycle;
- model load/warmup;
- one-request concurrency gate;
- deterministic PCM WAV encoding;
- health/readiness;
- stable safe errors and logs.

### Local Python container workflow

Python development and verification are container-only. The host is not required to install Python, `uv`, the
application package, or its test/static-analysis dependencies.

One multi-stage TTS Dockerfile evolves across the RED/GREEN pair:

- Phase 3 adds the shared Debian/glibc Python base, locked dependency layers, and a `test` target;
- Phase 4 adds the normal local `development` target and the minimal final `runtime` target;
- the `test` target remains model-free across both phases and contains no PyTorch, FFmpeg, listening service, or
  production entry point;
- the `runtime` target is the only TTS image target intended for a future container-registry push.

The development Compose document contains one profile-gated one-shot service named `tts-test`. It:

- builds the Docker `test` target;
- has `profiles: [test]`, no ports, no healthcheck, no dependencies, no restart policy, and no source bind mount;
- runs without a container network after its image dependencies have been resolved during build;
- runs format, lint, static typing, and Python tests, then exits with their combined result;
- is absent from ordinary `docker compose up`;
- is invoked explicitly from the repository root with:

```text
docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml run --rm --build tts-test
```

The root Makefile exposes:

- `test-tts` for the one-shot Compose command;
- `test-runtime` for `npm --prefix apps/runtime run check`;
- `test` for both checks, always attempting both and returning non-zero when either fails.

The Phase 3 aggregate `make test` result is intentionally non-zero because the new Python and Node contract suites
are RED. Phase 4 makes the same command green without changing the local entry point.

Future CI configuration is outside this vertical. Its preserved workflow invariant is: build an immutable `test`
target, run every TTS check in that image, build the `runtime` target from the same source revision and lock, and push
that final target only after all checks pass.

### Manual HTTP boundary

The runtime manual router owns:

- Bearer authentication;
- manual payload parsing;
- HTTP error/status mapping;
- invocation of the same speech admission API used by Lost;
- `202` response projection.

It does not call TTS or Discord voice directly.

### Configuration boundary

Runtime speech parsing belongs to `platform/config`, consistent with current client/Discord configuration ownership.
Python TTS parsing stays in `apps/tts`; runtime never parses Python service model configuration.

### Bootstrap and lifecycle boundary

Bootstrap composes:

- existing Match/Lost/HTTP;
- existing Discord text Gateway;
- shared Discord voice adapter;
- TTS HTTP adapter;
- speech coordinator;
- manual speech router dependencies.

It preserves fail-fast local configuration and text-first operational degradation.

## Contract Baseline

### Runtime speech contracts

```ts
type SpeechSpeaker = "aidar" | "baya" | "kseniya" | "xenia" | "eugene";

type SpeechSource = "lost" | "manual";

type SpeechJobStatus =
  "queued" | "synthesizing" | "playing" | "completed" | "failed" | "timed_out";

type SpeechJob = Readonly<{
  id: string;
  requestId: string;
  source: SpeechSource;
  speaker: SpeechSpeaker;
  text: string;
  createdAt: number;
  expiresAt: number;
  status: SpeechJobStatus;
}>;
```

The implementation may separate command input from observed job state. It must not expose a mutable job object.

### Admission contract

```ts
type EnqueueSpeechInput = Readonly<{
  requestId: string;
  source: SpeechSource;
  speaker: SpeechSpeaker;
  text: string;
}>;

type EnqueueSpeechResult =
  | Readonly<{ status: "queued"; jobId: string }>
  | Readonly<{ status: "queue_full" }>
  | Readonly<{ status: "text_only" }>
  | Readonly<{ status: "stopped" }>;

type EnqueueSpeech = (input: EnqueueSpeechInput) => EnqueueSpeechResult;
```

Expected admission failures are results, not exceptions.

### Audio artifact contract

```ts
type SpeechAudioArtifact = Readonly<{
  bytes: Uint8Array;
  contentType: "audio/wav";
  sampleRateHz: 48_000;
}>;
```

The artifact contains no path and owns no persistent resource.

### Synthesizer port

```ts
type SynthesizeSpeech = (
  input: Readonly<{
    requestId: string;
    speaker: SpeechSpeaker;
    text: string;
    signal: AbortSignal;
  }>,
) => Promise<SpeechAudioArtifact>;
```

### Voice-output port

```ts
type VoiceOutput = Readonly<{
  waitUntilReady(timeoutMs: number): Promise<void>;
  play(
    input: Readonly<{
      artifact: SpeechAudioArtifact;
      timeoutMs: number;
    }>,
  ): Promise<void>;
  stop(): Promise<void>;
  recover(): Promise<"ready" | "unavailable">;
}>;
```

Exact method splitting may change if tests reveal a clearer SDK-free interface, but readiness, playback, stop, and
recovery semantics must remain independently testable.

### Runtime public speech configuration

Strict disabled shape:

```yaml
schema_version: 1
speech:
  enabled: false
```

The disabled variant accepts no voice, TTS, queue, deadline, circuit, or manual fields and requires no speech
credentials or network work.

Tracked local shape:

```yaml
schema_version: 1
speech:
  enabled: true
  voice_channel_id: "000000000000000000"
  tts_base_url: "http://tts:8080"
  recommendation_speaker: baya
  job_ttl_ms: 20000
  tts_timeout_ms: 7000
  voice_ready_timeout_ms: 3000
  playback_timeout_ms: 15000
  consecutive_failures_before_text_only: 2
  recovery_probe_interval_ms: 5000
  queue_capacity: 10
  manual:
    enabled: true
    max_text_characters: 300
```

The real voice-channel snowflake is operator-owned local/production configuration, not a value invented by this
plan.

### Runtime private speech credentials

Example shape:

```yaml
schema_version: 1
manual_speech:
  bearer_token: "replace-with-a-long-random-secret"
```

The tracked example contains no usable secret.

### Python TTS public configuration

```yaml
schema_version: 1
tts:
  model_id: v5_5_ru
  model_path: /opt/dota2-coach/models/v5_5_ru.pt
  device: cpu
  sample_rate_hz: 48000
  synthesis_timeout_ms: 6500
  max_text_characters: 300
  host: 0.0.0.0
  port: 8080
```

The service code owns the fixed speaker allowlist and expected pinned artifact checksum. The initial internal
`6_500 ms` limit leaves bounded response/mapping time inside the runtime's `7_000 ms` outer deadline.

### Manual runtime request

```http
POST /internal/speech-jobs
Authorization: Bearer <manual-speech-secret>
Content-Type: application/json
```

```json
{
  "speaker": "aidar",
  "text": "Проверка синтеза речи другим голосом."
}
```

Accepted:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{
  "jobId": "opaque-speech-job-id",
  "status": "queued"
}
```

Stable pre-admission mappings:

| Condition                           | Status | Code                          |
| ----------------------------------- | ------ | ----------------------------- |
| missing/invalid Bearer token        | `401`  | `MANUAL_SPEECH_UNAUTHORIZED`  |
| malformed JSON or unknown field     | `400`  | `MANUAL_SPEECH_INVALID_BODY`  |
| invalid speaker/text                | `422`  | `MANUAL_SPEECH_INVALID_INPUT` |
| queue capacity reached              | `429`  | `SPEECH_QUEUE_FULL`           |
| coordinator stopped or circuit open | `503`  | `SPEECH_UNAVAILABLE`          |

Error bodies contain only stable code/message fields and the existing safe request ID behavior.

### Internal TTS request

```http
POST /v1/speech
Content-Type: application/json
```

```json
{
  "requestId": "opaque-speech-job-id",
  "speaker": "baya",
  "text": "Fire, сейчас лучше защищать нижнюю башню."
}
```

Success:

```http
HTTP/1.1 200 OK
Content-Type: audio/wav
X-TTS-Request-Id: opaque-speech-job-id
X-TTS-Sample-Rate: 48000
```

Body is a bounded WAV file payload.

Stable TTS mappings:

| Condition                    | Status | Code                  |
| ---------------------------- | ------ | --------------------- |
| malformed JSON/unknown field | `400`  | `INVALID_REQUEST`     |
| text exceeds service bound   | `413`  | `TEXT_TOO_LONG`       |
| unsupported speaker          | `422`  | `UNSUPPORTED_SPEAKER` |
| inference worker busy        | `429`  | `BUSY`                |
| model/worker not ready       | `503`  | `MODEL_NOT_READY`     |
| internal synthesis deadline  | `504`  | `SYNTHESIS_TIMEOUT`   |
| bounded internal failure     | `500`  | `SYNTHESIS_FAILED`    |

### TTS health and readiness

`GET /health`:

```json
{
  "status": "ok"
}
```

`GET /ready` success:

```json
{
  "status": "ready",
  "model": "v5_5_ru",
  "device": "cpu"
}
```

Unready uses `503` and a bounded body without exception details.

### Speech delivery log

Conceptual runtime record:

```json
{
  "code": "SPEECH_DELIVERY_COMPLETED",
  "requestId": "...",
  "speechJobId": "...",
  "source": "lost",
  "speaker": "baya",
  "status": "completed",
  "failureStage": null,
  "latencyMs": 2100
}
```

Conceptual TTS record:

```json
{
  "code": "TTS_SYNTHESIS_COMPLETED",
  "requestId": "...",
  "model": "v5_5_ru",
  "speaker": "baya",
  "status": "completed",
  "latencyMs": 800,
  "outputBytes": 123456
}
```

The exact logger types may split lifecycle and delivery events, but privacy fields and correlation invariants do not
change.

## Decision Pipelines

### Lost admission

```text
resolve/debounce/acknowledge
-> build Lost recommendation
-> render Discord text
-> publish Discord text
-> call enqueueSpeech with voiceText and baya
   -> queued: record queued
   -> queue_full/text_only/stopped: record skipped voice
-> complete ephemeral response
```

### Manual admission

```text
authenticate header
-> parse strict JSON
-> validate speaker/text
-> call the same enqueueSpeech
   -> queued: 202 + jobId
   -> queue_full: 429
   -> text_only/stopped: 503
```

### One job

```text
dequeue FIFO
-> expire if created/expires window elapsed
-> status synthesizing
-> call TTS under AbortController + 7s deadline
-> validate completed WAV
-> recheck expiration
-> await voice ready under 3s deadline
-> status playing
-> play under 15s deadline
-> status completed
-> reset consecutive failures
-> finally cleanup
```

### Failure

```text
stage failure/timeout
-> abort stage
-> stop player when relevant
-> terminal failed/timed_out
-> increment delivery failures when relevant
-> finally cleanup
-> open circuit at threshold
-> continue next job only while circuit remains closed
```

### Recovery

```text
open circuit
-> gate new speech admissions
-> asynchronous recovery loop
-> GET TTS /ready
-> resolve/join configured Discord voice channel
-> wait for voice Ready
-> if both ready: reset failures and close circuit
-> otherwise retain text-only and retry with bounded interval
```

## Operator Prerequisites

Before live voice verification, the operator must:

1. Keep the existing Discord application/bot token.
2. Grant the bot `View Channel`, `Connect`, and `Speak` in one normal guild voice channel.
3. Record that channel snowflake in the runtime speech public config.
4. Keep privileged Gateway intents disabled; add only the non-privileged `GuildVoiceStates` intent in code.
5. Generate a long random manual speech Bearer token.
6. Store it only in the ignored runtime speech credentials file.
7. Confirm the selected channel belongs to the already configured Discord guild.
8. Accept that anyone in the shared voice channel hears each accepted manual/Lost utterance.
9. Build/pull the private TTS image containing the non-commercial Silero model artifact.
10. Do not expose TTS port `8080` through Compose, Cloudflare, ingress, or a router.

Operator checkpoint:

- bot permissions are visible in the target voice channel;
- voice channel ID is a string and is not the bot user ID;
- runtime manual secret is present but not printed;
- TTS `/ready` is reachable from the runtime container only;
- the model image is private.

## Proposed File Layout

Exact filenames may change when implementation reveals a clearer local name, but ownership and dependency direction
must remain stable.

```text
Makefile

apps/
├── runtime/
│   ├── package.json
│   ├── package-lock.json
│   └── src/
│       ├── bootstrap/
│       │   ├── create-serving-runtime.spec.ts
│       │   ├── create-serving-runtime.ts
│       │   ├── runtime-lifecycle.spec.ts
│       │   └── runtime-lifecycle.ts
│       ├── integrations/
│       │   ├── discord/
│       │   │   ├── application/
│       │   │   │   ├── handle-discord-button.spec.ts
│       │   │   │   └── handle-discord-button.ts
│       │   │   └── infrastructure/
│       │   │       ├── discord-gateway-adapter.spec.ts
│       │   │       ├── discord-gateway-adapter.ts
│       │   │       ├── discord-voice-adapter.spec.ts
│       │   │       └── discord-voice-adapter.ts
│       │   ├── speech/
│       │   │   ├── manual-speech-auth.spec.ts
│       │   │   ├── manual-speech-auth.ts
│       │   │   ├── manual-speech.router.spec.ts
│       │   │   └── manual-speech.router.ts
│       │   └── tts/
│       │       ├── tts-http-adapter.spec.ts
│       │       └── tts-http-adapter.ts
│       ├── modules/
│       │   └── speech/
│       │       ├── public.ts
│       │       ├── application/
│       │       │   ├── speech-coordinator.spec.ts
│       │       │   ├── speech-coordinator.ts
│       │       │   ├── speech-ports.ts
│       │       │   └── speech-recovery.ts
│       │       └── domain/
│       │           ├── speech-job.ts
│       │           └── speech-speaker.ts
│       └── platform/
│           ├── config/
│           │   ├── load-speech-config.spec.ts
│           │   ├── load-speech-config.ts
│           │   ├── parse-speech-config.spec.ts
│           │   └── parse-speech-config.ts
│           └── http/
│               ├── create-app.spec.ts
│               └── create-app.ts
└── tts/
    ├── pyproject.toml
    ├── uv.lock
    ├── README.md
    ├── THIRD_PARTY_NOTICES.md
    ├── scripts/
    │   ├── check.sh
    │   └── smoke.py
    ├── src/
    │   └── tts_service/
    │       ├── __init__.py
    │       ├── api.py
    │       ├── config.py
    │       ├── contracts.py
    │       ├── inference_supervisor.py
    │       ├── inference_worker.py
    │       ├── main.py
    │       ├── silero_engine.py
    │       └── wav.py
    └── tests/
        ├── test_api.py
        ├── test_config.py
        ├── test_inference_supervisor.py
        ├── test_inference_worker.py
        ├── test_main.py
        ├── test_silero_engine.py
        └── test_wav.py

ops/
├── dev/
│   ├── config/
│   │   ├── runtime/
│   │   │   └── speech.yaml
│   │   └── tts/
│   │       └── tts.yaml
│   ├── secrets/
│   │   └── runtime/
│   │       ├── speech-credentials.example.yaml
│   │       └── speech-credentials.local.yaml       # ignored
│   └── docker-compose.yml
└── services/
    ├── runtime/
    │   └── Dockerfile
    └── tts/
        └── Dockerfile
```

Do not create empty Buy producers, a provider framework, generic worker framework, shared media storage, or
Kubernetes directories in this vertical.

## Milestone Status

| Milestone                                              | RED phase | GREEN phase | Status        |
| ------------------------------------------------------ | --------- | ----------- | ------------- |
| M0. Contract baseline                                  | —         | Phase 0     | `completed`   |
| M1. Speech core, config, and protected manual API      | Phase 1   | Phase 2     | `completed`   |
| M2. Silero service and runtime TTS HTTP adapter        | Phase 3   | Phase 4     | `completed`   |
| M3. Discord voice, Lost wiring, circuit, and lifecycle | Phase 5   | Phase 6     | `not-started` |
| M4. ARM64/live verification and handoff                | —         | Phase 7     | `not-started` |

## Phase 0 — Contract Baseline

Status: `completed`

Target end state: `completed`

Confirmed:

- internal non-commercial Silero `v5_5_ru`, CPU, 48 kHz, and private model image;
- separate Python TTS container and private WAV-over-HTTP service contract;
- `linux/arm64` and Raspberry Pi 5 as required rollout targets;
- runtime ownership of FIFO, TTL, deadlines, circuit, Discord voice, and playback;
- no queue, Discord knowledge, or domain knowledge in the TTS service;
- recommendation speaker `baya` and five-speaker manual allowlist;
- Lost-only recommendation integration with future Buy reuse through the same admission API;
- text publication before non-blocking Lost speech admission;
- one configured voice channel and startup join with text-only operational degradation;
- shared serving Discord client plus `GuildVoiceStates`;
- one protected enabled manual endpoint with a dedicated secret;
- `POST /internal/speech-jobs` asynchronous `202 + jobId` semantics;
- one-line `300`-code-point manual text bound;
- one common queue and lifecycle for Lost/manual jobs;
- no manual status endpoint, persistence, retry, cache, public TTS port, or K3s manifests;
- MVP deadline defaults, hard cleanup, two-failure circuit, and asynchronous recovery;
- privacy-safe cross-process logging.

Exit criteria:

- Plan status is `approved`.
- M0 and Phase 0 are `completed`.
- No unresolved architectural/API/security decision blocks Phase 1 specs.
- No production code or dependency is changed by Phase 0.

## Phase 1 — Speech Core and Manual API RED

Status: `red-expected`

Target end state: `red-expected`

Add compile-safe SDK-free contracts and intentional RED specs for:

- strict enabled/disabled runtime speech config and conditional credentials;
- speaker/source/job/status/audio/admission types;
- immutable FIFO admission, capacity, TTL, and one active drain loop;
- separate synthesis/readiness/playback deadlines;
- terminal cleanup and next-job continuation;
- no retry;
- failure counting and text-only circuit transitions;
- recovery port behavior without real timers/network;
- Lost versus manual admission result semantics;
- strict Bearer authentication before body parsing;
- strict manual payload and `300` Unicode code-point/single-line bound;
- exact manual HTTP status/code mapping;
- `202 { jobId, status: "queued" }`;
- no status endpoint;
- privacy-safe log-event types;
- deterministic injected clock/ID/timer seams.

Production seams may throw one bounded `not implemented` error and must not be wired into the serving application.

Completed:

- Added SDK-free immutable speech speaker/source/job/status/audio/admission contracts and public exports.
- Added coordinator ports for synthesis, voice output, combined recovery, injected monotonic time, IDs, scheduling,
  and privacy-safe events.
- Added compile-safe bounded stubs for runtime speech config parsing/loading/process settings, the coordinator,
  manual Bearer authentication, and the isolated manual router.
- Added six intent-driven spec suites with `87` tests covering config/credential strictness, FIFO/capacity/TTL,
  independent deadlines, cleanup/no-retry, circuit recovery, protected manual validation/mappings, and absence of a
  status API.
- Kept all seams disconnected from `createApp`, bootstrap, Discord, TTS, Compose, and runtime lifecycle.

Evidence:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run format:check` — passed.
- Focused Phase 1 specs — expected RED: `6` suites failed, `87` tests failed, all at the six bounded
  `not implemented` seams.
- Existing regression suite with Phase 1 specs excluded — `51` suites passed, `451` tests passed.
- Complete Node suite — expected RED only: `6` Phase 1 suites failed / `51` existing suites passed;
  `87` Phase 1 tests failed / `451` existing tests passed.

Run:

- focused new Node specs;
- existing complete Node suite;
- type checking;
- lint and format checks.

Exit criteria:

- New specs fail only for the missing speech core/config/manual behavior.
- Existing coverage remains green.
- Production runtime routes and behavior are unchanged.
- No Discord/TTS SDK, Python app, package dependency, Compose service, or real timer/network is added.
- M1 remains `not-started` until Phase 2 is green.

## Phase 2 — Speech Core and Manual API GREEN

Status: `completed`

Target end state: `green`

Implement:

- strict runtime speech public/private loading and parsing;
- fixed speaker allowlist and validation;
- immutable job/admission contracts;
- one bounded in-memory FIFO coordinator;
- deterministic drain/expiration/deadline/circuit behavior behind fake ports;
- cleanup on success/error/timeout;
- protected manual router and exact mappings;
- safe event recording;
- `createApp` dependency seam for the manual router;
- tracked public config and credentials example;
- ignored local credentials convention.

Keep the router and coordinator production wiring disabled until real TTS/voice adapters exist; no endpoint may
accept a job that has no production consumer.

Completed:

- Implemented strict enabled/disabled runtime speech YAML, conditional manual credentials, safe source errors,
  process settings, and the pure `speech.enabled => discord.enabled` compatibility invariant.
- Implemented the immutable in-memory coordinator with one active job, a bounded waiting FIFO, TTL checks,
  independent abortable deadlines, no retry, terminal cleanup, consecutive-failure circuit, waiting-job eviction,
  asynchronous recovery, and bounded shutdown.
- Implemented timing-safe dedicated Bearer authentication before a local `4_096`-byte JSON parser, strict
  speaker/text validation, exact manual admission mappings, and asynchronous `202` projection.
- Added the explicit `manualSpeechRouter: Router | null` `createApp` seam. Production composition passes `null`, so
  the runtime still exposes no manual speech endpoint before real TTS/voice consumers exist.
- Added tracked development speech configuration for voice channel `1411786395202093056`, a non-secret credentials
  example, and verified the existing ignored `*.local.yaml` credentials convention.
- Kept Discord text behavior, Lost behavior, TTS/voice SDKs, Compose wiring, Python service, and production speech
  lifecycle outside Phase 2.

Evidence:

- Focused speech/config/manual/HTTP seam checks — `7` suites passed, `118` tests passed.
- Complete `npm run check` — typecheck, lint, format, `57` suites / `548` tests, production build, and built-runtime
  smoke all passed.
- Tracked `speech.yaml` plus the credentials example parse successfully with speech/manual enabled and the pinned
  voice-channel ID.
- `git check-ignore --no-index ops/dev/secrets/runtime/speech-credentials.local.yaml` resolves to the existing local
  secret ignore rule.
- Repository plan/config formatting and `git diff --check` passed.

Run:

- all Phase 1 specs;
- complete Node checks;
- `git diff --check`.

Exit criteria:

- Phase 1 specs are green.
- No intentional RED/stub remains in implemented core/config/manual units.
- Queue order, capacity, TTL, deadlines, cleanup, no retry, and circuit behavior are deterministic.
- Manual auth/payload/API behavior is complete behind the composition seam.
- Existing health/GSI/Discord behavior remains green.
- M1 is `completed`.

## Phase 3 — Silero Service and TTS Client RED

Status: `red-expected`

Target end state: `red-expected`

Add the compile-safe Python service and Node client contract seams.

Python package and container foundation:

- `apps/tts` uses a `src` package layout, Python `3.11` on a Debian Bookworm slim/glibc base, and `uv`;
- the `uv` binary and base image are pinned for reproducible image construction;
- `pyproject.toml` plus `uv.lock` are the only Python dependency declaration/resolution sources;
- initial application dependencies are Starlette, Uvicorn, and PyYAML;
- the locked test group provides pytest, pytest-asyncio, the in-process HTTP test client, Ruff, and mypy;
- `ops/services/tts/Dockerfile` adds shared dependency stages and a `test` target only;
- the test image build does not run tests, start an HTTP server, install PyTorch, or contain a model artifact;
- the test target defaults to `apps/tts/scripts/check.sh`, which runs Ruff format checking, Ruff linting, mypy, and
  pytest in that order;
- ordinary tests use in-process ASGI calls and fake worker/model/process ports, never a listening socket, live model,
  or external network.

Add intentional RED Python contract specs for:

- strict TTS config;
- health versus readiness;
- fixed model/device/rate and speaker allowlist;
- request validation and stable error mapping;
- WAV PCM format and bounded response;
- one-request concurrency;
- inference subprocess startup/warmup;
- timeout/crash kill and replacement;
- no text/path/traceback leakage;

The Python supervisor specs use deterministic fake process/worker handles. They cover the contract state path:
`stopped -> starting/unready -> ready -> busy -> ready`. Timeout, crash, malformed response, and cancellation must
terminate and join the old worker, use a kill fallback when required, discard stale output, clear readiness, and
start replacement outside the failed request.

Add intentional RED Node TTS-adapter specs for:

- runtime TTS request serialization;
- abort/deadline behavior;
- response content type/size/RIFF validation;
- no retry;
- stable runtime synthesis error mapping.

Extend the transport-neutral speech synthesis failure contract with bounded metadata sufficient for the coordinator
to preserve:

- `stage: "synthesis" | "tts_protocol"`;
- `timedOut: boolean`;
- a safe bounded reason/code without an HTTP response, request text, model detail, traceback, or local path.

The adapter maps TTS `504` to a synthesis timeout, invalid/malformed/oversized WAV responses to a protocol failure,
and bounded HTTP/network failures to synthesis failure. An external abort signal is forwarded and is not converted
into an adapter-owned retry or timeout.

Add the container-only local verification seam:

- `ops/dev/docker-compose.yml` defines `tts-test` with `profiles: [test]`, Docker target `test`, `network_mode: none`,
  and no ports, volumes, healthcheck, dependencies, or restart policy;
- explicitly targeting `tts-test` runs it without enabling the test profile for normal services;
- ordinary `docker compose up` remains unchanged and does not create or start a TTS container;
- the repository root Makefile adds `test-tts`, `test-runtime`, and aggregate `test`;
- aggregate `test` always runs both child targets and fails when either result is non-zero.

Add compile-safe service/client seams only. Do not add a downloadable model artifact, PyTorch, a runnable TTS
development/runtime target, a normal-profile TTS Compose service, a listening TTS process, or runtime-to-TTS wiring
in RED.

Implemented so far:

- Added the Python `3.11` src-layout package, frozen dataclass/protocol contracts, pinned `uv`/Bookworm test
  Dockerfile stages, generated `uv.lock`, and model-free format/lint/type/test entry point.
- Added `57` in-process/fake-driven Python contract tests for strict config, health/readiness, request/error mapping,
  bounded PCM WAV, single-request concurrency, worker startup, timeout/crash/malformed-response/cancellation
  replacement, kill fallback, idempotent stop, and privacy-safe failures.
- Added the transport-neutral immutable `SpeechSynthesisError` contract and an isolated Node TTS HTTP adapter seam
  with `20` contract tests for serialization, cancellation, no retry, stable HTTP/network mapping, correlation,
  content type, sample rate, RIFF validation, and declared/streamed size bounds.
- Added the profile-gated, network-isolated `tts-test` Compose service plus root `test-tts`, `test-runtime`, and
  always-attempt-both `test` Make targets.
- Kept the Python service and Node adapter unwired from the production runtime; no model, PyTorch, FFmpeg, listening
  process, runtime TTS target, normal-profile TTS service, or public TTS port was added.

Evidence:

- `uv lock --check` with pinned `uv 0.11.16` — passed.
- Diagnostic execution from a temporary pinned `uv` environment — Ruff format/lint and strict mypy passed; all
  `57` Python tests reached only the four bounded API/config/supervisor/WAV `not implemented` seams.
- Focused Node TTS adapter suite — expected RED: `1` suite failed / `20` tests failed at the one bounded adapter
  seam.
- Previous Node regression set with the new adapter spec excluded — `57` suites passed / `548` tests passed.
- Node typecheck, lint, format check, production build, and built-runtime smoke — passed.
- Static Compose structure verification confirms `profiles: [test]`, target `test`, `network_mode: none`, no
  ports/volumes/healthcheck/dependencies/restart, no normal `tts` service, and no runtime dependency on TTS.
- Operator Docker evidence: the canonical Compose command built the pinned Python `3.11.15` test image from
  `uv.lock`; Ruff format/lint and strict mypy passed before pytest reached `57` expected RED assertions at the four
  bounded Python seams.
- Operator aggregate `make test` evidence: the TTS child returned the expected `57` Python RED assertions, the
  runtime child still ran and returned the expected `20` adapter RED assertions with `57` prior suites /
  `548` prior tests green, and the aggregate returned non-zero.

Run:

- build the Docker `test` target successfully;
- run focused Python tests inside `tts-test` and record intentional RED only at bounded implementation seams;
- run Ruff format/lint and mypy inside `tts-test`; these checks must be green;
- focused Node TTS-adapter specs;
- the previous Node regression set with the new TTS adapter spec excluded;
- Node typecheck, lint, format, build, and built-runtime smoke separately;
- aggregate `make test`, confirming that both children run and the result is intentional RED;
- render the Compose configuration and verify that `tts-test` is profile-gated, network-isolated, and absent from
  ordinary `docker compose up`;
- `git diff --check`.

Exit criteria:

- New specs fail only for missing TTS service/client behavior.
- The TTS test image builds from the lock, and its format/lint/type checks are green before pytest reaches expected
  RED assertions.
- Existing Node coverage remains green when the new adapter suite is excluded; typecheck, lint, format, build, and
  built-runtime smoke remain green.
- `make test` runs both TTS and runtime checks even when the first fails, then returns non-zero for the intentional
  RED suites.
- Ordinary Compose startup still contains no TTS runtime service, exposed TTS port, or runtime dependency on TTS.
- The `tts-test` container publishes no port, has no runtime dependency, runs without a network, exits after checks,
  and is removed by the canonical `run --rm` workflow.
- Existing runtime remains unwired from TTS.
- No live model/network is required for ordinary deterministic tests.
- M2 remains `not-started`.

## Phase 4 — Silero Service and TTS Client GREEN

Status: `completed`

Target end state: `green`

Approved Phase 4 implementation decisions:

- use `multiprocessing` with the `spawn` context and one duplex Pipe; only the inference subprocess owns
  PyTorch/model state;
- return a bounded timeout/crash/cancellation error without waiting for worker replacement; clear readiness and
  warm the replacement in the background;
- pin `torch==2.12.0+cpu` through the explicit official CPU wheel index while keeping PyTorch out of the deterministic
  `test` target;
- pin `v5_5_ru.pt` at `145420684` bytes with SHA-256
  `50081637b602126ee06cb3bc8a744d25651d2da149ee8864b9a379bfdd934437`;
- accept the model only from the Git-ignored `.artifacts/tts/v5_5_ru.pt` build input; keep model acquisition during
  image construction network-independent and defer the future CI artifact acquisition mechanism;
- provide an explicit `make fetch-tts-model` bootstrap from the pinned Google Drive file ID with bounded retries,
  exact checksum/size validation, and atomic local artifact replacement;
- keep the model checksum in Docker/service code rather than operator YAML and verify it during image build and
  service startup;
- bound completed WAV responses at `4194304` bytes in both the service and Node adapter;
- use the Compose `development` target with a source bind mount but without Uvicorn reload; keep runtime startup
  independent from TTS readiness and do not add a runtime dependency on TTS.

Implement:

- add a runtime/model dependency group with the explicitly pinned CPU-only PyTorch wheel while keeping it out of the
  deterministic `test` target;
- strict config and stable API schemas;
- HTTP supervisor plus inference subprocess;
- pinned standalone Silero model build input with checksum/size verification during private image build;
- model load/warmup and readiness;
- CPU-only deterministic synthesis;
- PCM16 mono 48 kHz WAV encoding;
- concurrency guard and bounded responses;
- hard worker kill/restart on timeout/crash;
- safe TTS lifecycle/delivery logs;
- runtime TTS HTTP adapter;
- extend the Phase 3 TTS Dockerfile with local `development` and final `runtime` targets plus required `linux/arm64`
  support;
- Compose `tts` service, private port, config mount, and healthcheck;
- runtime network URL without startup health gating.

The normal deterministic Python suite uses fake model engines. A separately marked integration smoke exercises the
real pinned model.

Implemented so far:

- Implemented strict bounded config parsing, HTTP validation/error mapping, PCM16 mono WAV encoding, readiness,
  concurrency gating, timeout/crash/cancellation cleanup, and background worker replacement.
- Added the `spawn`/duplex-Pipe inference worker. Only its child entry point loads and warms the verified standalone
  Silero package; the HTTP supervisor imports no PyTorch.
- Added deterministic fake-engine/child-loop/lifecycle coverage and a separate standard-library real-model smoke for
  `baya` plus alternate speaker `aidar`.
- Implemented the unwired runtime TTS HTTP adapter with one attempt, forwarded cancellation, bounded streaming,
  strict response correlation, fixed 48 kHz WAV validation, and stable synthesis/protocol failures.
- Added the pinned CPU-only runtime dependency declaration, model checksum/size build stage, development/runtime
  image targets, tracked TTS config, private Compose service, readiness healthcheck, attribution notice, and
  container-only `make lock-tts` / `make smoke-tts` workflows.
- Added `make fetch-tts-model` for verified acquisition into the Git-ignored local build context without making the
  Docker build depend on model network availability.
- Kept the deterministic `test` image model-free and kept runtime startup independent from TTS; the production
  runtime still has no TTS adapter wiring before Phase 6.

Completion evidence:

- Operator-confirmed aggregate `make test` passed with the locked containerized Python checks and complete Node
  `npm run check`; Node evidence includes typecheck, lint, format, `58` suites / `569` tests, production build, and
  built-runtime smoke.
- `make fetch-tts-model` downloaded the Google Drive artifact into the ignored local build context, verified exactly
  `145420684` bytes and SHA-256
  `50081637b602126ee06cb3bc8a744d25651d2da149ee8864b9a379bfdd934437`, and atomically installed it.
- Operator-confirmed the model-bearing Compose development image build, healthy TTS startup, and `make smoke-tts`
  with `/health`, `/ready`, `baya`, alternate speaker `aidar`, and bounded PCM16 mono 48 kHz WAV validation.
- Operator-confirmed the final `runtime` target builds for `linux/arm64` and inspects as `linux/arm64`.
- Operator-confirmed the runtime restarts and remains healthy while the TTS service is stopped.
- Deterministic Python coverage verifies malformed responses, busy admission, timeout/crash/cancellation cleanup,
  hard shutdown, readiness clearing, and background worker replacement.
- Compose evidence confirms private TTS `expose` without host `ports`, no runtime/TTS startup dependency, and the
  unchanged profile-gated networkless `tts-test`.
- Repository `git diff --check` passed.

Exit criteria:

- Phase 3 specs are green.
- Real model warmup and one `baya`/one alternate-speaker synthesis succeed.
- WAV headers/rate/channels/sample width match the contract.
- Timeout/crash clears readiness and replaces the worker.
- TTS port is not published to the host.
- The runtime can still start when TTS is stopped.
- ARM64 image construction succeeds.
- M2 is `completed`.

## Phase 5 — Discord Voice and Lost Integration RED

Status: `not-started`

Target end state: `red-expected`

Add intentional RED Node specs for:

- one shared serving Discord client with `Guilds` and `GuildVoiceStates`;
- provisioning remaining voice-free;
- exact configured voice-channel resolution and permissions;
- startup join without making HTTP readiness depend on voice readiness;
- one voice connection/player/subscription;
- WAV-to-player resource creation;
- readiness and playback watchdogs;
- stop/cleanup on player error/timeout/shutdown;
- Lost text send before speech admission;
- no Lost speech on text failure/debounce/unavailable/role;
- fixed Lost `baya` speaker and exact existing `voiceText`;
- manual and Lost sharing FIFO without overlap;
- consecutive-failure circuit and asynchronous recovery;
- manual `503` while text-only;
- runtime start rollback and shutdown ordering;
- safe lifecycle/delivery logs.

Add compile-safe integration seams without installing voice dependencies or wiring production behavior.

Run:

- focused Discord/speech/lifecycle specs;
- complete Node regression checks.

Exit criteria:

- New specs fail only for missing Discord voice/Lost/lifecycle behavior.
- Existing text-only Discord path remains green.
- No partial production voice path is reachable.
- M3 remains `not-started`.

## Phase 6 — Discord Voice and Lost Integration GREEN

Status: `not-started`

Target end state: `green`

Implement:

- `@discordjs/voice`, supported Opus dependency, and system FFmpeg;
- shared text/voice Discord serving adapter composition;
- `GuildVoiceStates` for serving;
- configured voice-channel resolve/permission/join;
- voice adapter/player/resource lifecycle;
- speech coordinator composition with TTS and voice ports;
- manual router production wiring;
- Lost enqueue immediately after successful public text send;
- text-only circuit and out-of-queue recovery;
- runtime lifecycle start/stop/rollback extensions;
- runtime Docker/Compose speech config/credentials/FFmpeg wiring;
- operator docs and safe log mappings.

Run:

- all Phase 5 specs;
- complete Node checks;
- built-runtime smoke;
- runtime image and Compose build;
- runtime start with TTS ready;
- runtime start with TTS absent/unready;
- safe shutdown during queued, synthesizing, and playing states;
- `git diff --check`.

Exit criteria:

- Phase 5 specs are green.
- No intentional RED/stub remains.
- Lost text remains independent from voice.
- Manual and Lost jobs share one sequential queue.
- Deadlines, cleanup, circuit, recovery, and shutdown work with real adapters.
- Existing GSI/health/Discord panel/text contracts remain green.
- M3 is `completed`.

## Phase 7 — ARM64, Live Discord Verification, and Handoff

Status: `not-started`

Target end state: `green`

Repository verification:

- clean Node install from committed lock;
- full Node typecheck/lint/format/test/build/smoke;
- clean Python install from committed lock;
- full Python tests/static/format checks;
- model artifact checksum verification;
- runtime and TTS image builds;
- explicit `linux/arm64` TTS image build;
- Compose config validation;
- `git diff --check`.

Container verification:

- TTS health is immediate and readiness waits for model warmup;
- runtime starts and serves text when TTS is absent;
- TTS port is not host-published;
- manual endpoint rejects missing/wrong secret;
- manual endpoint rejects invalid speaker, multiline/oversized text, unknown fields, and full queue;
- accepted manual request returns `202 + jobId`;
- `aidar` and `baya` produce distinguishable successful WAV/playback paths;
- timeout/crash replaces the inference worker;
- no model download occurs on first request;
- no secret/text/audio appears in logs.

Live Discord verification:

- bot joins the configured normal voice channel;
- Lost text appears before audio admission/playback;
- Lost uses `baya` and starts with the configured requester alias;
- manual `aidar` request uses the same queue and current connected channel;
- two accepted jobs play sequentially without overlap;
- role/debounce/unavailable/text-send-failure paths create no audio;
- stopped TTS keeps Lost text working;
- voice disconnect/player timeout releases the queue;
- two consecutive delivery failures open text-only;
- manual endpoint returns unavailable while the circuit is open;
- recovery occurs without a new interaction waiting through reconnect;
- after recovery, a new job plays successfully;
- runtime shutdown stops current audio and discards waiting jobs.

Raspberry Pi 5 verification:

- K3s node OS is 64-bit `aarch64`;
- private TTS image pulls and starts;
- model loads within available memory;
- readiness, warm synthesis latency, output size, and CPU usage are recorded;
- warm `baya` and `aidar` synthesis fit the initial runtime `7_000 ms` deadline or the measured adjustment is
  explicitly reviewed before plan completion;
- runtime, TTS, and Discord voice remain usable under the expected one-to-five-player burst;
- no thermal/resource failure invalidates the intended deployment.

Exit criteria:

- All repository, container, live Discord, and Raspberry Pi evidence is recorded.
- No intentional RED test, production stub, secret leak, raw speech log, overlap, stuck player, or queue leak remains.
- M0–M4 and Phases 0–7 are completed.
- Plan status becomes `completed` only after actual ARM64 and live voice evidence exists.
- Buy remains disabled but can later enqueue through the public speech admission API without redesigning the
  synthesis or voice pipeline.

## Acceptance Matrix

| Capability       | Required evidence                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Service boundary | Separate private Python container; runtime owns queue/Discord, TTS owns synthesis only                  |
| ARM64            | TTS image builds/runs on `linux/arm64`; real Raspberry Pi 5 evidence recorded                           |
| Model            | Pinned private `v5_5_ru`, CPU, checksum, license notice, no runtime download                            |
| Speakers         | Lost always uses `baya`; manual accepts only five fixed speakers                                        |
| TTS API          | Strict `/v1/speech`; bounded WAV bytes; stable safe errors; no path/base64/Opus                         |
| Health/readiness | HTTP health independent from warmed-model readiness                                                     |
| Cancellation     | Timeout/crash terminates and replaces inference subprocess                                              |
| Queue            | One bounded FIFO, one active job, expiry, no overlap, no retry                                          |
| Deadlines        | Independent TTS, voice-ready, and playback watchdogs                                                    |
| Cleanup          | Success/error/timeout/shutdown release buffers, aborts, player/resource/subscription, and active job    |
| Text first       | Lost public text succeeds before voice admission and never waits for speech                             |
| Lost scope       | Only accepted successfully published Lost creates recommendation speech                                 |
| Future Buy       | Queue/TTS/voice are source-neutral; Buy remains disabled and requires only a later producer             |
| Discord voice    | One existing bot/client, `GuildVoiceStates`, configured channel, `View/Connect/Speak`                   |
| Manual API       | Enabled protected POST, separate secret, strict speaker/text, `202 + jobId`, no status route            |
| Secret isolation | GSI and Discord tokens cannot authorize manual speech; TTS has no exposed/public credential             |
| Circuit          | Two consecutive delivery failures open text-only; recovery occurs outside queue/interaction             |
| Degradation      | TTS/voice unavailable keeps GSI/health/Discord text working                                             |
| Privacy          | No token, Discord user ID, alias, speech text, raw body, WAV, stack trace, or local path in logs        |
| Lifecycle        | Config fail-fast; operational speech degradation non-fatal; idempotent reverse cleanup                  |
| Compatibility    | Existing GSI, Match, Lost, panel, roles, debounce, text, and HTTP contracts stay green                  |
| Scope            | No Buy, cache, persistence, public TTS ingress, multiple channels, speech recognition, or K3s manifests |

## Status Update Rule

When implementation starts or a phase completes:

1. Keep Phase 0/M0 completed unless an approved fixed decision is explicitly reopened.
2. Set the active phase to `in-progress`; at most one GREEN/verification phase is active at a time.
3. Mark a RED phase `red-expected` only when its new specs fail for the expected missing behavior and prior coverage
   is green.
4. Do not mark a RED phase `completed`; its valid end state is `red-expected`.
5. Mark each milestone completed only with its GREEN phase.
6. Record actual commands/results in every completed GREEN and verification phase.
7. Record Docker architecture and model checksum in Phase 4 evidence.
8. Record real Discord and Raspberry Pi results in Phase 7; local mocks do not satisfy those exit criteria.
9. Resolve blockers in the affected phase instead of weakening authentication, text-first delivery, deadlines,
   cleanup, privacy, or service ownership.
10. Do not enable production routes in an intermediate phase when their downstream production consumer is still a
    stub.
11. Do not mark the plan complete while Buy was accidentally enabled, TTS is publicly exposed, model downloads occur
    at request time, or speech can overlap/stall the queue.
12. Update this document together with any approved contract/default/scope change.
