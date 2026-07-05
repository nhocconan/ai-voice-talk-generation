"""Word-level animated captions ("text overlay") for talk / podcast video.

Produces ASS subtitle files with a per-word active highlight — the look popular
video tools (Submagic, Captions.ai, Opus Clip, CapCut, NotebookLM) use: the word
currently being spoken pops (accent colour + slight scale) while the rest of the
line stays dim. This is a big step up from static segment-level captions.

Two presets:
* ``pop``   — one event per word; the active word is recoloured + scaled. The
  modern "TikTok" caption. Default.
* ``karaoke`` — one event per line using ASS ``\\kf`` sweep tags (classic fill).

Input is word-level timing: ``[{start_ms, end_ms, text}]``. These come from
faster-whisper ``word_timestamps=True`` (see ``align.py`` / the ASR pipeline).
All functions here are pure string/data transforms so they unit-test without
ffmpeg or any model.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, TypedDict


class Word(TypedDict):
    start_ms: int
    end_ms: int
    text: str


class CaptionLine(TypedDict):
    start_ms: int
    end_ms: int
    words: list[Word]


def group_words_into_lines(
    words: Iterable[Word],
    *,
    max_words: int = 5,
    max_chars: int = 42,
    max_gap_ms: int = 700,
) -> list[CaptionLine]:
    """Group a flat word stream into short caption lines.

    A new line starts when the current line would exceed ``max_words`` /
    ``max_chars``, or when the silence gap before a word exceeds ``max_gap_ms``
    (a natural phrase boundary).
    """
    lines: list[CaptionLine] = []
    current: list[Word] = []
    char_count = 0

    for w in words:
        text = (w.get("text") or "").strip()
        if not text:
            continue
        word: Word = {"start_ms": int(w["start_ms"]), "end_ms": int(w["end_ms"]), "text": text}

        gap = word["start_ms"] - current[-1]["end_ms"] if current else 0
        would_overflow = (
            len(current) >= max_words or (char_count + len(text) + 1) > max_chars
        )
        if current and (would_overflow or gap > max_gap_ms):
            lines.append(_finalize_line(current))
            current = []
            char_count = 0

        current.append(word)
        char_count += len(text) + 1

    if current:
        lines.append(_finalize_line(current))
    return lines


def _finalize_line(words: list[Word]) -> CaptionLine:
    return {
        "start_ms": words[0]["start_ms"],
        "end_ms": words[-1]["end_ms"],
        "words": words,
    }


# ── ASS generation ──────────────────────────────────────────────────────────

def _hex_to_ass(hex_color: str) -> str:
    """`#RRGGBB` → ASS `&HAABBGGRR` (opaque)."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return "&H00FFFFFF"
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def _format_ts(ms: int) -> str:
    ms = max(0, int(ms))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:d}:{m:02d}:{s:02d}.{ms // 10:02d}"


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", " ")


def write_karaoke_ass(
    lines: list[CaptionLine],
    out_path: Path,
    *,
    preset: str = "pop",
    play_res_x: int = 1080,
    play_res_y: int = 1080,
    font: str = "Inter",
    font_size: int = 60,
    base_hex: str = "#FFFFFF",
    active_hex: str = "#E5001A",
    outline_hex: str = "#000000",
    margin_v: int = 120,
    alignment: int = 2,
) -> Path:
    """Render word-level animated captions to an ASS file at ``out_path``."""
    base = _hex_to_ass(base_hex)
    active = _hex_to_ass(active_hex)
    outline = _hex_to_ass(outline_hex)

    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        "WrapStyle: 2\n"
        f"PlayResX: {play_res_x}\n"
        f"PlayResY: {play_res_y}\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Cap,{font},{font_size},{base},{active},{outline},&H64000000,"
        f"-1,0,1,4,1,{alignment},60,60,{margin_v},1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )

    if preset == "karaoke":
        body = _karaoke_events(lines)
    else:
        body = _pop_events(lines, active)

    out_path.write_text(header + body, encoding="utf-8")
    return out_path


def _karaoke_events(lines: list[CaptionLine]) -> str:
    """One event per line with `\\kf` sweep-fill tags (SecondaryColour fills to Primary)."""
    out: list[str] = []
    for line in lines:
        parts: list[str] = []
        for w in line["words"]:
            dur_cs = max(1, (w["end_ms"] - w["start_ms"]) // 10)
            parts.append(f"{{\\kf{dur_cs}}}{_escape(w['text'])} ")
        text = "".join(parts).rstrip()
        out.append(
            f"Dialogue: 0,{_format_ts(line['start_ms'])},{_format_ts(line['end_ms'])},"
            f"Cap,,0,0,0,,{text}\n"
        )
    return "".join(out)


def _pop_events(lines: list[CaptionLine], active: str) -> str:
    """One event per word: full line shown, active word recoloured + scaled."""
    out: list[str] = []
    for line in lines:
        words = line["words"]
        for i, w in enumerate(words):
            start = w["start_ms"]
            end = words[i + 1]["start_ms"] if i + 1 < len(words) else line["end_ms"]
            if end <= start:
                end = start + 200
            rendered: list[str] = []
            for j, ww in enumerate(words):
                token = _escape(ww["text"])
                if j == i:
                    rendered.append(f"{{\\c{active}\\fscx115\\fscy115}}{token}{{\\r}}")
                else:
                    rendered.append(token)
            text = " ".join(rendered)
            out.append(
                f"Dialogue: 0,{_format_ts(start)},{_format_ts(end)},Cap,,0,0,0,,{text}\n"
            )
    return "".join(out)
