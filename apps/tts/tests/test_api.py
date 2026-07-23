from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pytest

from tts_service.api import create_tts_app
from tts_service.contracts import SpeechRequest, SynthesisResult, TtsConfiguration, TtsServiceError


@pytest.mark.asyncio
async def test_health_reports_the_http_supervisor_even_while_inference_is_unready() -> None:
    async with create_client(ready=False) as (client, _, _):
        response = await client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readiness_reports_the_warmed_fixed_model_and_device() -> None:
    async with create_client(ready=True) as (client, _, _):
        response = await client.get("/ready")

        assert response.status_code == 200
        assert response.json() == {"status": "ready", "model": "v5_5_ru", "device": "cpu"}


@pytest.mark.asyncio
async def test_readiness_is_unavailable_while_the_worker_is_loading_or_replacing() -> None:
    async with create_client(ready=False) as (client, _, _):
        response = await client.get("/ready")

        assert response.status_code == 503
        assert response.json() == {"error": {"code": "MODEL_NOT_READY"}}


@pytest.mark.asyncio
async def test_returns_the_bounded_correlated_wav_response() -> None:
    async with create_client(ready=True) as (client, supervisor, events):
        response = await client.post(
            "/v1/speech",
            json={
                "requestId": "speech-job-01",
                "speaker": "baya",
                "text": "Fire, защищай нижнюю башню.",
            },
        )

        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        assert response.headers["x-tts-request-id"] == "speech-job-01"
        assert response.headers["x-tts-sample-rate"] == "48000"
        assert response.content == valid_wav_bytes()
        assert supervisor.requests == [
            SpeechRequest(
                request_id="speech-job-01",
                speaker="baya",
                text="Fire, защищай нижнюю башню.",
            )
        ]
        assert events == [
            {
                "code": "TTS_SYNTHESIS_COMPLETED",
                "requestId": "speech-job-01",
                "model": "v5_5_ru",
                "speaker": "baya",
                "status": "completed",
                "outputBytes": len(valid_wav_bytes()),
            }
        ]


@pytest.mark.parametrize(
    ("body", "status", "code"),
    [
        (None, 400, "INVALID_REQUEST"),
        ({}, 400, "INVALID_REQUEST"),
        ({"requestId": "speech-job-01", "speaker": "baya", "text": "ok", "extra": True}, 400, "INVALID_REQUEST"),
        ({"requestId": "", "speaker": "baya", "text": "ok"}, 400, "INVALID_REQUEST"),
        ({"requestId": "speech-job-01", "speaker": "random", "text": "ok"}, 422, "UNSUPPORTED_SPEAKER"),
        ({"requestId": "speech-job-01", "speaker": "baya", "text": ""}, 400, "INVALID_REQUEST"),
        ({"requestId": "speech-job-01", "speaker": "baya", "text": "line one\nline two"}, 400, "INVALID_REQUEST"),
        ({"requestId": "speech-job-01", "speaker": "baya", "text": "a" * 301}, 413, "TEXT_TOO_LONG"),
    ],
)
@pytest.mark.asyncio
async def test_rejects_invalid_requests_with_stable_bounded_errors(
    body: object,
    status: int,
    code: str,
) -> None:
    async with create_client(ready=True) as (client, supervisor, _):
        response = await client.post("/v1/speech", json=body)

        assert response.status_code == status
        assert response.json() == {"error": {"code": code}}
        assert supervisor.requests == []


@pytest.mark.parametrize(
    ("service_code", "status"),
    [
        ("BUSY", 429),
        ("MODEL_NOT_READY", 503),
        ("SYNTHESIS_TIMEOUT", 504),
        ("SYNTHESIS_FAILED", 500),
    ],
)
@pytest.mark.asyncio
async def test_maps_supervisor_failures_without_leaking_internal_details(service_code: str, status: int) -> None:
    error = TtsServiceError(service_code)  # type: ignore[arg-type]
    error.__cause__ = RuntimeError("private text /opt/dota2-coach/models/v5_5_ru.pt traceback")
    async with create_client(ready=True, error=error) as (client, _, _):
        response = await client.post(
            "/v1/speech",
            json={"requestId": "speech-job-01", "speaker": "aidar", "text": "Проверка."},
        )

        assert response.status_code == status
        assert response.json() == {"error": {"code": service_code}}
        assert "Проверка" not in response.text
        assert "/opt/dota2-coach" not in response.text
        assert "traceback" not in response.text


@pytest.mark.asyncio
async def test_rejects_a_completed_wav_larger_than_the_api_bound() -> None:
    async with create_client(ready=True, wav_bytes=b"x" * 1_025) as (client, _, _):
        response = await client.post(
            "/v1/speech",
            json={"requestId": "speech-job-01", "speaker": "xenia", "text": "Проверка."},
        )

        assert response.status_code == 500
        assert response.json() == {"error": {"code": "SYNTHESIS_FAILED"}}


class FakeSupervisor:
    def __init__(
        self,
        *,
        ready: bool,
        wav_bytes: bytes,
        error: TtsServiceError | None,
    ) -> None:
        self._ready = ready
        self._wav_bytes = wav_bytes
        self._error = error
        self.requests: list[SpeechRequest] = []

    @property
    def ready(self) -> bool:
        return self._ready

    async def synthesize(self, request: SpeechRequest) -> SynthesisResult:
        self.requests.append(request)
        if self._error is not None:
            raise self._error
        return SynthesisResult(request_id=request.request_id, wav_bytes=self._wav_bytes)


@asynccontextmanager
async def create_client(
    *,
    ready: bool,
    wav_bytes: bytes | None = None,
    error: TtsServiceError | None = None,
) -> AsyncIterator[tuple[httpx.AsyncClient, FakeSupervisor, list[Mapping[str, object]]]]:
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
    supervisor = FakeSupervisor(
        ready=ready,
        wav_bytes=wav_bytes if wav_bytes is not None else valid_wav_bytes(),
        error=error,
    )
    events: list[Mapping[str, object]] = []
    app = create_tts_app(
        configuration=configuration,
        supervisor=supervisor,
        max_response_bytes=1_024,
        record_event=events.append,
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://tts.test",
    ) as client:
        yield client, supervisor, events


def valid_wav_bytes() -> bytes:
    return b"RIFF\x26\x00\x00\x00WAVEfmt " + bytes(30)
