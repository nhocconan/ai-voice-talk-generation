"""Video re-voice pipeline (Mode B — NotebookLM-style podcast videos).

Steps:
  1. Download source video + per-speaker reference samples.
  2. Extract original audio via ffmpeg.
  3. Run ASR + diarization on the original track if the caller did not supply
     pre-aligned segments.
  4. Synthesize each segment with the assigned speaker's voice using the
     configured TTS provider.
  5. Mux the synthesized track back into the source video, replacing the
     original audio. Burned-in captions are written when ``captions=True``.

The implementation deliberately reuses the existing render helpers so it stays
small. Output is an MP4 stored at ``renders/{generation_id}/output.mp4`` plus
the synthesized MP3/WAV side-tracks so the user can still download audio-only.
"""

from __future__ import annotations

import asyncio
import subprocess
import tempfile
from collections.abc import Awaitable, Callable
from pathlib import Path

from ..audio.audiogram import write_ass
from ..audio.io import encode_mp3, encode_wav_24bit, get_duration_ms
from ..audio.stitch import stitch_to_timeline
from ..audio.subtitles import write_srt, write_vtt
from ..config import settings
from ..logging import get_logger
from ..providers.base import TTSProvider, VoiceRef
from ..services.storage import download_object, upload_object
from .render import _bytes_to_wav, prepare_tts_text

logger = get_logger("pipeline.video_revoice")


async def run_video_revoice(
    *,
    generation_id: str,
    provider: TTSProvider,
    source_video_key: str,
    speakers: list[dict],
    captions: bool,
    progress_fn: Callable[[str, float, str], Awaitable[None]],
    result_fn: Callable[..., Awaitable[None]],
    preserve_music: bool = False,
) -> None:
    logger.info("Video re-voice start", generation_id=generation_id)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        # 1. Download source video
        src_video = tmp_dir / "source.mp4"
        await asyncio.to_thread(download_object, source_video_key, src_video)
        await progress_fn(generation_id, 0.05, "Source video downloaded")

        # 2. Prepare voice refs
        voice_refs: dict[str, VoiceRef] = {}
        for spk in speakers:
            label = spk["label"]
            pinned_voice_id = str(spk.get("provider_voice_id") or "").strip()
            if pinned_voice_id:
                voice_refs[label] = VoiceRef(
                    provider_name=provider.name, data={"voice_id": pinned_voice_id}
                )
                logger.info("Using pinned provider voice", label=label, voice_id=pinned_voice_id)
                continue
            sample_paths: list[Path] = []
            for key in spk.get("sample_keys", []):
                dest = tmp_dir / f"ref_{label}_{Path(key).name}"
                await asyncio.to_thread(download_object, key, dest)
                sample_paths.append(dest)
            if sample_paths:
                voice_refs[label] = await provider.prepare_voice(sample_paths)
        await progress_fn(generation_id, 0.15, "Voice references prepared")

        # 3. Gather segments (caller must supply timed segments — usually via the
        # /generate/video-revoice flow which first runs the ASR pipeline on the
        # extracted audio and lets the user assign speakers).
        all_segments: list[dict] = []
        for spk in speakers:
            for seg in spk.get("segments", []):
                all_segments.append({**seg, "label": spk["label"], "lang": spk.get("lang", "vi")})
        all_segments.sort(key=lambda s: s.get("startMs", s.get("start_ms", 0)))

        if not all_segments:
            raise ValueError("Video re-voice requires at least one timed segment")

        # 4. Synthesize per segment, then lay each on the original timeline so the
        # replaced audio stays time-locked to the preserved video frames (FR-9).
        placements: list[tuple[int, Path]] = []
        for i, seg in enumerate(all_segments):
            label = seg["label"]
            text = seg["text"]
            lang = seg.get("lang", "vi")
            voice_ref = voice_refs.get(label, VoiceRef("", {}))
            start_ms = int(seg.get("startMs", seg.get("start_ms", 0)))

            pct = 0.15 + (i / len(all_segments)) * 0.6
            await progress_fn(generation_id, pct, f"Synth {label}: {i + 1}/{len(all_segments)}")

            audio_bytes = await provider.synthesize(prepare_tts_text(text, lang), voice_ref, lang)
            seg_path = tmp_dir / f"vrv_seg_{i:04d}_{label}.wav"
            _bytes_to_wav(audio_bytes, seg_path)
            placements.append((start_ms, seg_path))

        stitched = tmp_dir / "stitched.wav"
        stitch_to_timeline(placements, stitched)

        # 4b. Optionally mix the cloned voices back over the original music/SFX
        # bed instead of dropping it. Best-effort: fall back to voice-only on error.
        if preserve_music:
            try:
                from ..audio.separate import mix_over_bed, separate_vocals

                await progress_fn(generation_id, 0.76, "Separating music bed")
                orig_audio = tmp_dir / "orig_audio.wav"
                await extract_audio(src_video, orig_audio)
                _, accompaniment = await separate_vocals(orig_audio, tmp_dir / "sep")
                mixed = tmp_dir / "stitched_with_music.wav"
                await mix_over_bed(stitched, accompaniment, mixed)
                stitched = mixed
                logger.info("Music bed preserved")
            except Exception as e:
                logger.warning("preserve_music skipped", error=str(e))

        # 5. Encode audio side-products
        await progress_fn(generation_id, 0.8, "Encoding audio")
        mp3_path = tmp_dir / "output.mp3"
        await encode_mp3(stitched, mp3_path)
        wav_path = tmp_dir / "output.wav"
        await encode_wav_24bit(stitched, wav_path)

        # 6. Mux new audio into the source video. We replace, not mix.
        await progress_fn(generation_id, 0.88, "Muxing video")
        muxed = tmp_dir / "muxed.mp4"
        await _mux_audio(src_video, stitched, muxed)

        # 7. Burn captions (optional). Prefer word-level animated captions
        # aligned to the actual re-voiced audio; fall back to segment captions.
        final = muxed
        if captions:
            ass_path = tmp_dir / "captions.ass"
            wrote_words = False
            if settings.audiogram_word_captions:
                wrote_words = await _write_word_captions_1080p(
                    stitched, ass_path, lang=all_segments[0].get("lang", "vi")
                )
            if not wrote_words:
                write_ass(
                    [
                        {
                            "start_ms": int(s.get("startMs", s.get("start_ms", 0))),
                            "end_ms": int(s.get("endMs", s.get("end_ms", 0))),
                            "text": f"[{s['label']}] {s['text']}",
                        }
                        for s in all_segments
                    ],
                    ass_path,
                    play_res_x=1920,
                    play_res_y=1080,
                )
            captioned = tmp_dir / "captioned.mp4"
            await _burn_subtitles(muxed, ass_path, captioned)
            final = captioned

        # 8. Subtitle side-files (.srt/.vtt) from the timed segments
        subtitle_segments = [
            {
                "start_ms": int(s.get("startMs", s.get("start_ms", 0))),
                "end_ms": int(s.get("endMs", s.get("end_ms", 0))),
                "text": f"[{s['label']}] {s['text']}",
            }
            for s in all_segments
        ]
        srt_path = write_srt(subtitle_segments, tmp_dir / "output.srt")
        vtt_path = write_vtt(subtitle_segments, tmp_dir / "output.vtt")

        # 9. Upload all artifacts
        await progress_fn(generation_id, 0.95, "Uploading")
        mp3_key = f"renders/{generation_id}/output.mp3"
        wav_key = f"renders/{generation_id}/output.wav"
        video_key = f"renders/{generation_id}/output.mp4"
        srt_key = f"renders/{generation_id}/output.srt"
        vtt_key = f"renders/{generation_id}/output.vtt"
        await asyncio.to_thread(upload_object, mp3_path, mp3_key, "audio/mpeg")
        await asyncio.to_thread(upload_object, wav_path, wav_key, "audio/wav")
        await asyncio.to_thread(upload_object, final, video_key, "video/mp4")
        await asyncio.to_thread(upload_object, srt_path, srt_key, "text/plain")
        await asyncio.to_thread(upload_object, vtt_path, vtt_key, "text/vtt")
        logger.info("Subtitles uploaded", srt_key=srt_key, vtt_key=vtt_key)

        duration_ms = await get_duration_ms(stitched)

    await progress_fn(generation_id, 1.0, "Done")
    await result_fn(
        generation_id=generation_id,
        output_mp3_key=mp3_key,
        output_wav_key=wav_key,
        output_video_key=video_key,
        duration_ms=duration_ms,
    )
    logger.info("Video re-voice complete", generation_id=generation_id, duration_ms=duration_ms)


