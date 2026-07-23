from collections.abc import Callable, Mapping
from typing import Protocol

from starlette.applications import Starlette

from .contracts import SpeechRequest, SynthesisResult, TtsConfiguration

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
    del configuration
    del supervisor
    del max_response_bytes
    del record_event
    raise NotImplementedError("TTS HTTP API is not implemented.")
