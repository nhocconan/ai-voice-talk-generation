"""ASR + diarization pipeline: faster-whisper + pyannote → timed script."""
from __future__ import annotations

import asyncio
import tempfile
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

import numpy as np

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
    progress_fn: Callable[[str, float, str], Awaitable[None]] | None = None,
) -> None:
    logger.info("ASR start", generation_id=generation_id)

    async def progress(value: float, message: str) -> None:
        if progress_fn is not None:
            await progress_fn(generation_id, value, message)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        audio_path = tmp_dir / "source.mp3"

        await asyncio.to_thread(download_object, source_key, audio_path)
        await progress(0.05, "Source audio downloaded")

        # Transcribe with faster-whisper
        await progress(0.1, "Transcribing audio")
        segments = await asyncio.to_thread(_transcribe, audio_path)
        logger.info("Transcription done", segment_count=len(segments))
        await progress(0.6, f"Transcribed {len(segments)} segments")

        if expected_speakers <= 1:
            diarized = [Segment(s["start_ms"], s["end_ms"], "A", s["text"]) for s in segments]
        else:
            await progress(0.65, f"Separating {expected_speakers} speakers")
            diarized = await asyncio.to_thread(
                _diarize_with_fallback,
                audio_path,
                expected_speakers,
                segments,
            )

        counts = Counter(segment.speaker for segment in diarized)
        logger.info("Diarization done", method="resolved", speaker_counts=dict(counts))
        await progress(0.95, "Saving transcript")

    await result_fn(generation_id=generation_id, segments=diarized)
    await progress(1.0, "Transcription complete")
    logger.info("ASR complete", generation_id=generation_id, segments=len(diarized))


