from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from .contracts import SpeechRequest, SynthesisResult


@dataclass(frozen=True, slots=True)
class InferenceSupervisorOptions:
    synthesis_timeout_ms: int
    worker_shutdown_timeout_ms: int


class InferenceWorker(Protocol):
    async def start(self) -> None: ...

    async def synthesize(self, request: SpeechRequest, timeout_ms: int) -> SynthesisResult: ...

    def terminate(self) -> None: ...

    async def join(self, timeout_ms: int) -> bool: ...

    def kill(self) -> None: ...

    def close(self) -> None: ...


class InferenceSupervisor(Protocol):
    @property
    def ready(self) -> bool: ...

    async def start(self) -> None: ...

    async def synthesize(self, request: SpeechRequest) -> SynthesisResult: ...

    async def stop(self) -> None: ...


def create_inference_supervisor(
    options: InferenceSupervisorOptions,
    create_worker: Callable[[], InferenceWorker],
) -> InferenceSupervisor:
    del options
    del create_worker
    raise NotImplementedError("TTS inference supervisor is not implemented.")
