"""
Regenerates the compressed voice fixtures from relation_es.wav using PyAV.

    cd apps/ai-service && python test/fixtures/audio/make_audio_fixtures.py

Outputs (kept small, a few seconds each):
- relation_es.webm: Opus in WebM, what Chrome/Firefox MediaRecorder produces.
- relation_es.m4a: AAC in MP4, what Safari MediaRecorder produces.
"""

from pathlib import Path

import av

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "relation_es.wav"
RATE = 48000  # Opus native rate; browsers record at 48 kHz.


def _encode(target: Path, container_format: str, codec: str, bit_rate: int) -> None:
    resampler = av.AudioResampler(format="fltp" if codec == "aac" else "flt", layout="mono", rate=RATE)
    with av.open(str(SOURCE)) as src, av.open(str(target), mode="w", format=container_format) as dst:
        stream = dst.add_stream(codec, rate=RATE)
        stream.bit_rate = bit_rate
        stream.layout = "mono"
        for frame in src.decode(audio=0):
            for resampled in resampler.resample(frame):
                for packet in stream.encode(resampled):
                    dst.mux(packet)
        for resampled in resampler.resample(None):
            for packet in stream.encode(resampled):
                dst.mux(packet)
        for packet in stream.encode(None):
            dst.mux(packet)


def main() -> None:
    _encode(HERE / "relation_es.webm", "webm", "libopus", 24000)
    _encode(HERE / "relation_es.m4a", "mp4", "aac", 48000)
    for name in ("relation_es.webm", "relation_es.m4a"):
        print(name, (HERE / name).stat().st_size, "bytes")


if __name__ == "__main__":
    main()
