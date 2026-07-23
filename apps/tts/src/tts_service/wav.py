from collections.abc import Sequence


class WavEncodingError(ValueError):
    pass


def encode_pcm16_mono_wav(samples: Sequence[float], max_output_bytes: int) -> bytes:
    del samples
    del max_output_bytes
    raise NotImplementedError("PCM WAV encoding is not implemented.")
