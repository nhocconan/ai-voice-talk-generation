"""Unit tests for SRT/VTT subtitle writers."""

from __future__ import annotations

from pathlib import Path


def test_srt_format(tmp_path: Path) -> None:
    from worker.audio.subtitles import write_srt

    out = tmp_path / "o.srt"
    write_srt(
        [
            {"start_ms": 0, "end_ms": 1500, "text": "Hello"},
            {"start_ms": 1500, "end_ms": 3200, "text": "World"},
        ],
        out,
    )
    content = out.read_text()
    assert "1\n00:00:00,000 --> 00:00:01,500\nHello" in content
    assert "2\n00:00:01,500 --> 00:00:03,200\nWorld" in content


def test_vtt_header_and_dot_separator(tmp_path: Path) -> None:
    from worker.audio.subtitles import write_vtt

    out = tmp_path / "o.vtt"
    write_vtt([{"start_ms": 61_000, "end_ms": 62_000, "text": "Hi"}], out)
    content = out.read_text()
    assert content.startswith("WEBVTT")
    assert "00:01:01.000 --> 00:01:02.000" in content


def test_skips_empty_and_sorts(tmp_path: Path) -> None:
    from worker.audio.subtitles import write_srt

    out = tmp_path / "o.srt"
    write_srt(
        [
            {"start_ms": 5000, "end_ms": 6000, "text": "second"},
            {"start_ms": 0, "end_ms": 1000, "text": "  "},  # empty → skipped
            {"start_ms": 1000, "end_ms": 2000, "text": "first"},
        ],
        out,
    )
    content = out.read_text()
    assert "  " not in content.replace("\n", "")  # no blank cue text
    # "first" (1000ms) must be numbered before "second" (5000ms)
    assert content.index("first") < content.index("second")
