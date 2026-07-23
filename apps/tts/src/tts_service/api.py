import json
from collections.abc import Callable, Mapping
from typing import Protocol

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from .contracts import (
    MAX_REQUEST_BODY_BYTES,
    SUPPORTED_SPEAKERS,
    SpeechRequest,
    SynthesisResult,
    TtsConfiguration,
    TtsServiceError,
)

TtsEventRecorder = Callable[[Mapping[str, object]], None]


class TtsApiSupervisor(Protocol):
    @property
    def ready(self) -> bool: ...

    async def synthesize(self, request: SpeechRequest) -> SynthesisResult: ...


def create_tts_app(
    configuration: TtsConfiguration,
    supervisor: TtsApiSupervisor,
    max_response_bytes: int,
    record_event: TtsEventRecorder,
) -> Starlette:
    async def health(_: Request) -> Response:
        return JSONResponse({"status": "ok"})

    async def ready(_: Request) -> Response:
        if not supervisor.ready:
            return _error_response("MODEL_NOT_READY", 503)
        return JSONResponse(
            {
                "status": "ready",
                "model": configuration.model_id,
                "device": configuration.device,
            }
        )

    async def synthesize(request: Request) -> Response:
        parsed = await _parse_request(request, configuration.max_text_characters)
        if isinstance(parsed, Response):
            return parsed

        try:
            result = await supervisor.synthesize(parsed)
        except TtsServiceError as error:
            return _error_response(error.code, _SERVICE_ERROR_STATUSES[error.code])

        if result.request_id != parsed.request_id or not result.wav_bytes or len(result.wav_bytes) > max_response_bytes:
            return _error_response("SYNTHESIS_FAILED", 500)

        record_event(
            {
                "code": "TTS_SYNTHESIS_COMPLETED",
                "requestId": parsed.request_id,
                "model": configuration.model_id,
                "speaker": parsed.speaker,
                "status": "completed",
                "outputBytes": len(result.wav_bytes),
            }
        )
        return Response(
            result.wav_bytes,
            media_type="audio/wav",
            headers={
                "X-TTS-Request-Id": parsed.request_id,
                "X-TTS-Sample-Rate": str(configuration.sample_rate_hz),
            },
        )

    return Starlette(
        routes=[
            Route("/health", health, methods=["GET"]),
            Route("/ready", ready, methods=["GET"]),
            Route("/v1/speech", synthesize, methods=["POST"]),
        ]
    )


_SERVICE_ERROR_STATUSES = {
    "BUSY": 429,
    "MODEL_NOT_READY": 503,
    "SYNTHESIS_TIMEOUT": 504,
    "SYNTHESIS_FAILED": 500,
}


async def _parse_request(request: Request, max_text_characters: int) -> SpeechRequest | Response:
    content_type = request.headers.get("content-type", "").partition(";")[0].strip().lower()
    if content_type != "application/json":
        return _error_response("INVALID_REQUEST", 400)

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            parsed_content_length = int(content_length)
            if parsed_content_length < 0 or parsed_content_length > MAX_REQUEST_BODY_BYTES:
                return _error_response("INVALID_REQUEST", 400)
        except ValueError:
            return _error_response("INVALID_REQUEST", 400)

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST_BODY_BYTES:
            return _error_response("INVALID_REQUEST", 400)
    try:
        document = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _error_response("INVALID_REQUEST", 400)

    if not isinstance(document, dict) or set(document) != {"requestId", "speaker", "text"}:
        return _error_response("INVALID_REQUEST", 400)
    request_id = document["requestId"]
    speaker = document["speaker"]
    text = document["text"]
    if (
        not isinstance(request_id, str)
        or not request_id
        or "\n" in request_id
        or "\r" in request_id
        or not isinstance(speaker, str)
        or not isinstance(text, str)
        or not text.strip()
        or "\n" in text
        or "\r" in text
    ):
        return _error_response("INVALID_REQUEST", 400)
    if speaker not in SUPPORTED_SPEAKERS:
        return _error_response("UNSUPPORTED_SPEAKER", 422)
    if len(text) > max_text_characters:
        return _error_response("TEXT_TOO_LONG", 413)

    return SpeechRequest(
        request_id=request_id,
        speaker=speaker,
        text=text,
    )


def _error_response(code: str, status_code: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code}}, status_code=status_code)
