"""Unit tests for the audiogram helpers.

We test the pure parts (ASS subtitle generation, timestamp formatting) without
invoking ffmpeg, so this suite runs in any CI environment. The ffmpeg-backed
``render_audiogram`` is exercised by the integration suite when an ffmpeg
binary is on PATH.
"""

from __future__ import annotations

import shutil

import pytest

from worker.audio.audiogram import _format_ass_ts, _escape_ass, write_ass


def test_format_ass_ts_seconds() -> None:
    assert _format_ass_ts(0) == "0:00:00.00"
    assert _format_ass_ts(1500) == "0:00:01.50"
    assert _format_ass_ts(61_250) == "0:01:01.25"
    assert _format_ass_ts(3_600_000) == "1:00:00.00"


def test_escape_ass_protects_braces_and_newlines() -> None:
    assert _escape_ass("hello {world}") == "hello \\{world\\}"
    assert _escape_ass("line1\nline2") == "line1\\Nline2"
    # Backslashes must double-escape so ffmpeg/libass doesn't interpret them.
    assert _escape_ass("a\\b") == "a\\\\b"


def test_write_ass_emits_dialogue_lines(tmp_path) -> None:
    out = tmp_path / "captions.ass"
    write_ass(
        [
            {"start_ms": 0, "end_ms": 2000, "text": "Hello"},
            {"start_ms": 2000, "end_ms": 4000, "text": "World"},
            # Filtered: empty text
            {"start_ms": 4000, "end_ms": 5000, "text": ""},
        ],
        out,
        title="My audiogram",
    )
    content = out.read_text(encoding="utf-8")
    assert "[Script Info]" in content
    assert "Style: Caption" in content
    assert "Style: Title" in content
    assert "My audiogram" in content
    assert "Hello" in content
    assert "World" in content
    # The empty segment should not produce a Dialogue line.
    dialogue_lines = [line for line in content.splitlines() if line.startswith("Dialogue:")]
    # 1 title + 2 real captions
    assert len(dialogue_lines) == 3


def test_write_ass_clamps_inverted_end_to_start() -> None:
    """If a caller passes end_ms <= start_ms we extend to start + 1500 ms.

    This protects the renderer from zero-duration dialogue lines that libass
    will silently drop, leading to missing captions on screen.
    """
    out = (
        # tmp_path injection
        __import__("pathlib").Path(__import__("tempfile").mkdtemp()) / "captions.ass"
    )
    write_ass([{"start_ms": 5000, "end_ms": 3000, "text": "Reversed"}], out)
    content = out.read_text(encoding="utf-8")
    assert "Reversed" in content
    # 5000 -> 5000 + 1500 = 6500 ms = "0:00:06.50"
    assert "0:00:06.50" in content


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_render_audiogram_smoke(tmp_path) -> None:
    """End-to-end smoke test — only runs when ffmpeg is available."""
    import asyncio
    import subprocess

    from worker.audio.audiogram import render_audiogram

    audio = tmp_path / "tone.wav"
    # 1-second 440 Hz sine
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=1",
            str(audio),
        ],
        check=True,
        capture_output=True,
    )

    out = tmp_path / "audiogram.mp4"
    asyncio.run(
        render_audiogram(
            audio_path=audio,
            out_path=out,
            segments=[{"start_ms": 0, "end_ms": 1000, "text": "Hello"}],
            title="Test",
        )
    )
    assert out.exists()
    assert out.stat().st_size > 1024


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_render_audiogram_matches_audio_duration(tmp_path) -> None:
    """Regression: the output MP4 must span the full audio, not stop after 1s.

    Earlier the filtergraph fixed the background `color` source to `d=1`, which
    -- combined with `-shortest` at output -- truncated every audiogram to one
    second regardless of audio length. Verified end-to-end with real Xiaomi
    MiMo output during 2026-05-27 live integration.
    """
    import asyncio
    import subprocess

    from worker.audio.audiogram import render_audiogram

    audio = tmp_path / "tone.wav"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=5",
            str(audio),
        ],
        check=True,
        capture_output=True,
    )

    out = tmp_path / "audiogram_5s.mp4"
    asyncio.run(render_audiogram(audio_path=audio, out_path=out, segments=[]))

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(out),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    duration = float(probe.stdout.strip())
    # Audio is 5s; allow a small encoder rounding margin but reject the 1s bug.
    assert duration >= 4.5, f"Audiogram duration {duration}s — regression of d=1 bug?"
    assert duration <= 6.0, f"Audiogram unexpectedly long: {duration}s"
