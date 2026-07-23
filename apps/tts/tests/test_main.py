from pathlib import Path

import pytest

from tts_service.contracts import SpeechRequest, SynthesisResult, TtsConfiguration
from tts_service.main import create_service_app


class FakeWorker:
    def __init__(self) -> None:
        self.started = 0
        self.terminated = 0
        self.closed = 0

    async def start(self) -> None:
        self.started += 1

    async def synthesize(self, request: SpeechRequest, timeout_ms: int) -> SynthesisResult:
        del timeout_ms
        return SynthesisResult(request_id=request.request_id, wav_bytes=b"RIFF")

    def terminate(self) -> None:
        self.terminated += 1

    async def join(self, timeout_ms: int) -> bool:
        del timeout_ms
        return True

    def kill(self) -> None:
        raise AssertionError("healthy worker must not be killed")

    def close(self) -> None:
        self.closed += 1


@pytest.mark.asyncio
async def test_service_lifespan_starts_warmed_worker_and_releases_it_on_shutdown() -> None:
    configuration = TtsConfiguration(
        model_id="v5_5_ru",
        model_path=Path("/opt/dota2-coach/models/v5_5_ru.pt"),
        device="cpu",
        sample_rate_hz=48_000,
        synthesis_timeout_ms=6_500,
        max_text_characters=300,
        host="0.0.0.0",
        port=8_080,
    )
    worker = FakeWorker()
    app = create_service_app(configuration, create_worker=lambda: worker)

    async with app.router.lifespan_context(app):
        assert worker.started == 1
        assert worker.terminated == 0

    assert worker.terminated == 1
    assert worker.closed == 1
