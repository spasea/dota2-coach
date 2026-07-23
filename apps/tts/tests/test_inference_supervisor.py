from __future__ import annotations

import asyncio

import pytest

from tts_service.contracts import SpeechRequest, SynthesisResult, TtsServiceError
from tts_service.inference_supervisor import (
    InferenceSupervisor,
    InferenceSupervisorOptions,
    InferenceWorker,
    create_inference_supervisor,
)


class FakeWorker(InferenceWorker):
    def __init__(
        self,
        *,
        result: SynthesisResult | None = None,
        synthesize_error: Exception | None = None,
        join_result: bool = True,
        blocked: bool = False,
        start_blocked: bool = False,
    ) -> None:
        self.result = result or SynthesisResult(request_id="request-1", wav_bytes=b"RIFF")
        self.synthesize_error = synthesize_error
        self.join_result = join_result
        self.blocked = blocked
        self.start_blocked = start_blocked
        self.started = 0
        self.terminated = 0
        self.joined = 0
        self.killed = 0
        self.closed = 0
        self.requests: list[SpeechRequest] = []
        self.timeouts: list[int] = []
        self.synthesis_started = asyncio.Event()
        self.release_synthesis = asyncio.Event()
        self.start_started = asyncio.Event()
        self.release_start = asyncio.Event()

    async def start(self) -> None:
        self.started += 1
        self.start_started.set()
        if self.start_blocked:
            await self.release_start.wait()

    async def synthesize(self, request: SpeechRequest, timeout_ms: int) -> SynthesisResult:
        self.requests.append(request)
        self.timeouts.append(timeout_ms)
        self.synthesis_started.set()
        if self.blocked:
            await self.release_synthesis.wait()
        if self.synthesize_error is not None:
            raise self.synthesize_error
        return self.result

    def terminate(self) -> None:
        self.terminated += 1

    async def join(self, timeout_ms: int) -> bool:
        del timeout_ms
        self.joined += 1
        return self.join_result

    def kill(self) -> None:
        self.killed += 1

    def close(self) -> None:
        self.closed += 1


class WorkerFactory:
    def __init__(self, workers: list[FakeWorker]) -> None:
        self._workers = iter(workers)

    def __call__(self) -> FakeWorker:
        return next(self._workers)


def options(*, timeout_ms: int = 20) -> InferenceSupervisorOptions:
    return InferenceSupervisorOptions(
        synthesis_timeout_ms=timeout_ms,
        worker_shutdown_timeout_ms=10,
    )


def speech_request(request_id: str = "request-1") -> SpeechRequest:
    return SpeechRequest(
        request_id=request_id,
        speaker="baya",
        text="Защищай нижнюю башню.",
    )


@pytest.mark.asyncio
async def test_start_warms_worker_before_reporting_ready() -> None:
    worker = FakeWorker()
    supervisor = create_inference_supervisor(options(), WorkerFactory([worker]))

    assert not supervisor.ready

    await supervisor.start()

    assert supervisor.ready
    assert worker.started == 1


@pytest.mark.asyncio
async def test_only_one_synthesis_can_run_at_a_time() -> None:
    worker = FakeWorker(blocked=True)
    supervisor = create_inference_supervisor(options(timeout_ms=1_000), WorkerFactory([worker]))
    await supervisor.start()

    first_request = asyncio.create_task(supervisor.synthesize(speech_request("first")))
    await worker.synthesis_started.wait()
    assert not supervisor.ready

    with pytest.raises(TtsServiceError, match="BUSY") as error:
        await supervisor.synthesize(speech_request("second"))

    assert error.value.code == "BUSY"
    worker.release_synthesis.set()
    assert await first_request == worker.result
    assert worker.timeouts == [1_000]
    assert supervisor.ready


@pytest.mark.asyncio
async def test_timeout_replaces_worker_and_returns_stable_error() -> None:
    timed_out_worker = FakeWorker(blocked=True)
    replacement = FakeWorker(start_blocked=True)
    supervisor = create_inference_supervisor(options(), WorkerFactory([timed_out_worker, replacement]))
    await supervisor.start()

    with pytest.raises(TtsServiceError) as error:
        await supervisor.synthesize(speech_request())

    assert error.value.code == "SYNTHESIS_TIMEOUT"
    assert timed_out_worker.terminated == 1
    assert timed_out_worker.joined == 1
    assert timed_out_worker.closed == 1
    assert not supervisor.ready
    await replacement.start_started.wait()
    assert replacement.started == 1
    assert not supervisor.ready
    replacement.release_start.set()
    await wait_until_ready(supervisor)
    assert supervisor.ready