async def _write_word_captions_1080p(audio_path: Path, ass_path: Path, *, lang: str) -> bool:
    """Align the re-voiced audio to words and write a 1080p karaoke ASS.
    Best-effort: returns False so the caller falls back to segment captions."""
    try:
        from ..audio.align import align_words
        from ..audio.captions import group_words_into_lines, write_karaoke_ass

        words = await asyncio.to_thread(align_words, audio_path, language=lang)
        if not words:
            return False
        lines = group_words_into_lines(words, max_chars=52)
        write_karaoke_ass(
            lines,
            ass_path,
            preset=settings.caption_preset,
            play_res_x=1920,
            play_res_y=1080,
            font_size=64,
            margin_v=140,
        )
        logger.info("Word-level video captions written", words=len(words), lines=len(lines))
        return True
    except Exception as e:
        logger.warning("Word caption generation failed for video", error=str(e))
        return False


async def extract_audio(video_path: Path, out_path: Path, *, sample_rate: int = 24000) -> Path:
    """Extract a mono PCM WAV from a video file. Used by the web tier before ASR."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "wav",
        str(out_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg extract_audio failed: {stderr.decode('utf-8', errors='replace')[-400:]}"
        )
    return out_path


async def _mux_audio(video_path: Path, audio_path: Path, out_path: Path) -> None:
    """Replace audio track of ``video_path`` with ``audio_path``."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(out_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg mux failed: {stderr.decode('utf-8', errors='replace')[-400:]}"
        )


async def _burn_subtitles(video_path: Path, ass_path: Path, out_path: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        f"ass={ass_path.as_posix()}",
        "-c:a",
        "copy",
        str(out_path),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg subtitle burn failed: {stderr.decode('utf-8', errors='replace')[-400:]}"
        )
