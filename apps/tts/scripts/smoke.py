from __future__ import annotations

import io
import json
import os
import wave
from collections.abc import Mapping
from urllib.request import Request, urlopen

MAX_WAV_BYTES = 4_194_304
BASE_URL = os.environ.get("TTS_SMOKE_BASE_URL", "http://127.0.0.1:8080")


def main() -> None:
    assert_json("/health", {"status": "ok"})
    assert_json("/ready", {"status": "ready", "model": "v5_5_ru", "device": "cpu"})

    results = {
        speaker: synthesize(speaker, request_id)
        for speaker, request_id in (("baya", "smoke-baya"), ("aidar", "smoke-aidar"))
    }
    print(json.dumps({"status": "ok", "wavBytes": results}, separators=(",", ":"), sort_keys=True))


def assert_json(path: str, expected: Mapping[str, object]) -> None:
    with urlopen(f"{BASE_URL}{path}", timeout=10) as response:
        document = json.load(response)
        if response.status != 200 or document != expected:
            raise RuntimeError("TTS_SMOKE_HTTP_FAILED")


def synthesize(speaker: str, request_id: str) -> int:
    body = json.dumps(
        {
            "requestId": request_id,
            "speaker": speaker,
            "text": "Проверка синтеза речи.",
        },
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode()
    request = Request(
        f"{BASE_URL}/v1/speech",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        wav_bytes = response.read(MAX_WAV_BYTES + 1)
        if (
            response.status != 200
            or response.headers.get_content_type() != "audio/wav"
            or response.headers["X-TTS-Request-Id"] != request_id
            or response.headers["X-TTS-Sample-Rate"] != "48000"
            or len(wav_bytes) > MAX_WAV_BYTES
        ):
            raise RuntimeError("TTS_SMOKE_PROTOCOL_FAILED")

    with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2 or wav.getframerate() != 48_000 or wav.getnframes() == 0:
            raise RuntimeError("TTS_SMOKE_WAV_FAILED")
    return len(wav_bytes)


if __name__ == "__main__":
    main()
