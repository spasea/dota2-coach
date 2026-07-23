import io
import wave
from collections.abc import Sequence
from multiprocessing.connection import Connection
from pathlib import Path
from typing import cast

import pytest

import tts_service.silero_engine
from tts_service.contracts import SpeechRequest, TtsSpeaker
from tts_service.inference_worker import (
    _SynthesizeCommand,
    _worker_main,
    _WorkerFailure,
    _WorkerReady,
    _WorkerSuccess,
)
from tts_service.silero_engine import SileroEngine


class FakeConnection:
    def __init__(self, commands: list[object]) -> None:
        self._commands = iter(commands)
        self.sent: list[object] = []
        self.closed = False

    def recv(self) -> object:
        try:
            return next(self._commands)
        except StopIteration as error:
            raise EOFError from error

    def send(self, message: object) -> None:
        self.sent.append(message)

    def close(self) -> None:
        self.closed = True


class FakeEngine:
    def __init__(self, synthesis_error: Exception | None = None) -> None:
        self.synthesis_error = synthesis_error
        self.warmed = False
        self.calls: list[tuple[str, TtsSpeaker]] = []

    def warm_up(self) -> None:
        self.warmed = True

    def synthesize(self, text: str, speaker: TtsSpeaker) -> Sequence[float]:
        self.calls.append((text, speaker))
        if self.synthesis_error is not None:
            raise self.synthesis_error
        return [0.0, 0.25]


def test_child_loads_and_warms_before_returning_a_correlated_wav(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = SpeechRequest(request_id="request-1", speaker="baya", text="Проверка.")
    connection = FakeConnection([_SynthesizeCommand(request)])
    engine = FakeEngine()
    loaded_paths: list[Path] = []

    def load_engine(model_path: Path) -> SileroEngine:
        loaded_paths.append(model_path)
        return engine

    monkeypatch.setattr(tts_service.silero_engine, "load_silero_engine", load_engine)

    _worker_main(cast(Connection, connection), Path("/model.pt"), 1_024)

    assert loaded_paths == [Path("/model.pt")]
    assert engine.warmed
    assert engine.calls == [("Проверка.", "baya")]
    assert isinstance(connection.sent[0], _WorkerReady)
    success = connection.sent[1]
    assert isinstance(success, _WorkerSuccess)
    assert success.result.request_id == "request-1"
    with wave.open(io.BytesIO(success.result.wav_bytes), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 48_000
    assert connection.closed


def test_child_returns_only_a_bounded_failure_when_inference_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = SpeechRequest(request_id="request-1", speaker="baya", text="private text")
    connection = FakeConnection([_SynthesizeCommand(request)])
    engine = FakeEngine(RuntimeError("private model path and traceback"))
    monkeypatch.setattr(tts_service.silero_engine, "load_silero_engine", lambda _: engine)

    _worker_main(cast(Connection, connection), Path("/private/model.pt"), 1_024)

    assert isinstance(connection.sent[0], _WorkerReady)
    failure = connection.sent[1]
    assert isinstance(failure, _WorkerFailure)
    assert repr(failure) == "_WorkerFailure()"
    assert connection.closed
