"""Render pipeline: script → chunks → TTS → stitch → encode → upload."""

from __future__ import annotations

import asyncio
import io
import re
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

import soundfile as sf

from ..audio.io import encode_mp3, encode_wav_24bit, get_duration_ms
from ..audio.stitch import stitch_segments
from ..logging import get_logger
from ..providers.base import TTSProvider, VoiceRef
from ..services.storage import download_object, upload_object

logger = get_logger("pipeline.render")

SAMPLE_RATE = 24000


ChapterEntry = dict  # {title: str, start_ms: int, end_ms: int}


async def run_render(
    *,
    generation_id: str,
    kind: str,
    provider: TTSProvider,
    speakers: list[dict],  # [{label, profile_id, segments, sample_keys: list[str]}]
    output: dict,  # {mp3, wav, chapters}
    pacing_lock: bool,
    progress_fn: Callable[[str, float, str], Awaitable[None]],
    result_fn: Callable[..., Awaitable[None]],
) -> None:
    logger.info("Render start", generation_id=generation_id, kind=kind)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        # Download reference samples for each speaker
        voice_refs: dict[str, VoiceRef] = {}
        for spk in speakers:
            label = spk["label"]
            sample_paths = []
            for key in spk.get("sample_keys", []):
                dest = tmp_dir / f"ref_{label}_{Path(key).name}"
                await asyncio.to_thread(download_object, key, dest)
                sample_paths.append(dest)

            if sample_paths:
                voice_refs[label] = await provider.prepare_voice(sample_paths)
                logger.info("Voice prepared", label=label)

        await progress_fn(generation_id, 0.05, "Voice references prepared")

        chapters: list[ChapterEntry] = []

        if kind == "PRESENTATION":
            output_wav = await _render_presentation(
                tmp_dir=tmp_dir,
                speaker=speakers[0],
                voice_ref=voice_refs.get(speakers[0]["label"]),
                provider=provider,
                progress_fn=progress_fn,
                generation_id=generation_id,
                pacing_lock=pacing_lock,
            )
        else:
            output_wav, chapters = await _render_podcast(
                tmp_dir=tmp_dir,
                speakers=speakers,
                voice_refs=voice_refs,
                provider=provider,
                progress_fn=progress_fn,
                generation_id=generation_id,
                pacing_lock=pacing_lock,
            )

        await progress_fn(generation_id, 0.85, "Encoding output files")

        # Encode outputs
        mp3_key = wav_key = None
        if output.get("mp3"):
            mp3_path = tmp_dir / "output.mp3"
            await encode_mp3(output_wav, mp3_path)
            _tag_mp3_watermark(mp3_path, generation_id)
            if output.get("chapters") and chapters:
                _write_id3_chapters(mp3_path, chapters)
            mp3_key = f"renders/{generation_id}/output.mp3"
            await asyncio.to_thread(upload_object, mp3_path, mp3_key, "audio/mpeg")

        if output.get("wav"):
            wav_24bit_path = tmp_dir / "output_24bit.wav"
            await encode_wav_24bit(output_wav, wav_24bit_path)
            wav_key = f"renders/{generation_id}/output.wav"
            await asyncio.to_thread(upload_object, wav_24bit_path, wav_key, "audio/wav")

        duration_ms = await get_duration_ms(output_wav)

    await progress_fn(generation_id, 1.0, "Done")
    await result_fn(
        generation_id=generation_id,
        output_mp3_key=mp3_key,
        output_wav_key=wav_key,
        duration_ms=duration_ms,
    )
    logger.info("Render complete", generation_id=generation_id, duration_ms=duration_ms)


