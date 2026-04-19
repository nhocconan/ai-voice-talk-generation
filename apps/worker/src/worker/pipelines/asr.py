"""ASR + diarization pipeline: faster-whisper + pyannote → timed script."""
from __future__ import annotations

import asyncio
import tempfile
from dataclasses import dataclass
from pathlib import Path

from ..config import settings
from ..logging import get_logger
from ..services.storage import download_object

logger = get_logger("pipeline.asr")


@dataclass
class Segment:
    start_ms: int
    end_ms: int
    speaker: str
    text: str


async def run_asr(
    *,
    generation_id: str,
    source_key: str,
    expected_speakers: int,
    result_fn,  # callable(generation_id, segments: list[Segment])
) -> None:
    logger.info("ASR start", generation_id=generation_id)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        audio_path = tmp_dir / "source.mp3"

        await asyncio.to_thread(download_object, source_key, audio_path)

        # Transcribe with faster-whisper
        segments = await asyncio.to_thread(_transcribe, audio_path)
        logger.info("Transcription done", segment_count=len(segments))

        # Diarize with pyannote
        try:
            diarized = await asyncio.to_thread(_diarize, audio_path, expected_speakers, segments)
        except Exception as e:
            logger.warning("Diarization failed, using single speaker", error=str(e))
            diarized = [Segment(s["start_ms"], s["end_ms"], "A", s["text"]) for s in segments]

    await result_fn(generation_id=generation_id, segments=diarized)
    logger.info("ASR complete", generation_id=generation_id, segments=len(diarized))


def _transcribe(audio_path: Path) -> list[dict]:
    from faster_whisper import WhisperModel  # type: ignore[import]

    model = WhisperModel("large-v3", device=settings.torch_device, compute_type="auto")
    transcription_segments, _ = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        vad_filter=True,
        language=None,  # auto-detect
    )

    result = []
    for seg in transcription_segments:
        result.append({
            "start_ms": int(seg.start * 1000),
            "end_ms": int(seg.end * 1000),
            "text": seg.text.strip(),
        })
    return result


def _diarize(audio_path: Path, num_speakers: int, whisper_segments: list[dict]) -> list[Segment]:
    import torch
    from pyannote.audio import Pipeline  # type: ignore[import]

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=settings.hf_token,
    )
    pipeline.to(torch.device(settings.torch_device))

    diarization = pipeline(str(audio_path), num_speakers=num_speakers)

    # Map pyannote turns to speaker labels A/B
    speaker_map: dict[str, str] = {}
    label_idx = 0
    labels = ["A", "B", "C"]

    result = []
    for wseg in whisper_segments:
        start_s = wseg["start_ms"] / 1000
        end_s = wseg["end_ms"] / 1000
        mid_s = (start_s + end_s) / 2

        # Find which speaker is active at the midpoint
        pyannote_speaker = "SPEAKER_00"
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            if turn.start <= mid_s <= turn.end:
                pyannote_speaker = speaker
                break

        if pyannote_speaker not in speaker_map:
            speaker_map[pyannote_speaker] = labels[min(label_idx, len(labels) - 1)]
            label_idx += 1

        result.append(Segment(
            start_ms=wseg["start_ms"],
            end_ms=wseg["end_ms"],
            speaker=speaker_map[pyannote_speaker],
            text=wseg["text"],
        ))

    return result
