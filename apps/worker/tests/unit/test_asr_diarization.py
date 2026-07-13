"""Speaker diarization alignment and offline fallback regression tests."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from worker.pipelines.asr import (
    _assign_speakers_by_overlap,
    _cluster_speakers,
    _diarize_with_fallback,
)


def test_overlap_assignment_uses_whole_segment_not_only_midpoint() -> None:
    turns = [
        (0.0, 1.6, "speaker-low"),
        (1.6, 2.4, "speaker-high"),
        (2.4, 4.0, "speaker-low"),
        (4.0, 5.0, "speaker-high"),
    ]
    segments = [
        {"start_ms": 0, "end_ms": 4000, "text": "long turn"},
        {"start_ms": 4000, "end_ms": 5000, "text": "reply"},
    ]

    result = _assign_speakers_by_overlap(turns, segments)

    assert [segment.speaker for segment in result] == ["A", "B"]


def test_acoustic_fallback_separates_clear_low_and_high_voices(tmp_path: Path) -> None:
    sample_rate = 16_000
    seconds = np.arange(sample_rate, dtype=np.float32) / sample_rate

    def voice(frequency: float) -> np.ndarray:
        return (
            0.30 * np.sin(2 * np.pi * frequency * seconds)
            + 0.12 * np.sin(2 * np.pi * frequency * 2 * seconds)
            + 0.05 * np.sin(2 * np.pi * frequency * 3 * seconds)
        ).astype(np.float32)

    audio = np.concatenate([voice(115), voice(235), voice(115), voice(235)])
    source = tmp_path / "two-speakers.wav"
    sf.write(source, audio, sample_rate)
    segments = [
        {"start_ms": index * 1000, "end_ms": (index + 1) * 1000, "text": str(index)}
        for index in range(4)
    ]

    result = _cluster_speakers(source, 2, segments)

    assert [segment.speaker for segment in result] == ["A", "B", "A", "B"]


def test_diarization_does_not_silently_collapse_to_one_speaker(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    def fail(*_args: object) -> None:
        raise ValueError

    monkeypatch.setattr("worker.pipelines.asr._diarize", fail)
    monkeypatch.setattr("worker.pipelines.asr._cluster_speakers", fail)

    with pytest.raises(RuntimeError, match="Unable to separate"):
        _diarize_with_fallback(
            tmp_path / "missing.wav",
            2,
            [{"start_ms": 0, "end_ms": 1000, "text": "hello"}],
        )
