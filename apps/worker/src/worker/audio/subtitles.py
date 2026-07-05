"""Subtitle writers: timed segments → SRT / WebVTT side-files.

Borrowed from voice-pro's caption workflow. We already build timed segments for
podcasts (chapters) and video re-voice (per-turn segments); emitting `.srt` and
`.vtt` makes those renders shareable/editable without re-running ASR.

Each segment is ``{start_ms, end_ms, text}``. Output is plain text written to the
given path — callers upload the file alongside the audio/video render.
"""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict


class SubtitleSegment(TypedDict, total=False):
    start_ms: int
    end_ms: int
    text: str


def _clean(segments: list[SubtitleSegment]) -> list[tuple[int, int, str]]:
    out: list[tuple[int, int, str]] = []
    for seg in segments:
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        start = max(0, int(seg.get("start_ms", 0)))
        end = int(seg.get("end_ms", start + 1500))
        if end <= start:
            end = start + 1500
        out.append((start, end, text))
    out.sort(key=lambda s: s[0])
    return out


def _fmt_ts(ms: int, *, sep: str) -> str:
    """Format milliseconds as ``HH:MM:SS<sep>mmm`` (sep is ',' for SRT, '.' for VTT)."""
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def write_srt(segments: list[SubtitleSegment], out_path: Path) -> Path:
    """Write a SubRip (.srt) file. Returns ``out_path``."""
    lines: list[str] = []
    for i, (start, end, text) in enumerate(_clean(segments), start=1):
        lines.append(str(i))
        lines.append(f"{_fmt_ts(start, sep=',')} --> {_fmt_ts(end, sep=',')}")
        lines.append(text)
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def write_vtt(segments: list[SubtitleSegment], out_path: Path) -> Path:
    """Write a WebVTT (.vtt) file. Returns ``out_path``."""
    lines: list[str] = ["WEBVTT", ""]
    for start, end, text in _clean(segments):
        lines.append(f"{_fmt_ts(start, sep='.')} --> {_fmt_ts(end, sep='.')}")
        lines.append(text)
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path
