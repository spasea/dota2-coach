import io
import struct
import wave

import pytest

from tts_service.wav import WavEncodingError, encode_pcm16_mono_wav


def test_encodes_mono_signed_pcm16_at_the_canonical_sample_rate() -> None:
    encoded = encode_pcm16_mono_wav([0.0, 0.5, -0.5], max_output_bytes=1_024)

    with wave.open(io.BytesIO(encoded), "rb") as wav:
        assert wav.getnchannels() == 1
        assert wav.getsampwidth() == 2
        assert wav.getframerate() == 48_000
        assert wav.getcomptype() == "NONE"
        assert wav.getnframes() == 3
        assert struct.unpack("<hhh", wav.readframes(3)) == (0, 16_384, -16_384)


def test_clips_samples_to_the_signed_pcm16_range() -> None:
    encoded = encode_pcm16_mono_wav([2.0, 1.0, -1.0, -2.0], max_output_bytes=1_024)

    with wave.open(io.BytesIO(encoded), "rb") as wav:
        assert struct.unpack("<hhhh", wav.readframes(4)) == (32_767, 32_767, -32_768, -32_768)


def test_writes_consistent_riff_and_data_chunk_sizes() -> None:
    encoded = encode_pcm16_mono_wav([0.0, 0.25], max_output_bytes=1_024)

    assert encoded[:4] == b"RIFF"
    assert encoded[8:12] == b"WAVE"
    assert struct.unpack("<I", encoded[4:8])[0] == len(encoded) - 8
    assert encoded[36:40] == b"data"
    assert struct.unpack("<I", encoded[40:44])[0] == 4


def test_rejects_empty_audio() -> None:
    with pytest.raises(WavEncodingError):
        encode_pcm16_mono_wav([], max_output_bytes=1_024)


def test_rejects_non_finite_samples() -> None:
    with pytest.raises(WavEncodingError):
        encode_pcm16_mono_wav([0.0, float("nan")], max_output_bytes=1_024)


def test_rejects_a_wav_that_would_cross_the_injected_output_bound() -> None:
    with pytest.raises(WavEncodingError):
        encode_pcm16_mono_wav([0.0] * 100, max_output_bytes=64)
