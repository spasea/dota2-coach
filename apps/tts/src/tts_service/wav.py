import math
import struct
from collections.abc import Sequence

from .contracts import SAMPLE_RATE_HZ


class WavEncodingError(ValueError):
    pass


def encode_pcm16_mono_wav(samples: Sequence[float], max_output_bytes: int) -> bytes:
    data_size = len(samples) * 2
    output_size = 44 + data_size
    if not samples or output_size > max_output_bytes:
        raise WavEncodingError

    pcm = bytearray(data_size)
    for index, sample in enumerate(samples):
        if not math.isfinite(sample):
            raise WavEncodingError
        clipped = min(1.0, max(-1.0, sample))
        encoded = min(32_767, round(clipped * 32_768))
        struct.pack_into("<h", pcm, index * 2, encoded)

    byte_rate = SAMPLE_RATE_HZ * 2
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        output_size - 8,
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        SAMPLE_RATE_HZ,
        byte_rate,
        2,
        16,
        b"data",
        data_size,
    )
    return header + pcm
