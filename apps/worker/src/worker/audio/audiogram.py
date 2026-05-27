"""Audiogram renderer: WAV + transcript text → MP4 (1080×1080) with waveform overlay.

Pipeline: ffmpeg `showwaves` filter draws the moving waveform on a dark canvas,
`drawtext` (or burned ASS subtitles) overlays the text. Output is a square,
social-ready MP4 with the original audio.

Kept deliberately small — accepts a WAV and a list of ``{start_ms, end_ms, text}``
chapters/segments and produces an MP4 next to the input. Falls back to a single
static title overlay when no chapters are provided.
"""

from __future__ import annotations

import asyncio
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Iterable, TypedDict

from ..logging import get_logger

logger = get_logger("audio.audiogram")


class AudiogramSegment(TypedDict, total=False):
    start_ms: int
    end_ms: int
    text: str


def _escape_ass(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def _format_ass_ts(ms: int) -> str:
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    cs = ms // 10
    return f"{h:d}:{m:02d}:{s:02d}.{cs:02d}"


def write_ass(
    segments: Iterable[AudiogramSegment],
    out_path: Path,
    *,
    title: str | None = None,
    play_res_x: int = 1080,
    play_res_y: int = 1080,
) -> None:
    """Render an ASS subtitle file from segments. Used to burn captions into the video."""
    segs = [s for s in segments if s.get("text")]
    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {play_res_x}\n"
        f"PlayResY: {play_res_y}\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, "
        "Bold, BorderStyle, Outline, Shadow, Alignment, MarginV\n"
        "Style: Caption,Inter,44,&H00FFFFFF,&H80000000,&H80000000,0,1,2,1,2,80\n"
        "Style: Title,Inter,56,&H00FFFFFF,&H80000000,&H80000000,1,1,2,1,8,60\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    lines: list[str] = [header]
    if title:
        lines.append(
            f"Dialogue: 0,{_format_ass_ts(0)},{_format_ass_ts(10_000_000)},Title,,0,0,0,,"
            f"{_escape_ass(title)}\n"
        )
    for seg in segs:
        start = int(seg.get("start_ms", 0))
        end = int(seg.get("end_ms", start + 3000))
        if end <= start:
            end = start + 1500
        lines.append(
            f"Dialogue: 0,{_format_ass_ts(start)},{_format_ass_ts(end)},Caption,,0,0,0,,"
            f"{_escape_ass(str(seg['text']))}\n"
        )
    out_path.write_text("".join(lines), encoding="utf-8")


async def render_audiogram(
    *,
    audio_path: Path,
    out_path: Path,
    segments: list[AudiogramSegment] | None = None,
    title: str | None = None,
    size: int = 1080,
    background_hex: str = "#0B0B0F",
    wave_hex: str = "#7FFFFF",
) -> Path:
    """Render an audiogram MP4 from ``audio_path``. Returns ``out_path``.

    Uses ffmpeg's ``showwaves`` for the live waveform and burns ASS captions for
    the transcript so the result is a single self-contained video file.
    """
    segments = segments or []
    ass_path = out_path.with_suffix(".ass")
    write_ass(segments, ass_path, title=title, play_res_x=size, play_res_y=size)

    # showwaves draws the waveform; we composite it on top of a solid background.
    # The cyan wave color matches the design tokens accent palette.
    bg = background_hex.lstrip("#")
    wv = wave_hex.lstrip("#")
    caption_chain = _subtitle_filter_chain(ass_path)
    # `color` without an explicit duration produces frames indefinitely; the
    # `-shortest` flag at output time bounds it to the audio length. An
    # earlier `d=1` here capped the whole video at 1 second.
    filter_complex = (
        f"color=c=0x{bg}:s={size}x{size}:r=30[bg];"
        f"[0:a]showwaves=s={size}x{size // 3}:mode=cline:colors=0x{wv}:rate=30,"
        f"format=rgba[wave];"
        f"[bg][wave]overlay=0:{size - size // 3 - 80}:shortest=1[wbg]"
        + (f";[wbg]{caption_chain}[v]" if caption_chain else "")
    )
    final_label = "[v]" if caption_chain else "[wbg]"

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(audio_path),
        "-filter_complex",
        filter_complex,
        "-map",
        final_label,
        "-map",
        "0:a",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "stillimage",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(out_path),
    ]

    logger.info("Rendering audiogram", audio=str(audio_path), out=str(out_path))
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg audiogram failed (code {proc.returncode}): "
            f"{stderr.decode('utf-8', errors='replace')[-800:]}"
        )

    return out_path


@lru_cache(maxsize=1)
def _detect_subtitle_filter() -> str | None:
    """Return ``"ass"`` / ``"subtitles"`` if a subtitle filter is available, else ``None``.

    Some ffmpeg builds (notably the default Homebrew formula on Apple silicon)
    ship without libass and therefore lack both filters. In that case we still
    render the waveform MP4 but skip the burned captions instead of failing.
    """
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-filters"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except Exception:
        return None
    names = {line.split()[1] for line in result.stdout.splitlines() if len(line.split()) >= 2}
    if "ass" in names:
        return "ass"
    if "subtitles" in names:
        return "subtitles"
    return None


def _subtitle_filter_chain(ass_path: Path) -> str:
    fname = _detect_subtitle_filter()
    if not fname:
        return ""
    raw = ass_path.as_posix()
    escaped = raw
    for ch in ("\\", ":", "'", "[", "]", ",", ";", "="):
        escaped = escaped.replace(ch, "\\" + ch)
    # Both filters accept `filename=` as a keyword; this disambiguates from
    # positional options that get tripped up by absolute paths.
    return f"{fname}=filename={escaped}"