async def _render_presentation(
    *,
    tmp_dir: Path,
    speaker: dict,
    voice_ref: VoiceRef | None,
    provider: TTSProvider,
    progress_fn,
    generation_id: str,
    pacing_lock: bool = False,
) -> Path:
    script: str = speaker.get("script") or "\n".join(
        seg["text"] for seg in speaker.get("segments", [])
    )
    chunks = _chunk_text(script, provider.max_chunk_chars, lang=speaker.get("lang", "vi"))
    logger.info("Chunked script", chunks=len(chunks))

    segment_wavs: list[Path] = []
    for i, chunk in enumerate(chunks):
        progress = 0.1 + (i / len(chunks)) * 0.7
        await progress_fn(generation_id, progress, f"Rendering chunk {i + 1}/{len(chunks)}")

        audio_bytes = await provider.synthesize(
            chunk, voice_ref or VoiceRef("", {}), speaker.get("lang", "vi")
        )
        seg_path = tmp_dir / f"seg_{i:04d}.wav"
        _bytes_to_wav(audio_bytes, seg_path)
        segment_wavs.append(seg_path)

    output = tmp_dir / "stitched.wav"
    stitch_segments(segment_wavs, output)
    return output


async def _render_podcast(
    *,
    tmp_dir: Path,
    speakers: list[dict],
    voice_refs: dict[str, VoiceRef],
    provider: TTSProvider,
    progress_fn,
    generation_id: str,
    pacing_lock: bool = False,
) -> tuple[Path, list[ChapterEntry]]:
    # Collect and sort all segments by startMs
    all_segments: list[dict] = []
    for spk in speakers:
        for seg in spk.get("segments", []):
            all_segments.append({**seg, "label": spk["label"], "lang": spk.get("lang", "vi")})

    all_segments.sort(key=lambda s: s.get("startMs", s.get("start_ms", 0)))
    total = len(all_segments)
    segment_wavs: list[Path] = []

    for i, seg in enumerate(all_segments):
        label = seg["label"]
        text = seg["text"]
        lang = seg.get("lang", "vi")
        voice_ref = voice_refs.get(label, VoiceRef("", {}))

        # FR-9: pacing lock — rephrase segment via Gemini to fit original duration
        if pacing_lock:
            original_ms = seg.get("endMs", 0) - seg.get("startMs", 0)
            if original_ms > 0:
                text = await _rephrase_for_pacing(text, original_ms, lang)

        progress = 0.1 + (i / total) * 0.7
        await progress_fn(generation_id, progress, f"Speaker {label}: segment {i + 1}/{total}")

        audio_bytes = await provider.synthesize(text, voice_ref, lang)
        seg_path = tmp_dir / f"seg_{i:04d}_{label}.wav"
        _bytes_to_wav(audio_bytes, seg_path)
        segment_wavs.append(seg_path)

    output = tmp_dir / "stitched.wav"
    stitch_segments(segment_wavs, output)

    # Build chapter markers from per-segment durations
    chapters = _build_chapters(segment_wavs, all_segments)
    return output, chapters


def _chunk_text(text: str, max_chars: int, lang: str = "vi") -> list[str]:
    """Split text into chunks at sentence boundaries."""
    if lang == "vi":
        try:
            from underthesea import sent_tokenize  # type: ignore[import]

            sentences = sent_tokenize(text)
        except Exception:
            sentences = _simple_sentence_split(text)
    else:
        sentences = _simple_sentence_split(text)

    chunks: list[str] = []
    current = ""
    for sent in sentences:
        if len(current) + len(sent) + 1 <= max_chars:
            current = (current + " " + sent).strip()
        else:
            if current:
                chunks.append(current)
            if len(sent) > max_chars:
                # Hard split
                for j in range(0, len(sent), max_chars):
                    chunks.append(sent[j : j + max_chars])
                current = ""
            else:
                current = sent

    if current:
        chunks.append(current)
    return [c for c in chunks if c.strip()]


def _get_wav_duration_ms(path: Path) -> int:
    """Return duration of a WAV file in milliseconds."""
    data, sr = sf.read(str(path), dtype="float32")
    return int(len(data) / sr * 1000)


def _build_chapters(segment_wavs: list[Path], all_segments: list[dict]) -> list[ChapterEntry]:
    """Compute chapter start/end times from rendered segment WAV durations."""
    CROSSFADE_MS = 80
    chapters: list[ChapterEntry] = []
    cursor_ms = 0

    for i, (wav_path, seg) in enumerate(zip(segment_wavs, all_segments)):
        duration_ms = _get_wav_duration_ms(wav_path)
        label = seg.get("label", "A")
        text_preview = seg.get("text", "")[:60]
        start_ms = cursor_ms
        end_ms = cursor_ms + duration_ms
        chapters.append({"title": f"[{label}] {text_preview}", "start_ms": start_ms, "end_ms": end_ms})
        # Next segment starts after crossfade overlap
        cursor_ms += max(0, duration_ms - CROSSFADE_MS)

    return chapters


