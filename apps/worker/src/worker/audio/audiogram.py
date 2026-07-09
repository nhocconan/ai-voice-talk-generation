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

# User-selectable background themes for Mode-A audiogram (presentation/podcast).
# Keys are stable API values; hex pairs drive ffmpeg canvas + waveform colour.
AUDIOGRAM_THEMES: dict[str, dict[str, str]] = {
    "dark": {"bg": "#0B0B0F", "wave": "#7FFFFF", "label": "Dark"},
    "midnight": {"bg": "#0A1628", "wave": "#60A5FA", "label": "Midnight blue"},
    "forest": {"bg": "#0C1F17", "wave": "#4ADE80", "label": "Forest"},
    "sunset": {"bg": "#1A0F14", "wave": "#FB923C", "label": "Sunset"},
    "brand": {"bg": "#1A0508", "wave": "#E5001A", "label": "Brand red"},
    "slate": {"bg": "#111827", "wave": "#A78BFA", "label": "Slate violet"},
}


def resolve_theme(theme_id: str | None) -> dict[str, str]:
    """Return ``{bg, wave, label}`` for a theme id; unknown → dark."""
    key = (theme_id or "dark").strip().lower()
    return AUDIOGRAM_THEMES.get(key, AUDIOGRAM_THEMES["dark"])


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
    caption_font_size: int = 44,
    title_font_size: int = 56,
    caption_margin_v: int = 80,
    title_margin_v: int = 60,
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
        f"Style: Caption,Inter,{caption_font_size},&H00FFFFFF,&H80000000,&H80000000,0,1,2,1,2,"
        f"{caption_margin_v}\n"
        f"Style: Title,Inter,{title_font_size},&H00FFFFFF,&H80000000,&H80000000,1,1,2,1,8,"
        f"{title_margin_v}\n\n"
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
    aspect: str = "1:1",
    duration_ms: int | None = None,
    background_hex: str = "#0B0B0F",
    wave_hex: str = "#7FFFFF",
    word_captions: bool = False,
    caption_preset: str = "pop",
    lang: str | None = None,
) -> Path:
    """Render an audiogram MP4 from ``audio_path``. Returns ``out_path``.

    ``aspect`` selects the canvas size ("1:1"->1080x1080, "9:16"->1080x1920,
    "16:9"->1920x1080; unknown values fall back to "1:1"). Uses an animated
    ``gradients`` background (falling back to a solid ``color`` fill on ffmpeg
    builds without it), ffmpeg's ``showwaves`` for the live waveform, a
    left→right progress bar along the bottom edge, and burns captions for the
    transcript so the result is a single self-contained video file. When
    ``word_captions`` is set, the audio is aligned to word-level timing and the
    captions animate word-by-word (the modern "active word" look); otherwise the
    supplied segment/chapter captions are burned. ``duration_ms`` (used to drive
    the progress bar) is computed from the audio when not supplied.
    """
    segments = segments or []
    ass_path = out_path.with_suffix(".ass")

    width, height = _resolve_dimensions(aspect)
    _, wave_y = _wave_geometry(aspect, width, height)
    caption_fs, title_fs, caption_margin_v = _caption_geometry(height, wave_y)

    if duration_ms is None:
        from .io import get_duration_ms

        duration_ms = await get_duration_ms(audio_path)

    wrote_word_captions = False
    if word_captions:
        wrote_word_captions = await _write_word_captions(
            audio_path,
            ass_path,
            play_res_x=width,
            play_res_y=height,
            font_size=caption_fs,
            margin_v=caption_margin_v,
            preset=caption_preset,
            lang=lang,
        )
    if not wrote_word_captions:
        write_ass(
            segments,
            ass_path,
            title=title,
            play_res_x=width,
            play_res_y=height,
            caption_font_size=caption_fs,
            title_font_size=title_fs,
            caption_margin_v=caption_margin_v,
        )

    caption_chain = _subtitle_filter_chain(ass_path)
    pil_overlays: list[tuple[Path, float, float]] = []
    if not caption_chain and ass_path.exists():
        # Homebrew/minimal ffmpeg often lacks libass — burn captions via Pillow
        # PNG overlays instead of silently shipping a caption-less video.
        logger.warning(
            "ffmpeg has no ass/subtitles filter; using Pillow caption overlays",
            out=str(out_path),
        )
        caption_src = segments
        if not caption_src and title:
            caption_src = [{"start_ms": 0, "end_ms": duration_ms, "text": title}]
        pil_overlays = await asyncio.to_thread(
            _render_caption_overlays,
            caption_src,
            out_path.parent,
            width,
            height,
            caption_fs,
            caption_margin_v,
        )

    filter_complex, final_label = _build_filter_complex(
        width=width,
        height=height,
        aspect=aspect,
        background_hex=background_hex,
        wave_hex=wave_hex,
        duration_s=duration_ms / 1000.0,
        use_gradients=_has_ffmpeg_filter("gradients"),
        caption_chain=caption_chain,
        pil_overlay_count=len(pil_overlays),
        pil_overlay_times=[(s, e) for _p, s, e in pil_overlays],
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(audio_path),
    ]
    for png, _s, _e in pil_overlays:
        cmd += ["-loop", "1", "-i", str(png)]
    cmd += [
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
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(out_path),
    ]
    # enable=between(t,start,end) is embedded in filter_complex for each overlay

    logger.info(
        "Rendering audiogram",
        audio=str(audio_path),
        out=str(out_path),
        theme_bg=background_hex,
        pil_captions=len(pil_overlays),
        ass_captions=bool(caption_chain),
    )
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


