from pathlib import Path

import pytest

from tts_service.config import TtsConfigurationError, parse_tts_config


def valid_config_yaml() -> str:
    return """\
schema_version: 1
tts:
  model_id: v5_5_ru
  model_path: /opt/dota2-coach/models/v5_5_ru.pt
  device: cpu
  sample_rate_hz: 48000
  synthesis_timeout_ms: 6500
  max_text_characters: 300
  host: 0.0.0.0
  port: 8080
"""


def test_parses_the_exact_pinned_tts_configuration() -> None:
    configuration = parse_tts_config(valid_config_yaml())

    assert configuration.model_id == "v5_5_ru"
    assert configuration.model_path == Path("/opt/dota2-coach/models/v5_5_ru.pt")
    assert configuration.device == "cpu"
    assert configuration.sample_rate_hz == 48_000
    assert configuration.synthesis_timeout_ms == 6_500
    assert configuration.max_text_characters == 300
    assert configuration.host == "0.0.0.0"
    assert configuration.port == 8_080


@pytest.mark.parametrize(
    "source",
    [
        "",
        "{}",
        "schema_version: 2\ntts: {}",
        "schema_version: 1",
        "schema_version: 1\ntts: []",
        valid_config_yaml().replace("  model_id: v5_5_ru\n", ""),
        valid_config_yaml().replace("  model_path: /opt/dota2-coach/models/v5_5_ru.pt\n", ""),
        valid_config_yaml().replace("  device: cpu\n", ""),
        valid_config_yaml().replace("  sample_rate_hz: 48000\n", ""),
        valid_config_yaml().replace("  synthesis_timeout_ms: 6500\n", ""),
        valid_config_yaml().replace("  max_text_characters: 300\n", ""),
        valid_config_yaml().replace("  host: 0.0.0.0\n", ""),
        valid_config_yaml().replace("  port: 8080\n", ""),
        valid_config_yaml() + "unexpected: true\n",
        valid_config_yaml().replace("  port: 8080\n", "  port: 8080\n  unexpected: true\n"),
    ],
)
def test_rejects_missing_malformed_or_unknown_configuration(source: str) -> None:
    with pytest.raises(TtsConfigurationError, match=r"^TTS_CONFIG_INVALID$"):
        parse_tts_config(source)


@pytest.mark.parametrize(
    ("configured", "replacement"),
    [
        ("model_id: v5_5_ru", "model_id: v5_4_ru"),
        ("device: cpu", "device: cuda"),
        ("sample_rate_hz: 48000", "sample_rate_hz: 24000"),
        ("synthesis_timeout_ms: 6500", "synthesis_timeout_ms: 0"),
        ("max_text_characters: 300", "max_text_characters: 301"),
        ("model_path: /opt/dota2-coach/models/v5_5_ru.pt", "model_path: relative/model.pt"),
        ("host: 0.0.0.0", "host: 127.0.0.1"),
        ("port: 8080", "port: 0"),
    ],
)
def test_rejects_values_outside_the_fixed_service_contract(configured: str, replacement: str) -> None:
    with pytest.raises(TtsConfigurationError, match=r"^TTS_CONFIG_INVALID$"):
        parse_tts_config(valid_config_yaml().replace(configured, replacement))


def test_rejects_duplicate_yaml_keys() -> None:
    source = valid_config_yaml().replace("  device: cpu", "  device: cpu\n  device: cuda")

    with pytest.raises(TtsConfigurationError, match=r"^TTS_CONFIG_INVALID$"):
        parse_tts_config(source)


def test_configuration_errors_do_not_echo_values_or_paths() -> None:
    private_path = "/private/operator/model.pt"

    with pytest.raises(TtsConfigurationError) as captured:
        parse_tts_config(valid_config_yaml().replace("/opt/dota2-coach/models/v5_5_ru.pt", private_path))

    assert str(captured.value) == "TTS_CONFIG_INVALID"
    assert private_path not in str(captured.value)
