# Dota 2 Coach TTS Service

Private deterministic speech synthesis service for the Dota 2 Coach runtime. The HTTP process supervises one spawned
inference subprocess; only that subprocess imports PyTorch and owns the pinned Silero model.

From the repository root, build and run every Python check in the isolated one-shot container:

```text
docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml run --rm --build tts-test
```

The host does not need Python or `uv`.

After changing Python dependency declarations, regenerate the lock with the pinned containerized `uv`:

```text
make lock-tts
```

The private development/runtime image requires the pinned model as an untracked local build artifact. Fetch the
Google Drive mirror and verify it before building:

```text
make fetch-tts-model
```

The command downloads into a temporary `.part` file, requires the exact size `145420684` bytes and SHA-256
`50081637b602126ee06cb3bc8a744d25651d2da149ee8864b9a379bfdd934437`, then atomically replaces
`.artifacts/tts/v5_5_ru.pt`. The `.artifacts` directory is ignored by Git. The image build repeats both checks and
fails before packaging an unexpected model.

Start the normal development service without publishing its private port:

```text
docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml up --build tts
```

The development target bind-mounts `apps/tts` but intentionally does not use Uvicorn reload. The verified local model
artifact is packaged while building the development/runtime image; no model download happens during image build,
service startup, or the first request.

After the service becomes healthy, exercise the real pinned model with `baya` and an alternate speaker:

```text
make smoke-tts
```
