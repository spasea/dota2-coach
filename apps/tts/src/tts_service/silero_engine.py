from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

from .contracts import TtsSpeaker


class SileroEngine(Protocol):
    def synthesize(self, text: str, speaker: TtsSpeaker) -> Sequence[float]: ...


def load_silero_engine(model_path: Path) -> SileroEngine:
    del model_path
    raise NotImplementedError("Silero engine loading is not implemented.")
