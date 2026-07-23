import asyncio
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from typing import Protocol

from .contracts import SpeechRequest, SynthesisResult, TtsServiceError


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
    return _InferenceSupervisor(options, create_worker)


class _InferenceSupervisor:
    def __init__(
        self,
        options: InferenceSupervisorOptions,
        create_worker: Callable[[], InferenceWorker],
    ) -> None:
        self._options = options
        self._create_worker = create_worker
        self._worker: InferenceWorker | None = None
        self._busy = False
        self._stopped = False
        self._replacement_task: asyncio.Task[None] | None = None

    @property
    def ready(self) -> bool:
        return self._worker is not None and not self._busy and not self._stopped

    async def start(self) -> None:
        if self._worker is not None:
            return
        self._stopped = False
        worker = self._create_worker()
        try:
            await worker.start()
        except BaseException:
            await self._dispose_worker(worker)
            raise
        self._worker = worker

    async def synthesize(self, request: SpeechRequest) -> SynthesisResult:
        worker = self._worker
        if worker is None or self._stopped:
            raise TtsServiceError("MODEL_NOT_READY")
        if self._busy:
            raise TtsServiceError("BUSY")

        self._busy = True
        try:
            try:
                result = await asyncio.wait_for(
                    worker.synthesize(request, self._options.synthesis_timeout_ms),
                    timeout=self._options.synthesis_timeout_ms / 1_000,
                )
            except TimeoutError as error:
                await self._discard_and_replace(worker)
                raise TtsServiceError("SYNTHESIS_TIMEOUT") from error
            except asyncio.CancelledError:
                await self._discard_and_replace(worker)
                raise
            except Exception as error:
                await self._discard_and_replace(worker)
                raise TtsServiceError("SYNTHESIS_FAILED") from error

            if result.request_id != request.request_id or not result.wav_bytes:
                await self._discard_and_replace(worker)
                raise TtsServiceError("SYNTHESIS_FAILED")
            return result
        finally:
            self._busy = False

    async def stop(self) -> None:
        if self._stopped:
            return
        self._stopped = True
        self._busy = False
        replacement_task = self._replacement_task
        self._replacement_task = None
        if replacement_task is not None:
            replacement_task.cancel()
            with suppress(asyncio.CancelledError):
                await replacement_task
        worker = self._worker
        self._worker = None
        if worker is not None:
            await self._dispose_worker(worker)

    async def _discard_and_replace(self, worker: InferenceWorker) -> None:
        if self._worker is worker:
            self._worker = None
        await self._dispose_worker(worker)
        if not self._stopped:
            self._replacement_task = asyncio.create_task(self._replace_worker())

    async def _replace_worker(self) -> None:
        worker = self._create_worker()
        try:
            await worker.start()
            if self._stopped:
                await self._dispose_worker(worker)
                return
            self._worker = worker
        except asyncio.CancelledError:
            await self._dispose_worker(worker)
            raise
        except Exception:
            await self._dispose_worker(worker)

    async def _dispose_worker(self, worker: InferenceWorker) -> None:
        worker.terminate()
        try:
            joined = await worker.join(self._options.worker_shutdown_timeout_ms)
            if not joined:
                worker.kill()
                await worker.join(self._options.worker_shutdown_timeout_ms)
        finally:
            worker.close()
