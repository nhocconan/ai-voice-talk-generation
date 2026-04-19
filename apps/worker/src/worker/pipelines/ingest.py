"""Voice sample ingest pipeline: download → normalize → VAD → score → store."""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from dataclasses import asdict

from ..audio.io import normalize_audio
from ..audio.quality import score_sample
from ..services.storage import download_object, upload_object
from ..logging import get_logger

logger = get_logger("pipeline.ingest")


async def run_ingest(
    *,
    profile_id: str,
    storage_key: str,
    version: int,
    user_id: str,
    notes: str | None,
    db_update_fn,  # callable(profile_id, version, output_key, duration_ms, score, detail, notes)
) -> None:
    logger.info("Ingest start", profile_id=profile_id, version=version)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        raw = tmp_dir / "raw_input"
        normalized = tmp_dir / f"v{version}.wav"

        # Download from MinIO
        await asyncio.to_thread(download_object, storage_key, raw)
        logger.info("Downloaded", bytes=raw.stat().st_size)

        # Normalize: resample to 24kHz mono, loudness -16 LUFS
        await normalize_audio(raw, normalized)
        logger.info("Normalized audio")

        # VAD trim (silero) — optional, skip if silero unavailable
        try:
            trimmed = tmp_dir / f"v{version}_trimmed.wav"
            await asyncio.to_thread(_vad_trim, normalized, trimmed)
            final_wav = trimmed
        except Exception as e:
            logger.warning("VAD trim skipped", error=str(e))
            final_wav = normalized

        # Quality score
        score, detail = score_sample(final_wav)
        duration_ms = int(detail.duration_s * 1000)
        logger.info("Quality scored", score=score, duration_ms=duration_ms)

        # Upload normalized WAV
        output_key = f"voice-samples/{profile_id}/v{version}.wav"
        await asyncio.to_thread(upload_object, final_wav, output_key, "audio/wav")
        logger.info("Uploaded normalized sample", key=output_key)

    # Persist to DB
    await db_update_fn(
        profile_id=profile_id,
        version=version,
        output_key=output_key,
        duration_ms=duration_ms,
        score=score,
        detail=asdict(detail),
        notes=notes,
    )
    logger.info("Ingest complete", profile_id=profile_id, version=version, score=score)


def _vad_trim(src: Path, dest: Path) -> None:
    import torch
    import torchaudio  # type: ignore[import]

    model, utils = torch.hub.load("snakers4/silero-vad", "silero_vad", trust_repo=True)
    (get_speech_timestamps, _, read_audio, *_) = utils

    wav = read_audio(str(src), sampling_rate=24000)
    timestamps = get_speech_timestamps(wav, model, sampling_rate=24000)

    if not timestamps:
        import shutil
        shutil.copy(src, dest)
        return

    start = timestamps[0]["start"]
    end = timestamps[-1]["end"]
    trimmed = wav[start:end]

    torchaudio.save(str(dest), trimmed.unsqueeze(0), 24000)