def _transcribe(audio_path: Path) -> list[dict]:
    from faster_whisper import WhisperModel  # type: ignore[import]

    model = WhisperModel(
        settings.asr_model,
        device=settings.torch_device,
        compute_type=settings.asr_compute_type,
    )
    transcription_segments, _ = model.transcribe(
        str(audio_path),
        word_timestamps=True,  # word-aligned segment bounds → tighter re-voice slots
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
    if not settings.hf_token:
        raise RuntimeError("HF_TOKEN is not configured")

    import torch
    from pyannote.audio import Pipeline  # type: ignore[import]

    pipeline = Pipeline.from_pretrained(
        settings.diarization_model,
        use_auth_token=settings.hf_token,
    )
    pipeline.to(torch.device(settings.torch_device))

    output = pipeline(str(audio_path), num_speakers=num_speakers)
    diarization = getattr(output, "exclusive_speaker_diarization", None)
    if diarization is None:
        diarization = getattr(output, "speaker_diarization", output)
    turns = [
        (float(turn.start), float(turn.end), str(speaker))
        for turn, _, speaker in diarization.itertracks(yield_label=True)
    ]
    result = _assign_speakers_by_overlap(turns, whisper_segments)
    if len({segment.speaker for segment in result}) < num_speakers:
        raise RuntimeError("pyannote returned fewer speakers than requested")
    return result


def _diarize_with_fallback(
    audio_path: Path,
    num_speakers: int,
    whisper_segments: list[dict],
) -> list[Segment]:
    try:
        result = _diarize(audio_path, num_speakers, whisper_segments)
    except Exception as error:
        logger.warning(
            "Pyannote diarization unavailable; using acoustic clustering",
            error=str(error),
        )
    else:
        logger.info("Diarization method selected", method="pyannote")
        return result

    try:
        result = _cluster_speakers(audio_path, num_speakers, whisper_segments)
    except Exception as error:
        raise RuntimeError("Unable to separate the requested speakers") from error
    else:
        logger.info("Diarization method selected", method="acoustic-clustering")
        return result


def _assign_speakers_by_overlap(
    turns: list[tuple[float, float, str]],
    whisper_segments: list[dict],
) -> list[Segment]:
    if not turns:
        raise ValueError("Diarization returned no speaker turns")

    speaker_map: dict[str, str] = {}
    labels = ["A", "B", "C"]
    result: list[Segment] = []
    for wseg in whisper_segments:
        start_s = wseg["start_ms"] / 1000
        end_s = wseg["end_ms"] / 1000
        overlaps = [
            (max(0.0, min(end_s, turn_end) - max(start_s, turn_start)), speaker)
            for turn_start, turn_end, speaker in turns
        ]
        best_overlap, pyannote_speaker = max(overlaps, key=lambda item: item[0])
        if best_overlap == 0:
            pyannote_speaker = min(
                turns,
                key=lambda turn: max(turn[0] - end_s, start_s - turn[1], 0.0),
            )[2]

        if pyannote_speaker not in speaker_map:
            speaker_map[pyannote_speaker] = labels[min(len(speaker_map), len(labels) - 1)]

        result.append(Segment(
            start_ms=wseg["start_ms"],
            end_ms=wseg["end_ms"],
            speaker=speaker_map[pyannote_speaker],
            text=wseg["text"],
        ))

    return result


def _cluster_speakers(
    audio_path: Path,
    num_speakers: int,
    whisper_segments: list[dict],
) -> list[Segment]:
    """Offline fallback for clear multi-speaker audio when pyannote is unavailable."""
    if len(whisper_segments) < num_speakers:
        raise ValueError("Not enough transcript segments to separate speakers")

    import librosa
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    audio, sample_rate = librosa.load(audio_path, sr=16_000, mono=True)
    features = np.vstack([
        _segment_voice_features(audio, sample_rate, segment)
        for segment in whisper_segments
    ])
    normalized = StandardScaler().fit_transform(features)
    clusters = KMeans(n_clusters=num_speakers, random_state=0, n_init=20).fit_predict(normalized)
    if len({int(cluster) for cluster in clusters}) < num_speakers:
        raise RuntimeError("Acoustic clustering returned fewer speakers than requested")

    cluster_labels: dict[int, str] = {}
    labels = ["A", "B", "C"]
    result: list[Segment] = []
    for segment, cluster_value in zip(whisper_segments, clusters, strict=True):
        cluster = int(cluster_value)
        if cluster not in cluster_labels:
            cluster_labels[cluster] = labels[min(len(cluster_labels), len(labels) - 1)]
        result.append(Segment(
            start_ms=segment["start_ms"],
            end_ms=segment["end_ms"],
            speaker=cluster_labels[cluster],
            text=segment["text"],
        ))
    return result


def _segment_voice_features(audio: np.ndarray, sample_rate: int, segment: dict) -> np.ndarray:
    import librosa

    start = max(0, int(segment["start_ms"] * sample_rate / 1000))
    end = min(len(audio), int(segment["end_ms"] * sample_rate / 1000))
    minimum = sample_rate
    if end - start < minimum:
        midpoint = (start + end) // 2
        start = max(0, midpoint - minimum // 2)
        end = min(len(audio), start + minimum)
    clip = audio[start:end]
    if clip.size < 512:
        raise ValueError("Audio segment is too short for speaker clustering")

    trimmed, _ = librosa.effects.trim(clip, top_db=35)
    if trimmed.size >= 512:
        clip = trimmed
    mfcc = librosa.feature.mfcc(y=clip, sr=sample_rate, n_mfcc=16)
    spectral = np.vstack([
        librosa.feature.spectral_centroid(y=clip, sr=sample_rate),
        librosa.feature.spectral_bandwidth(y=clip, sr=sample_rate),
        librosa.feature.spectral_rolloff(y=clip, sr=sample_rate),
        librosa.feature.zero_crossing_rate(clip),
        librosa.feature.rms(y=clip),
    ])
    pitches = librosa.yin(clip, fmin=65, fmax=350, sr=sample_rate)
    pitches = pitches[np.isfinite(pitches)]
    pitch_stats = np.array([
        float(np.median(pitches)) if pitches.size else 0.0,
        float(np.std(pitches)) if pitches.size else 0.0,
    ])
    return np.concatenate([
        mfcc.mean(axis=1),
        mfcc.std(axis=1),
        spectral.mean(axis=1),
        spectral.std(axis=1),
        pitch_stats,
    ])