@pytest.mark.asyncio
async def test_crashed_worker_is_replaced_and_failure_is_normalized() -> None:
    crashed_worker = FakeWorker(synthesize_error=RuntimeError("model internals"))
    replacement = FakeWorker(start_blocked=True)
    supervisor = create_inference_supervisor(options(), WorkerFactory([crashed_worker, replacement]))
    await supervisor.start()

    with pytest.raises(TtsServiceError) as error:
        await supervisor.synthesize(speech_request())

    assert error.value.code == "SYNTHESIS_FAILED"
    assert "model internals" not in str(error.value)
    assert crashed_worker.closed == 1
    assert not supervisor.ready
    await replacement.start_started.wait()
    assert replacement.started == 1
    replacement.release_start.set()
    await wait_until_ready(supervisor)


@pytest.mark.asyncio
async def test_malformed_worker_response_is_discarded_and_worker_is_replaced() -> None:
    malformed_worker = FakeWorker(result=SynthesisResult(request_id="stale-request", wav_bytes=b"RIFF"))
    replacement = FakeWorker(start_blocked=True)
    supervisor = create_inference_supervisor(options(), WorkerFactory([malformed_worker, replacement]))
    await supervisor.start()

    with pytest.raises(TtsServiceError) as error:
        await supervisor.synthesize(speech_request("current-request"))

    assert error.value.code == "SYNTHESIS_FAILED"
    assert malformed_worker.terminated == 1
    assert malformed_worker.joined == 1
    assert malformed_worker.closed == 1
    assert not supervisor.ready
    await replacement.start_started.wait()
    assert replacement.started == 1
    assert not supervisor.ready
    replacement.release_start.set()
    await wait_until_ready(supervisor)
    assert supervisor.ready


@pytest.mark.asyncio
async def test_shutdown_uses_kill_when_worker_does_not_join() -> None:
    unresponsive_worker = FakeWorker(blocked=True, join_result=False)
    replacement = FakeWorker()
    supervisor = create_inference_supervisor(options(), WorkerFactory([unresponsive_worker, replacement]))
    await supervisor.start()

    with pytest.raises(TtsServiceError):
        await supervisor.synthesize(speech_request())

    assert unresponsive_worker.terminated == 1
    assert unresponsive_worker.killed == 1
    assert unresponsive_worker.closed == 1


@pytest.mark.asyncio
async def test_cancellation_discards_worker_before_next_request() -> None:
    cancelled_worker = FakeWorker(blocked=True)
    replacement = FakeWorker(start_blocked=True)
    supervisor = create_inference_supervisor(
        options(timeout_ms=1_000),
        WorkerFactory([cancelled_worker, replacement]),
    )
    await supervisor.start()

    request = asyncio.create_task(supervisor.synthesize(speech_request()))
    await cancelled_worker.synthesis_started.wait()
    request.cancel()

    with pytest.raises(asyncio.CancelledError):
        await request

    assert cancelled_worker.terminated == 1
    assert cancelled_worker.closed == 1
    assert not supervisor.ready
    await replacement.start_started.wait()
    assert replacement.started == 1
    replacement.release_start.set()
    await wait_until_ready(supervisor)
    assert await supervisor.synthesize(speech_request("next")) == replacement.result


@pytest.mark.asyncio
async def test_stop_is_idempotent_and_clears_readiness() -> None:
    worker = FakeWorker()
    supervisor = create_inference_supervisor(options(), WorkerFactory([worker]))
    await supervisor.start()

    await supervisor.stop()
    await supervisor.stop()

    assert not supervisor.ready
    assert worker.terminated == 1
    assert worker.closed == 1


async def wait_until_ready(supervisor: InferenceSupervisor) -> None:
    for _ in range(100):
        if supervisor.ready:
            return
        await asyncio.sleep(0)
    raise AssertionError("supervisor did not become ready")
