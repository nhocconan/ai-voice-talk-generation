"""Render pipeline: script → chunks → TTS → stitch → encode → upload."""

from __future__ import annotations

import asyncio
import io
import re
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

import httpx
import numpy as np
import soundfile as sf

from ..audio.io import (
    encode_mp3,
    encode_wav_24bit,
    fit_audio_duration,
    get_duration_ms,
    normalize_audio,
)
from ..audio.stitch import stitch_segments
from ..config import settings
from ..logging import get_logger
from ..providers.base import TTSProvider, VoiceRef
from ..services.storage import download_object, upload_object
from ..text import normalize_vietnamese

logger = get_logger("pipeline.render")

SAMPLE_RATE = 24000


def prepare_tts_text(text: str, lang: str) -> str:
    """Normalize text just before synthesis. For Vietnamese, expands numbers /
    dates / currency to spoken form so the engine reads them naturally."""
    if lang == "vi" and settings.vi_normalize:
        return normalize_vietnamese(text)
    return text


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
    audiogram_title: str | None = None,
    source_audio_key: str | None = None,
) -> None:
    logger.info("Render start", generation_id=generation_id, kind=kind)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        # Download reference samples for each speaker
        voice_refs: dict[str, VoiceRef] = {}
        for spk in speakers:
            label = spk["label"]

            if spk.get("keepOriginal") or spk.get("keep_original"):
                continue

            # Profile pins a provider-native voice_id (e.g. an xAI Console
            # custom voice) — use it directly, no reference cloning needed.
            pinned_voice_id = str(spk.get("provider_voice_id") or "").strip()
            if pinned_voice_id:
                voice_refs[label] = VoiceRef(
                    provider_name=provider.name, data={"voice_id": pinned_voice_id}
                )
                logger.info("Using pinned provider voice", label=label, voice_id=pinned_voice_id)
                continue

            sample_paths = []
            for key in spk.get("sample_keys", []):
                dest = tmp_dir / f"ref_{label}_{Path(key).name}"
                await asyncio.to_thread(download_object, key, dest)
                sample_paths.append(dest)

            if sample_paths:
                reference_paths = sample_paths
                if len(sample_paths) > 1:
                    combined_ref = tmp_dir / f"ref_{label}_combined.wav"
                    stitch_segments(sample_paths, combined_ref)
                    reference_paths = [combined_ref]
                voice_refs[label] = await provider.prepare_voice(reference_paths)
                logger.info("Voice prepared", label=label, samples=len(sample_paths))

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
        elif kind == "REVOICE":
            if not source_audio_key:
                raise ValueError("REVOICE render requires sourceAudioKey")
            source_path = tmp_dir / "source_audio"
            source_wav = tmp_dir / "source_normalized.wav"
            await asyncio.to_thread(download_object, source_audio_key, source_path)
            await normalize_audio(source_path, source_wav)
            output_wav, chapters = await _render_revoice(
                tmp_dir=tmp_dir,
                source_wav=source_wav,
                speakers=speakers,
                voice_refs=voice_refs,
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

        # Audiogram (Mode A) — social-ready MP4 with waveform + captions.
        video_key: str | None = None
        if output.get("audiogram"):
            from ..audio.audiogram import resolve_theme, render_audiogram

            await progress_fn(generation_id, 0.93, "Rendering audiogram")
            # Podcasts: chapter titles. Presentations: chapters is empty — build
            # timed caption lines from the speaker script so text overlay always
            # has content even when word-alignment fails.
            audiogram_segments = [
                {"start_ms": c["start_ms"], "end_ms": c["end_ms"], "text": c["title"]}
                for c in chapters
            ]
            if not audiogram_segments:
                script_parts: list[str] = []
                for spk in speakers:
                    if spk.get("script"):
                        script_parts.append(str(spk["script"]))
                    for seg in spk.get("segments") or []:
                        if isinstance(seg, dict) and seg.get("text"):
                            script_parts.append(str(seg["text"]))
                audiogram_segments = _caption_segments_from_script(
                    "\n".join(script_parts),
                    duration_ms,
                )
            audiogram_path = tmp_dir / "audiogram.mp4"
            audiogram_lang = speakers[0].get("lang", "vi") if speakers else "vi"
            theme = resolve_theme(str(output.get("audiogram_theme") or output.get("audiogramTheme") or "dark"))
            await render_audiogram(
                audio_path=output_wav,
                out_path=audiogram_path,
                segments=audiogram_segments,
                title=audiogram_title,
                aspect=output.get("audiogram_aspect") or output.get("audiogramAspect") or "1:1",
                duration_ms=duration_ms,
                background_hex=theme["bg"],
                wave_hex=theme["wave"],
                word_captions=settings.audiogram_word_captions,
                caption_preset=settings.caption_preset,
                lang=audiogram_lang,
            )
            video_key = f"renders/{generation_id}/audiogram.mp4"
            await asyncio.to_thread(upload_object, audiogram_path, video_key, "video/mp4")

    await progress_fn(generation_id, 1.0, "Done")
    await result_fn(
        generation_id=generation_id,
        output_mp3_key=mp3_key,
        output_wav_key=wav_key,
        output_video_key=video_key,
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
    lang = speaker.get("lang", "vi")
    script: str = speaker.get("script") or "\n".join(
        seg["text"] for seg in speaker.get("segments", [])
    )
    script = prepare_tts_text(script, lang)
    chunks = _chunk_text(script, provider.max_chunk_chars, lang=lang)
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

        audio_bytes = await provider.synthesize(prepare_tts_text(text, lang), voice_ref, lang)
        seg_path = tmp_dir / f"seg_{i:04d}_{label}.wav"
        _bytes_to_wav(audio_bytes, seg_path)
        segment_wavs.append(seg_path)

    output = tmp_dir / "stitched.wav"
    stitch_segments(segment_wavs, output)

    # Build chapter markers from per-segment durations
    chapters = _build_chapters(segment_wavs, all_segments)
    return output, chapters


async def _render_revoice(
    *,
    tmp_dir: Path,
    source_wav: Path,
    speakers: list[dict],
    voice_refs: dict[str, VoiceRef],
    provider: TTSProvider,
    progress_fn,
    generation_id: str,
    pacing_lock: bool = False,
) -> tuple[Path, list[ChapterEntry]]:
    """Replace selected speaker intervals while retaining all other source audio."""
    source, sample_rate = sf.read(str(source_wav), dtype="float32")
    if sample_rate != SAMPLE_RATE:
        raise ValueError(f"Expected {SAMPLE_RATE} Hz normalized source, got {sample_rate}")
    if source.ndim > 1:
        source = source.mean(axis=1)

    replacements: list[dict] = []
    all_segments: list[dict] = []
    for speaker in speakers:
        keep_original = bool(speaker.get("keepOriginal") or speaker.get("keep_original"))
        for segment in speaker.get("segments", []):
            item = {**segment, "label": speaker["label"], "lang": speaker.get("lang", "vi")}
            all_segments.append(item)
            if not keep_original:
                replacements.append(item)

    replacements.sort(key=lambda segment: segment.get("startMs", segment.get("start_ms", 0)))
    for index, segment in enumerate(replacements):
        start_ms = int(segment.get("startMs", segment.get("start_ms", 0)))
        end_ms = int(segment.get("endMs", segment.get("end_ms", start_ms)))
        if end_ms <= start_ms:
            continue
        text = str(segment.get("text", ""))
        lang = str(segment.get("lang", "vi"))
        if pacing_lock:
            text = await _rephrase_for_pacing(text, end_ms - start_ms, lang)

        await progress_fn(
            generation_id,
            0.1 + (index / max(len(replacements), 1)) * 0.7,
            f"Replacing speaker {segment['label']}: segment {index + 1}/{len(replacements)}",
        )
        audio_bytes = await provider.synthesize(
            prepare_tts_text(text, lang),
            voice_refs.get(str(segment["label"]), VoiceRef("", {})),
            lang,
        )
        clip_path = tmp_dir / f"replacement_{index:04d}.wav"
        fitted_path = tmp_dir / f"replacement_{index:04d}_fitted.wav"
        _bytes_to_wav(audio_bytes, clip_path)
        target_ms = end_ms - start_ms
        await fit_audio_duration(clip_path, fitted_path, target_ms)
        clip, clip_rate = sf.read(str(fitted_path), dtype="float32")
        if clip.ndim > 1:
            clip = clip.mean(axis=1)
        target_samples = max(1, round((end_ms - start_ms) * SAMPLE_RATE / 1000))
        if clip_rate != SAMPLE_RATE:
            raise ValueError(f"Expected {SAMPLE_RATE} Hz fitted clip, got {clip_rate}")
        if len(clip) < target_samples:
            clip = np.pad(clip, (0, target_samples - len(clip)))

        start_sample = max(0, round(start_ms * SAMPLE_RATE / 1000))
        end_sample = min(len(source), start_sample + target_samples)
        if end_sample > start_sample:
            source[start_sample:end_sample] = clip[: end_sample - start_sample]

    output = tmp_dir / "revoiced.wav"
    sf.write(str(output), np.clip(source, -1.0, 1.0), SAMPLE_RATE, subtype="PCM_16")
    chapters = [
        {
            "title": f"[{segment.get('label', 'A')}] {str(segment.get('text', ''))[:60]}",
            "start_ms": int(segment.get("startMs", segment.get("start_ms", 0))),
            "end_ms": int(segment.get("endMs", segment.get("end_ms", 0))),
        }
        for segment in sorted(
            all_segments,
            key=lambda item: item.get("startMs", item.get("start_ms", 0)),
        )
    ]
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


def _caption_segments_from_script(script: str, duration_ms: int) -> list[dict]:
    """Split a presentation script into timed caption lines by character weight.

    Used when there are no podcast chapters — otherwise presentation audiograms
    burned only a title (or nothing) and looked "caption-less".
    """
    raw = (script or "").strip()
    if not raw or duration_ms <= 0:
        return []
    # Prefer sentence boundaries; fall back to line breaks / coarse chunks.
    parts = [p.strip() for p in re.split(r"(?<=[.!?…。！？])\s+|\n+", raw) if p.strip()]
    if not parts:
        parts = [raw]
    # Cap line length for mobile readability.
    lines: list[str] = []
    for part in parts:
        if len(part) <= 90:
            lines.append(part)
            continue
        words = part.split()
        buf: list[str] = []
        for w in words:
            trial = (" ".join(buf + [w])).strip()
            if buf and len(trial) > 80:
                lines.append(" ".join(buf))
                buf = [w]
            else:
                buf.append(w)
        if buf:
            lines.append(" ".join(buf))
    weights = [max(len(line), 1) for line in lines]
    total_w = sum(weights) or 1
    cursor = 0
    segs: list[dict] = []
    for i, (line, w) in enumerate(zip(lines, weights)):
        if i == len(lines) - 1:
            end = duration_ms
        else:
            end = min(duration_ms, cursor + int(duration_ms * (w / total_w)))
            end = max(end, cursor + 800)
        segs.append({"start_ms": cursor, "end_ms": end, "text": line})
        cursor = end
    return segs


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
    """FR-9: Rephrase text to fit within ±5% of target_ms when spoken.

    Prefers the web app's multi-provider LLM endpoint (works with whatever
    provider the deployment has configured) and silently degrades: web endpoint
    → direct env-Gemini → original text. Never fails a render on rephrase error.
    """
    import os

    # 1. Web endpoint — routes to any configured LLM provider.
    base = settings.web_base_url.rstrip("/")
    if base:
        token = settings.internal_api_token or settings.server_secret
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    f"{base}/api/internal/llm-rephrase",
                    headers={"x-internal-token": token, "content-type": "application/json"},
                    json={"text": text, "targetMs": target_ms, "lang": lang},
                )
            if resp.status_code == 200:
                out = str(resp.json().get("text", "")).strip()
                if out:
                    return out
        except Exception as exc:  # best-effort; fall through to env-Gemini
            logger.warning("Pacing lock web rephrase failed", exc=str(exc))

    # 2. Direct env-Gemini fallback (backward compatible).
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
