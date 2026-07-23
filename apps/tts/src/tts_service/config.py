from .contracts import TtsConfiguration


class TtsConfigurationError(ValueError):
    def __init__(self) -> None:
        super().__init__("TTS_CONFIG_INVALID")


def parse_tts_config(source: str) -> TtsConfiguration:
    del source
    raise NotImplementedError("TTS configuration parsing is not implemented.")
