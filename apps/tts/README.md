# Dota 2 Coach TTS Service

Private deterministic speech synthesis service for the Dota 2 Coach runtime.

The Phase 3 package contains compile-safe contracts and intentional RED tests only. It does not contain PyTorch,
Silero model weights, a listening production service, or runtime Compose wiring.

From the repository root, build and run every Python check in the isolated one-shot container:

```text
docker compose --project-directory ops/dev -f ops/dev/docker-compose.yml run --rm --build tts-test
```

The host does not need Python or `uv`.
