from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

TtsSpeaker: TypeAlias = Literal["aidar", "baya", "kseniya", "xenia", "eugene"]
TtsErrorCode: TypeAlias = Literal[
    "INVALID_REQUEST",
    "TEXT_TOO_LONG",
    "UNSUPPORTED_SPEAKER",
    "BUSY",
    "MODEL_NOT_READY",
    "SYNTHESIS_TIMEOUT",
    "SYNTHESIS_FAILED",
]

SUPPORTED_SPEAKERS: tuple[TtsSpeaker, ...] = ("aidar", "baya", "kseniya", "xenia", "eugene")
MODEL_ID = "v5_5_ru"
DEVICE = "cpu"
SAMPLE_RATE_HZ = 48_000


@dataclass(frozen=True, slots=True)
class TtsConfiguration:
    model_id: Literal["v5_5_ru"]
    model_path: Path
    device: Literal["cpu"]
    sample_rate_hz: Literal[48_000]
    synthesis_timeout_ms: int
    max_text_characters: int
    host: str
    port: int


@dataclass(frozen=True, slots=True)
class SpeechRequest:
    request_id: str
    speaker: TtsSpeaker
    text: str


@dataclass(frozen=True, slots=True)
class SynthesisResult:
    request_id: str
    wav_bytes: bytes


class TtsServiceError(RuntimeError):
    code: TtsErrorCode

    def __init__(self, code: TtsErrorCode) -> None:
        super().__init__(code)
        self.code = code
