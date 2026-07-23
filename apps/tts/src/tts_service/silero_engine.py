from __future__ import annotations

import hashlib
import importlib
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Protocol, cast

from .contracts import (
    DEVICE,
    MODEL_SHA256,
    MODEL_SIZE_BYTES,
    SAMPLE_RATE_HZ,
    SUPPORTED_SPEAKERS,
    TtsSpeaker,
)


class ModelArtifactError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("MODEL_ARTIFACT_INVALID")


class SileroEngine(Protocol):
    def warm_up(self) -> None: ...

    def synthesize(self, text: str, speaker: TtsSpeaker) -> Sequence[float]: ...


class SileroModel(Protocol):
    speakers: Sequence[str]

    def to(self, device: str) -> object: ...

    def apply_tts(
        self,
        *,
        text: str,
        speaker: str,
        sample_rate: int,
        put_accent: bool,
        put_yo: bool,
        put_stress_homo: bool,
        put_yo_homo: bool,
    ) -> _AudioSamples: ...


class _AudioSamples(Protocol):
    def tolist(self) -> list[float]: ...


ArtifactVerifier = Callable[[Path], None]
ModelLoader = Callable[[Path], SileroModel]


class _PackagedSileroEngine:
    def __init__(self, model: SileroModel) -> None:
        if set(model.speakers) != set(SUPPORTED_SPEAKERS):
            raise ModelArtifactError
        model.to(DEVICE)
        self._model = model

    def warm_up(self) -> None:
        self.synthesize("Проверка.", "baya")

    def synthesize(self, text: str, speaker: TtsSpeaker) -> Sequence[float]:
        samples = self._model.apply_tts(
            text=text,
            speaker=speaker,
            sample_rate=SAMPLE_RATE_HZ,
            put_accent=True,
            put_yo=True,
            put_stress_homo=True,
            put_yo_homo=True,
        )
        return tuple(float(sample) for sample in samples.tolist())


def load_silero_engine(
    model_path: Path,
    *,
    verify_artifact: ArtifactVerifier | None = None,
    load_model: ModelLoader | None = None,
) -> SileroEngine:
    (verify_artifact or verify_model_artifact)(model_path)
    model = (load_model or _load_packaged_model)(model_path)
    return _PackagedSileroEngine(model)


def verify_model_artifact(
    model_path: Path,
    *,
    expected_size_bytes: int = MODEL_SIZE_BYTES,
    expected_sha256: str = MODEL_SHA256,
) -> None:
    try:
        if model_path.stat().st_size != expected_size_bytes:
            raise ModelArtifactError
        digest = hashlib.sha256()
        with model_path.open("rb") as model_file:
            for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected_sha256:
            raise ModelArtifactError
    except OSError as error:
        raise ModelArtifactError from error


def _load_packaged_model(model_path: Path) -> SileroModel:
    torch = importlib.import_module("torch")
    importer = torch.package.PackageImporter(str(model_path))
    return cast(SileroModel, importer.load_pickle("tts_models", "model"))
