"""Unit tests for timeline-aware stitching (re-voice FR-9)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

SAMPLE_RATE = 24000


def _tone(path: Path, *, duration_ms: int, amplitude: float = 0.3) -> None:
    n = int(duration_ms * SAMPLE_RATE / 1000)
    t = np.arange(n) / SAMPLE_RATE
    sf.write(str(path), (amplitude * np.sin(2 * np.pi * 440 * t)).astype("float32"), SAMPLE_RATE)


def test_segment_lands_at_original_start(tmp_path: Path) -> None:
    from worker.audio.stitch import stitch_to_timeline

    seg = tmp_path / "seg0.wav"
    _tone(seg, duration_ms=100)  # 100ms of tone

    out = tmp_path / "out.wav"
    # Place at 1000ms → expect ~1s of leading silence, then the tone.
    stitch_to_timeline([(1000, seg)], out)

    audio, sr = sf.read(str(out), dtype="float32")
    assert sr == SAMPLE_RATE
    lead = int(0.9 * SAMPLE_RATE)  # well inside the gap
    assert np.max(np.abs(audio[:lead])) < 1e-6  # silence before start
    onset = int(1.0 * SAMPLE_RATE)
    assert np.max(np.abs(audio[onset : onset + 1000])) > 0.1  # tone present at start_ms


def test_total_length_covers_last_segment(tmp_path: Path) -> None:
    from worker.audio.stitch import stitch_to_timeline

    a, b = tmp_path / "a.wav", tmp_path / "b.wav"
    _tone(a, duration_ms=200)
    _tone(b, duration_ms=200)

    out = tmp_path / "out.wav"
    # Out-of-order placement; last segment ends at 2000 + 200 = 2200ms.
    stitch_to_timeline([(2000, b), (0, a)], out)

    audio, _ = sf.read(str(out), dtype="float32")
    expected = int(2.2 * SAMPLE_RATE)
    assert abs(len(audio) - expected) <= 2


def test_empty_raises(tmp_path: Path) -> None:
    from worker.audio.stitch import stitch_to_timeline

    try:
        stitch_to_timeline([], tmp_path / "out.wav")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass
