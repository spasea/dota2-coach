from __future__ import annotations

import asyncio
import multiprocessing
from contextlib import suppress
from dataclasses import dataclass
from multiprocessing.connection import Connection
from multiprocessing.context import BaseContext
from multiprocessing.process import BaseProcess
from pathlib import Path

from .contracts import SpeechRequest, SynthesisResult


@dataclass(frozen=True, slots=True)
class _SynthesizeCommand:
    request: SpeechRequest


@dataclass(frozen=True, slots=True)
class _WorkerReady:
    pass


@dataclass(frozen=True, slots=True)
class _WorkerSuccess:
    result: SynthesisResult


@dataclass(frozen=True, slots=True)
class _WorkerFailure:
    pass


class SpawnedInferenceWorker:
    def __init__(
        self,
        model_path: Path,
        max_wav_bytes: int,
        *,
        context: BaseContext | None = None,
    ) -> None:
        process_context = context or multiprocessing.get_context("spawn")
        parent_connection, child_connection = process_context.Pipe(duplex=True)
        self._connection = parent_connection
        self._child_connection = child_connection
        self._process: BaseProcess = process_context.Process(
            target=_worker_main,
            args=(child_connection, model_path, max_wav_bytes),
            name="tts-inference",
            daemon=True,
        )
        self._started = False

    async def start(self) -> None:
        self._process.start()
        self._started = True
        self._child_connection.close()
        message = await asyncio.to_thread(self._connection.recv)
        if not isinstance(message, _WorkerReady):
            raise RuntimeError("WORKER_START_FAILED")

    async def synthesize(self, request: SpeechRequest, timeout_ms: int) -> SynthesisResult:
        await asyncio.to_thread(self._connection.send, _SynthesizeCommand(request))
        has_response = await asyncio.to_thread(self._connection.poll, timeout_ms / 1_000)
        if not has_response:
            raise TimeoutError
        message = await asyncio.to_thread(self._connection.recv)
        if not isinstance(message, _WorkerSuccess):
            raise RuntimeError("WORKER_SYNTHESIS_FAILED")
        return message.result

    def terminate(self) -> None:
        if self._started and self._process.is_alive():
            self._process.terminate()

    async def join(self, timeout_ms: int) -> bool:
        if not self._started:
            return True
        await asyncio.to_thread(self._process.join, timeout_ms / 1_000)
        return not self._process.is_alive()

    def kill(self) -> None:
        if self._started and self._process.is_alive():
            self._process.kill()

    def close(self) -> None:
        self._connection.close()
        self._child_connection.close()
        if self._started and not self._process.is_alive():
            self._process.close()


def _worker_main(
    connection: Connection,
    model_path: Path,
    max_wav_bytes: int,
) -> None:
    from .silero_engine import load_silero_engine
    from .wav import encode_pcm16_mono_wav

    try:
        engine = load_silero_engine(model_path)
        engine.warm_up()
        connection.send(_WorkerReady())
        while True:
            command = connection.recv()
            if not isinstance(command, _SynthesizeCommand):
                connection.send(_WorkerFailure())
                return
            samples = engine.synthesize(command.request.text, command.request.speaker)
            wav_bytes = encode_pcm16_mono_wav(samples, max_wav_bytes)
            connection.send(
                _WorkerSuccess(
                    SynthesisResult(
                        request_id=command.request.request_id,
                        wav_bytes=wav_bytes,
                    )
                )
            )
    except (EOFError, KeyboardInterrupt):
        return
    except Exception:
        with suppress(BrokenPipeError, EOFError, OSError):
            connection.send(_WorkerFailure())
    finally:
        connection.close()
