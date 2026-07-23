from typing import Any

import yaml
from yaml.constructor import ConstructorError
from yaml.nodes import MappingNode

from .contracts import (
    DEVICE,
    HOST,
    MAX_TEXT_CHARACTERS,
    MODEL_ID,
    MODEL_PATH,
    PORT,
    SAMPLE_RATE_HZ,
    SYNTHESIS_TIMEOUT_MS,
    TtsConfiguration,
)


class TtsConfigurationError(ValueError):
    def __init__(self) -> None:
        super().__init__("TTS_CONFIG_INVALID")


def parse_tts_config(source: str) -> TtsConfiguration:
    try:
        document = yaml.load(source, Loader=_UniqueKeyLoader)
        if not isinstance(document, dict) or set(document) != {"schema_version", "tts"}:
            raise TtsConfigurationError
        if document["schema_version"] != 1 or isinstance(document["schema_version"], bool):
            raise TtsConfigurationError

        tts = document["tts"]
        expected_keys = {
            "model_id",
            "model_path",
            "device",
            "sample_rate_hz",
            "synthesis_timeout_ms",
            "max_text_characters",
            "host",
            "port",
        }
        if not isinstance(tts, dict) or set(tts) != expected_keys:
            raise TtsConfigurationError

        expected_values: dict[str, object] = {
            "model_id": MODEL_ID,
            "model_path": str(MODEL_PATH),
            "device": DEVICE,
            "sample_rate_hz": SAMPLE_RATE_HZ,
            "synthesis_timeout_ms": SYNTHESIS_TIMEOUT_MS,
            "max_text_characters": MAX_TEXT_CHARACTERS,
            "host": HOST,
            "port": PORT,
        }
        if tts != expected_values:
            raise TtsConfigurationError

        return TtsConfiguration(
            model_id=MODEL_ID,
            model_path=MODEL_PATH,
            device=DEVICE,
            sample_rate_hz=SAMPLE_RATE_HZ,
            synthesis_timeout_ms=SYNTHESIS_TIMEOUT_MS,
            max_text_characters=MAX_TEXT_CHARACTERS,
            host=HOST,
            port=PORT,
        )
    except TtsConfigurationError:
        raise
    except (KeyError, TypeError, ValueError, yaml.YAMLError) as error:
        raise TtsConfigurationError from error


class _UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node: MappingNode, deep: bool = False) -> dict[Any, Any]:
        mapping: dict[Any, Any] = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ConstructorError(None, None, "duplicate mapping key", key_node.start_mark)
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping
