from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator, Callable, Mapping
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from starlette.applications import Starlette

from .api import create_tts_app
from .config import parse_tts_config
from .contracts import MAX_WAV_BYTES, TtsConfiguration
from .inference_supervisor import (
    InferenceSupervisorOptions,
    InferenceWorker,
    create_inference_supervisor,
)
from .inference_worker import SpawnedInferenceWorker

_WORKER_SHUTDOWN_TIMEOUT_MS = 1_000


def create_service_app(
    configuration: TtsConfiguration,
    *,
    create_worker: Callable[[], InferenceWorker] | None = None,
) -> Starlette:
    worker_factory: Callable[[], InferenceWorker] = create_worker or (
        lambda: SpawnedInferenceWorker(
            model_path=configuration.model_path,
            max_wav_bytes=MAX_WAV_BYTES,
        )
    )
    supervisor = create_inference_supervisor(
        InferenceSupervisorOptions(
            synthesis_timeout_ms=configuration.synthesis_timeout_ms,
            worker_shutdown_timeout_ms=_WORKER_SHUTDOWN_TIMEOUT_MS,
        ),
        worker_factory,
    )
    api = create_tts_app(
        configuration=configuration,
        supervisor=supervisor,
        max_response_bytes=MAX_WAV_BYTES,
        record_event=_record_event,
    )

    @asynccontextmanager
    async def lifespan(_: Starlette) -> AsyncIterator[None]:
        await supervisor.start()
        _record_event({"code": "TTS_SERVICE_READY", "model": configuration.model_id})
        try:
            yield
        finally:
            await supervisor.stop()
            _record_event({"code": "TTS_SERVICE_STOPPED"})

    return Starlette(routes=api.routes, lifespan=lifespan)


def main() -> None:
    configuration = _load_configuration()
    uvicorn.run(
        create_service_app(configuration),
        host=configuration.host,
        port=configuration.port,
    )


def _load_configuration() -> TtsConfiguration:
    config_path = Path(os.environ["TTS_CONFIG_PATH"])
    return parse_tts_config(config_path.read_text(encoding="utf-8"))


def _record_event(event: Mapping[str, object]) -> None:
    print(json.dumps(event, ensure_ascii=False, separators=(",", ":"), sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
