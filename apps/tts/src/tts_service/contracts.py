from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, TypeAlias

TtsSpeaker: TypeAlias = Literal["aidar", "baya", "kseniya", "eugene", "xenia"]
TtsErrorCode: TypeAlias = Literal[
    "INVALID_REQUEST",
    "TEXT_TOO_LONG",
    "UNSUPPORTED_SPEAKER",
    "BUSY",
    "MODEL_NOT_READY",
    "SYNTHESIS_TIMEOUT",
    "SYNTHESIS_FAILED",
]

SUPPORTED_SPEAKERS: tuple[TtsSpeaker, ...] = ("aidar", "baya", "kseniya", "eugene", "xenia")
MODEL_ID: Final = "v5_5_ru"
MODEL_PATH: Final = Path("/opt/dota2-coach/models/v5_5_ru.pt")
MODEL_SIZE_BYTES: Final = 145_420_684
MODEL_SHA256: Final = "50081637b602126ee06cb3bc8a744d25651d2da149ee8864b9a379bfdd934437"
DEVICE: Final = "cpu"
SAMPLE_RATE_HZ: Final = 48_000
SYNTHESIS_TIMEOUT_MS: Final = 6_500
MAX_TEXT_CHARACTERS: Final = 300
HOST: Final = "0.0.0.0"
PORT: Final = 8_080
MAX_WAV_BYTES: Final = 4_194_304
MAX_REQUEST_BODY_BYTES: Final = 4_096


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
