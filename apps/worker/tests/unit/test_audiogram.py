"""Unit tests for the audiogram helpers.

We test the pure parts (ASS subtitle generation, timestamp formatting) without
invoking ffmpeg, so this suite runs in any CI environment. The ffmpeg-backed
``render_audiogram`` is exercised by the integration suite when an ffmpeg
binary is on PATH.
"""

from __future__ import annotations

import shutil

import pytest

from worker.audio.audiogram import (
    _build_filter_complex,
    _escape_ass,
    _format_ass_ts,
    _resolve_dimensions,
    write_ass,
)


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


def test_build_filter_complex_uses_gradients_when_available() -> None:
    fc, label = _build_filter_complex(
        width=1080,
        height=1080,
        aspect="1:1",
        background_hex="#0B0B0F",
        wave_hex="#7FFFFF",
        duration_s=2.0,
        use_gradients=True,
        caption_chain="",
    )
    assert "gradients=s=1080x1080" in fc
    assert "speed=0.03" in fc
    # No captions requested → the final label is the progress-bar output.
    assert label == "[prog]"


def test_build_filter_complex_falls_back_to_solid_color() -> None:
    fc, _ = _build_filter_complex(
        width=1080,
        height=1920,
        aspect="9:16",
        background_hex="#0B0B0F",
        wave_hex="#7FFFFF",
        duration_s=2.0,
        use_gradients=False,
        caption_chain="",
    )
    assert "gradients" not in fc
    # Background is the solid color source sized to the full canvas.
    assert "color=c=0x0B0B0F:s=1080x1920" in fc


def test_build_filter_complex_progress_bar_encodes_duration() -> None:
    fc, label = _build_filter_complex(
        width=1080,
        height=1080,
        aspect="1:1",
        background_hex="#0B0B0F",
        wave_hex="#7FFFFF",
        duration_s=12.5,
        use_gradients=True,
        caption_chain="ass=filename=x.ass",
    )
    # The bar overlay x-expression grows left→right over the full duration.
    assert "t/12.500" in fc
    assert "overlay=x='-1080+1080*t/12.500'" in fc
    # A caption chain is appended and becomes the final labelled output.
    assert "[prog]ass=filename=x.ass[v]" in fc
    assert label == "[v]"


def test_resolve_dimensions_maps_aspects_and_falls_back() -> None:
    assert _resolve_dimensions("1:1") == (1080, 1080)
    assert _resolve_dimensions("9:16") == (1080, 1920)
    assert _resolve_dimensions("16:9") == (1920, 1080)
    # Unknown values fall back to square.
    assert _resolve_dimensions("bogus") == (1080, 1080)


def _write_sine_wav(path, seconds: float = 2.0, sr: int = 24000) -> None:
    """Write a mono sine-wave WAV using soundfile (no ffmpeg dependency)."""
    import numpy as np
    import soundfile as sf

    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    tone = (0.3 * np.sin(2 * np.pi * 440 * t)).astype("float32")
    sf.write(str(path), tone, sr, subtype="PCM_16")


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
@pytest.mark.parametrize(
    "aspect,expected_w,expected_h",
    [("1:1", 1080, 1080), ("9:16", 1080, 1920), ("16:9", 1920, 1080)],
)
def test_render_audiogram_aspect_dimensions(tmp_path, aspect, expected_w, expected_h) -> None:
    """Real render per aspect: output MP4 matches the preset size and ~2s length.

    Local Homebrew ffmpeg has showwaves/gradients/overlay but lacks libass, so
    captions are skipped with a warning — expected and fine here. Prod Docker
    (Debian ffmpeg + libass) burns them.
    """
    import asyncio
    import json
    import subprocess

    from worker.audio.audiogram import render_audiogram

    audio = tmp_path / "tone.wav"
    _write_sine_wav(audio, seconds=2.0)

    out = tmp_path / f"audiogram_{aspect.replace(':', 'x')}.mp4"
    asyncio.run(
        render_audiogram(
            audio_path=audio,
            out_path=out,
            segments=[{"start_ms": 0, "end_ms": 2000, "text": "Hello"}],
            title="Test",
            aspect=aspect,
        )
    )
    assert out.exists()

    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height:format=duration",
            "-of",
            "json",
            str(out),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(probe.stdout)
    assert data["streams"][0]["width"] == expected_w
    assert data["streams"][0]["height"] == expected_h
    duration = float(data["format"]["duration"])
    assert abs(duration - 2.0) <= 0.5, f"duration {duration}s not ≈2s"


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")
def test_render_audiogram_waveform_is_actually_visible(tmp_path) -> None:
    """The waveform must be drawn opaquely, not near-transparent.

    `showwaves` defaults to `draw=scale`, which shades each sample by amplitude
    and yields an almost-invisible wave over the dark background. This asserts on
    rendered pixels rather than on the filter string, so it fails if the wave ever
    stops being visible for any reason.
    """
    import asyncio
    import subprocess

    from worker.audio.audiogram import _wave_geometry, render_audiogram

    audio = tmp_path / "tone.wav"
    _write_sine_wav(audio, seconds=2.0)
    out = tmp_path / "wave.mp4"
    asyncio.run(render_audiogram(audio_path=audio, out_path=out, aspect="1:1"))

    wave_h, wave_y = _wave_geometry("1:1", 1080, 1080)
    # Decode one frame of the waveform band straight to raw grayscale bytes.
    frame = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-ss", "1", "-i", str(out),
            "-frames:v", "1", "-vf", f"crop=1080:{wave_h}:0:{wave_y}",
            "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1",
        ],
        check=True,
        capture_output=True,
    ).stdout
    assert frame, "no frame decoded from the waveform band"

    # The brightest pixel in the wave band must be clearly brighter than the dark
    # background. A `draw=scale` wave peaks around luma ~60 here; `draw=full` ~230.
    peak_luma = max(frame)
    assert peak_luma > 180, f"waveform too dim (peak luma {peak_luma}) — is draw=full still set?"


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