async def _write_word_captions(
    audio_path: Path,
    ass_path: Path,
    *,
    play_res_x: int,
    play_res_y: int,
    font_size: int,
    margin_v: int,
    preset: str,
    lang: str | None,
) -> bool:
    """Align the audio to words and write an animated karaoke ASS. Best-effort:
    returns False (so the caller falls back to segment captions) on any failure."""
    try:
        from .align import align_words
        from .captions import group_words_into_lines, write_karaoke_ass

        words = await asyncio.to_thread(align_words, audio_path, language=lang)
        if not words:
            return False
        lines = group_words_into_lines(words)
        write_karaoke_ass(
            lines,
            ass_path,
            preset=preset,
            play_res_x=play_res_x,
            play_res_y=play_res_y,
            font_size=font_size,
            margin_v=margin_v,
        )
        logger.info("Word-level captions written", words=len(words), lines=len(lines))
        return True
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("Word caption generation failed", error=str(e))
        return False


_ASPECT_DIMENSIONS: dict[str, tuple[int, int]] = {
    "1:1": (1080, 1080),
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
}


def _resolve_dimensions(aspect: str) -> tuple[int, int]:
    """Map an aspect ratio label to (width, height). Unknown → 1:1."""
    return _ASPECT_DIMENSIONS.get(aspect, _ASPECT_DIMENSIONS["1:1"])


