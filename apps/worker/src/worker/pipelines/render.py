"""Render pipeline: script → chunks → TTS → stitch → encode → upload."""
from __future__ import annotations

import asyncio
import io
import tempfile
import re
from pathlib import Path
from typing import Callable, Awaitable

import soundfile as sf
import numpy as np

from ..audio.io import encode_mp3, encode_wav_24bit, get_duration_ms
from ..audio.stitch import stitch_segments
from ..providers.base import TTSProvider, VoiceRef
from ..services.storage import download_object, upload_object
from ..logging import get_logger

logger = get_logger("pipeline.render")

SAMPLE_RATE = 24000


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

        if kind == "PRESENTATION":
            output_wav = await _render_presentation(
                tmp_dir=tmp_dir,
                speaker=speakers[0],
                voice_ref=voice_refs.get(speakers[0]["label"]),
                provider=provider,
                progress_fn=progress_fn,
                generation_id=generation_id,
            )
        else:
            output_wav = await _render_podcast(
                tmp_dir=tmp_dir,
                speakers=speakers,
                voice_refs=voice_refs,
                provider=provider,
                progress_fn=progress_fn,
                generation_id=generation_id,
            )

        await progress_fn(generation_id, 0.85, "Encoding output files")

        # Encode outputs
        mp3_key = wav_key = None
        if output.get("mp3"):
            mp3_path = tmp_dir / "output.mp3"
            await encode_mp3(output_wav, mp3_path)
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
) -> Path:
    script: str = speaker.get("script") or "\n".join(seg["text"] for seg in speaker.get("segments", []))
    chunks = _chunk_text(script, provider.max_chunk_chars, lang=speaker.get("lang", "vi"))
    logger.info("Chunked script", chunks=len(chunks))

    segment_wavs: list[Path] = []
    for i, chunk in enumerate(chunks):
        progress = 0.1 + (i / len(chunks)) * 0.7
        await progress_fn(generation_id, progress, f"Rendering chunk {i + 1}/{len(chunks)}")

        audio_bytes = await provider.synthesize(chunk, voice_ref or VoiceRef("", {}), speaker.get("lang", "vi"))
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
) -> Path:
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

        progress = 0.1 + (i / total) * 0.7
        await progress_fn(generation_id, progress, f"Speaker {label}: segment {i + 1}/{total}")

        audio_bytes = await provider.synthesize(text, voice_ref, lang)
        seg_path = tmp_dir / f"seg_{i:04d}_{label}.wav"
        _bytes_to_wav(audio_bytes, seg_path)
        segment_wavs.append(seg_path)

    output = tmp_dir / "stitched.wav"
    stitch_segments(segment_wavs, output)
    return output


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
                    chunks.append(sent[j:j + max_chars])
                current = ""
            else:
                current = sent

    if current:
        chunks.append(current)
    return [c for c in chunks if c.strip()]


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
            ["ffmpeg", "-y", "-i", "pipe:0", "-ar", str(SAMPLE_RATE), "-ac", "1", "-f", "wav", "pipe:1"],
            input=audio_bytes, capture_output=True,
        )
        path.write_bytes(proc.stdout)
