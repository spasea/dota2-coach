import hashlib
from pathlib import Path

import pytest

from tts_service.silero_engine import (
    ModelArtifactError,
    SileroModel,
    load_silero_engine,
    verify_model_artifact,
)


class FakeSamples:
    def __init__(self, values: list[float]) -> None:
        self._values = values

    def tolist(self) -> list[float]:
        return self._values


class FakeModel:
    def __init__(self, speakers: list[str] | None = None) -> None:
        self.speakers = speakers or ["aidar", "baya", "kseniya", "eugene", "xenia"]
        self.devices: list[str] = []
        self.calls: list[dict[str, object]] = []

    def to(self, device: str) -> object:
        self.devices.append(device)
        return self

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
    ) -> FakeSamples:
        self.calls.append(
            {
                "text": text,
                "speaker": speaker,
                "sample_rate": sample_rate,
                "put_accent": put_accent,
                "put_yo": put_yo,
                "put_stress_homo": put_stress_homo,
                "put_yo_homo": put_yo_homo,
            }
        )
        return FakeSamples([0.0, 0.25, -0.25])


def test_loads_the_verified_cpu_model_and_synthesizes_with_fixed_options(tmp_path: Path) -> None:
    model_path = tmp_path / "model.pt"
    model_path.write_bytes(b"model")
    model = FakeModel()
    verified: list[Path] = []
    loaded: list[Path] = []

    def load_model(path: Path) -> SileroModel:
        loaded.append(path)
        return model

    engine = load_silero_engine(
        model_path,
        verify_artifact=verified.append,
        load_model=load_model,
    )

    assert engine.synthesize("Защищай башню.", "baya") == (0.0, 0.25, -0.25)
    assert verified == [model_path]
    assert loaded == [model_path]
    assert model.devices == ["cpu"]
    assert model.calls == [
        {
            "text": "Защищай башню.",
            "speaker": "baya",
            "sample_rate": 48_000,
            "put_accent": True,
            "put_yo": True,
            "put_stress_homo": True,
            "put_yo_homo": True,
        }
    ]


def test_warmup_runs_real_inference_before_readiness(tmp_path: Path) -> None:
    model = FakeModel()
    engine = load_silero_engine(
        tmp_path / "model.pt",
        verify_artifact=lambda _: None,
        load_model=lambda _: model,
    )

    engine.warm_up()

    assert len(model.calls) == 1
    assert model.calls[0]["speaker"] == "baya"


def test_rejects_an_unexpected_model_speaker_contract(tmp_path: Path) -> None:
    model = FakeModel(speakers=["baya"])

    with pytest.raises(ModelArtifactError, match=r"^MODEL_ARTIFACT_INVALID$"):
        load_silero_engine(
            tmp_path / "model.pt",
            verify_artifact=lambda _: None,
            load_model=lambda _: model,
        )


def test_verifies_model_size_and_sha256(tmp_path: Path) -> None:
    contents = b"pinned model"
    model_path = tmp_path / "model.pt"
    model_path.write_bytes(contents)

    verify_model_artifact(
        model_path,
        expected_size_bytes=len(contents),
        expected_sha256=hashlib.sha256(contents).hexdigest(),
    )


@pytest.mark.parametrize(
    ("expected_size", "expected_sha"),
    [
        (1, hashlib.sha256(b"pinned model").hexdigest()),
        (len(b"pinned model"), "0" * 64),
    ],
)
def test_rejects_a_model_with_the_wrong_size_or_sha(
    tmp_path: Path,
    expected_size: int,
    expected_sha: str,
) -> None:
    model_path = tmp_path / "model.pt"
    model_path.write_bytes(b"pinned model")

    with pytest.raises(ModelArtifactError, match=r"^MODEL_ARTIFACT_INVALID$"):
        verify_model_artifact(
            model_path,
            expected_size_bytes=expected_size,
            expected_sha256=expected_sha,
        )