def _write_id3_chapters(mp3_path: Path, chapters: list[ChapterEntry]) -> None:
    """Write ID3 CTOC + CHAP frames for podcast navigation."""
    try:
        from mutagen.id3 import (  # type: ignore[import]
            ID3, CHAP, CTOC, TIT2, CTOCFlags
        )

        tags = ID3(str(mp3_path))

        chap_ids = []
        for i, ch in enumerate(chapters):
            chap_id = f"ch{i}"
            chap_ids.append(chap_id)
            tags.add(CHAP(
                element_id=chap_id,
                start_time=ch["start_ms"],
                end_time=ch["end_ms"],
                start_offset=0xFFFFFFFF,
                end_offset=0xFFFFFFFF,
                sub_frames=[TIT2(encoding=3, text=ch["title"])],
            ))

        tags.add(CTOC(
            element_id="toc",
            flags=CTOCFlags.TOP_LEVEL | CTOCFlags.ORDERED,
            child_element_ids=chap_ids,
            sub_frames=[TIT2(encoding=3, text="Table of Contents")],
        ))

        tags.save()
        logger.info("ID3 chapters written", count=len(chapters))
    except Exception as exc:
        logger.warning("ID3 chapter write failed", exc=str(exc))


def _tag_mp3_watermark(mp3_path: Path, generation_id: str) -> None:
    """Write ID3 TXXX:watermark tag with generation ID for abuse traceability."""
    try:
        from mutagen.id3 import ID3, TXXX  # type: ignore[import]

        tags = ID3(str(mp3_path))
        tags.add(TXXX(encoding=3, desc="watermark", text=generation_id))
        tags.save()
    except Exception as exc:
        logger.warning("ID3 watermark failed", exc=str(exc))


async def _rephrase_for_pacing(text: str, target_ms: int, lang: str) -> str:
    """FR-9: Call Gemini to rephrase text to fit within ±5% of target_ms when spoken."""
    import os

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        return text  # Skip silently if not configured

    target_words = int(target_ms / 1000 * 150 / 60)  # 150 wpm
    min_words = int(target_words * 0.95)
    max_words = int(target_words * 1.05)

    prompt = (
        f"Rewrite the following text so that when read aloud at normal speaking pace it takes "
        f"approximately {target_ms // 1000} seconds ({min_words}–{max_words} words). "
        f"Preserve the meaning and tone. Return only the rewritten text.\n\nOriginal:\n{text}"
        if lang == "en"
        else f"Viết lại đoạn văn sau để khi đọc to mất khoảng {target_ms // 1000} giây "
        f"({min_words}–{max_words} từ). Giữ nguyên ý nghĩa và giọng điệu. Chỉ trả về văn bản đã viết lại.\n\nGốc:\n{text}"
    )

    try:
        import urllib.request
        import json as _json

        body = _json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1024},
        }).encode()
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
            data = _json.loads(resp.read())
        rephrased = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return rephrased if rephrased else text
    except Exception as exc:
        logger.warning("Pacing lock Gemini call failed", exc=str(exc))
        return text


def _simple_sentence_split(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def _bytes_to_wav(audio_bytes: bytes, path: Path) -> None:
    """Write raw audio bytes to a WAV file, handling various input formats."""
    try:
        # Try soundfile first (handles WAV)
        buf = io.BytesIO(audio_bytes)
        data, sr = sf.read(buf, dtype="float32")
        if data.ndim > 1:
            data = data[:, 0]
        if sr != SAMPLE_RATE:
            import librosa  # type: ignore[import]

            data = librosa.resample(data, orig_sr=sr, target_sr=SAMPLE_RATE)
        sf.write(str(path), data, SAMPLE_RATE, subtype="PCM_16")
    except Exception:
        # Fallback: decode via ffmpeg
        import subprocess

        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                "pipe:0",
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "1",
                "-f",
                "wav",
                "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
        )
        path.write_bytes(proc.stdout)