def _wave_geometry(aspect: str, width: int, height: int) -> tuple[int, int]:
    """Return (wave_height, wave_y) for the showwaves overlay.

    Waveform height is ≈ H/4. For 9:16 (Reels/TikTok) it sits in the lower-middle
    while keeping ≥320px clear at the very bottom and ≥220px at the top so the
    waveform never intrudes on the platform safe areas. For 1:1 / 16:9 it sits in
    the lower third.
    """
    wave_h = height // 4
    # 9:16 (Reels/TikTok): keep 320px clear at the bottom; others sit lower-third.
    if aspect == "9:16":  # noqa: SIM108 - kept as if/else for the safe-area comment
        wave_y = height - 320 - wave_h  # 1080p -> 1120
    else:
        wave_y = height - wave_h - (height // 8)
    return wave_h, wave_y


def _caption_geometry(height: int, wave_y: int) -> tuple[int, int, int]:
    """Return (caption_font_size, title_font_size, caption_margin_v).

    Captions are placed just above the waveform (MarginV is measured from the
    bottom for bottom-centered alignment), so on 9:16 they land vertically-ish
    centred above the lower-middle waveform.
    """
    caption_font_size = max(44, height // 22)
    title_font_size = max(52, height // 18)
    caption_margin_v = height - wave_y + 40
    return caption_font_size, title_font_size, caption_margin_v


def _gradient_palette(background_hex: str) -> tuple[str, str]:
    """Derive two dark gradient stops (hex, no ``#``) from ``background_hex``.

    Kept intentionally dark — the second stop only nudges each channel up and is
    capped so captions stay readable over the animated background.
    """
    raw = background_hex.lstrip("#")
    try:
        r, g, b = (int(raw[i : i + 2], 16) for i in (0, 2, 4))
    except (ValueError, IndexError):
        r, g, b = (0x0B, 0x0B, 0x0F)
    c0 = f"{r:02x}{g:02x}{b:02x}"
    lr, lg, lb = (min(c + 28, 0x40) for c in (r, g, b))
    c1 = f"{lr:02x}{lg:02x}{lb:02x}"
    return c0, c1


def _build_filter_complex(
    *,
    width: int,
    height: int,
    aspect: str,
    background_hex: str,
    wave_hex: str,
    duration_s: float,
    use_gradients: bool,
    caption_chain: str,
    pil_overlay_count: int = 0,
    pil_overlay_times: list[tuple[float, float]] | None = None,
) -> tuple[str, str]:
    """Build the ffmpeg ``-filter_complex`` graph and the final output label.

    Layers: animated gradient (or solid) background → showwaves waveform overlay
    → a thin left→right progress bar overlaid at the bottom edge → optional burned
    captions (libass chain or Pillow PNG overlays). The progress bar is a full-width
    colored source overlaid at an x-expression driven by ``t``.
    """
    bg = background_hex.lstrip("#")
    wv = wave_hex.lstrip("#")
    wave_h, wave_y = _wave_geometry(aspect, width, height)
    bar_h = 10
    dur = max(duration_s, 0.001)

    if use_gradients:
        c0, c1 = _gradient_palette(background_hex)
        bg_src = f"gradients=s={width}x{height}:c0=0x{c0}:c1=0x{c1}:speed=0.03:r=30[bg]"
    else:
        bg_src = f"color=c=0x{bg}:s={width}x{height}:r=30[bg]"

    bar_expr = f"-{width}+{width}*t/{dur:.3f}"
    parts = [
        bg_src,
        # `draw=full` is load-bearing: the default `draw=scale` shades each sample
        # by amplitude, so the waveform comes out near-transparent and is invisible
        # against the dark background.
        f"[0:a]showwaves=s={width}x{wave_h}:mode=cline:colors=0x{wv}:rate=30:draw=full,"
        f"format=rgba[wave]",
        f"[bg][wave]overlay=0:{wave_y}:shortest=1[wbg]",
        f"color=c=0x{wv}:s={width}x{bar_h}:r=30[barsrc]",
        f"[wbg][barsrc]overlay=x='{bar_expr}':y={height - bar_h}:shortest=1[prog]",
    ]
    final_label = "[prog]"
    if caption_chain:
        parts.append(f"[prog]{caption_chain}[v]")
        final_label = "[v]"
    elif pil_overlay_count > 0:
        # Input 0 = audio; inputs 1..N = looped PNG caption plates.
        # Times are injected by rewriting enable= after this helper returns —
        # we store placeholders here and fill them in render_audiogram.
        times = pil_overlay_times or [(0.0, dur)] * pil_overlay_count
        prev = "prog"
        for i in range(pil_overlay_count):
            start_s, end_s = times[i] if i < len(times) else (0.0, dur)
            nxt = f"c{i}" if i < pil_overlay_count - 1 else "v"
            # PNG inputs start at stream index 1
            parts.append(
                f"[{prev}][{i + 1}:v]overlay=0:0:enable='between(t\\,{start_s:.3f}\\,{end_s:.3f})'"
                f":shortest=0[{nxt}]"
            )
            prev = nxt
        final_label = f"[{prev}]" if prev != "v" else "[v]"
        if prev == "v":
            final_label = "[v]"
    return ";".join(parts), final_label


def _render_caption_overlays(
    segments: list[AudiogramSegment],
    tmp_dir: Path,
    width: int,
    height: int,
    font_size: int,
    margin_v: int,
) -> list[tuple[Path, float, float]]:
    """Rasterize caption lines to transparent PNGs for ffmpeg overlay.

    Returns ``[(png_path, start_s, end_s), ...]``. Caps at 48 plates so the
    filter graph stays manageable.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        logger.warning("Pillow unavailable; cannot burn caption overlays")
        return []

    segs = [s for s in segments if (s.get("text") or "").strip()][:48]
    if not segs:
        return []

    # Prefer a Unicode-capable system font for Vietnamese diacritics.
    font = _load_caption_font(font_size)
    results: list[tuple[Path, float, float]] = []
    for i, seg in enumerate(segs):
        text = str(seg["text"]).strip()
        start_ms = int(seg.get("start_ms", 0))
        end_ms = int(seg.get("end_ms", start_ms + 3000))
        if end_ms <= start_ms:
            end_ms = start_ms + 1500
        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        # Word-wrap to ~90% width
        max_w = int(width * 0.9)
        lines = _wrap_text(draw, text, font, max_w)
        line_h = font_size + 8
        block_h = line_h * len(lines)
        # MarginV is from bottom for ASS-style placement
        y0 = height - margin_v - block_h
        y0 = max(40, y0)
        for li, line in enumerate(lines):
            bbox = draw.textbbox((0, 0), line, font=font)
            tw = bbox[2] - bbox[0]
            x = (width - tw) // 2
            y = y0 + li * line_h
            # Soft dark pill behind text for contrast on any theme
            pad_x, pad_y = 16, 8
            draw.rounded_rectangle(
                [x - pad_x, y - pad_y, x + tw + pad_x, y + line_h - 4 + pad_y],
                radius=12,
                fill=(0, 0, 0, 150),
            )
            draw.text((x, y), line, font=font, fill=(255, 255, 255, 255))
        path = tmp_dir / f"cap_{i:03d}.png"
        img.save(path, "PNG")
        results.append((path, start_ms / 1000.0, end_ms / 1000.0))
    return results


def _load_caption_font(size: int):  # noqa: ANN201
    from PIL import ImageFont

    candidates = [
        # macOS
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        # Debian/Ubuntu worker image (fonts-dejavu-core / fonts-noto-core)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _wrap_text(draw, text: str, font, max_width: int) -> list[str]:  # noqa: ANN001
    words = text.split()
    if not words:
        return [text]
    lines: list[str] = []
    buf: list[str] = []
    for w in words:
        trial = (" ".join(buf + [w])).strip()
        tw = draw.textbbox((0, 0), trial, font=font)[2]
        if buf and tw > max_width:
            lines.append(" ".join(buf))
            buf = [w]
        else:
            buf.append(w)
    if buf:
        lines.append(" ".join(buf))
    return lines or [text]


@lru_cache(maxsize=8)
def _has_ffmpeg_filter(name: str) -> bool:
    """Return True if ``name`` is a filter this ffmpeg build ships. Cached.

    Probes ``ffmpeg -filters`` the same way :func:`_detect_subtitle_filter` does;
    used to fall back from the animated ``gradients`` background to a solid
    ``color`` fill on builds that lack it.
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
        return False
    names = {line.split()[1] for line in result.stdout.splitlines() if len(line.split()) >= 2}
    return name in names


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
