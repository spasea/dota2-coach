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

Start the normal development service without publishing its private port:

```text
docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml up --build tts
```

The development target bind-mounts `apps/tts` but intentionally does not use Uvicorn reload. Model download and
checksum verification happen while building the development/runtime image, never on service startup or first
request.

After the service becomes healthy, exercise the real pinned model with `baya` and an alternate speaker:

```text
make smoke-tts
```
