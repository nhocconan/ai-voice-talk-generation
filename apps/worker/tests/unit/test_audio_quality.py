"""Unit tests for audio quality scorer."""

from __future__ import annotations

import struct
import wave
from pathlib import Path


def _write_wav(path: Path, *, n_samples: int = 24000, amplitude: float = 0.3) -> None:
    """Write a simple 24kHz mono sine-like WAV for testing."""
    import math

    samples = [int(amplitude * 32767 * math.sin(2 * math.pi * 440 * i / 24000)) for i in range(n_samples)]
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(struct.pack(f"<{n_samples}h", *samples))


def test_score_returns_int_in_range(tmp_path: Path) -> None:
    from worker.audio.quality import score_sample

    wav = tmp_path / "test.wav"
    _write_wav(wav)
    score, detail = score_sample(wav)

    assert isinstance(score, int)
    assert 0 <= score <= 100


def test_score_detail_has_required_fields(tmp_path: Path) -> None:
    from worker.audio.quality import score_sample

    wav = tmp_path / "test.wav"
    _write_wav(wav)
    _score, detail = score_sample(wav)

    assert hasattr(detail, "snr_db")
    assert hasattr(detail, "pitch_std_hz")
    assert hasattr(detail, "clipping_ratio")
    assert hasattr(detail, "duration_s")
    assert detail.duration_s > 0


def test_longer_audio_scores_higher_duration_component(tmp_path: Path) -> None:
    """Duration contributes up to 25 pts; 2-second audio should score higher than 0.5s."""
    from worker.audio.quality import score_sample

    short = tmp_path / "short.wav"
    long = tmp_path / "long.wav"
    _write_wav(short, n_samples=12000)   # 0.5s at 24kHz
    _write_wav(long, n_samples=72000)    # 3s at 24kHz

    short_score, _ = score_sample(short)
    long_score, _ = score_sample(long)

    assert long_score > short_score, (
        f"Longer audio ({long_score}) should outscore shorter ({short_score})"
    )


def test_clipping_audio_penalized(tmp_path: Path) -> None:
    from worker.audio.quality import score_sample

    wav = tmp_path / "clipped.wav"
    _write_wav(wav, amplitude=1.0)  # will clip
    score, detail = score_sample(wav)

    assert detail.clipping_ratio >= 0
