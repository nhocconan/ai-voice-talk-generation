"""Word-level timing extraction for caption generation.

Runs faster-whisper with ``word_timestamps=True`` over an audio file and returns
a flat list of ``{start_ms, end_ms, text}`` words. Used to derive karaoke caption
timing for synthesized (TTS) audio, which carries no timing of its own.

This is "align by re-transcription": since the TTS speaks our own script, the
transcript closely matches and the word times are what we need. It reuses the
same faster-whisper model as the ASR pipeline (lazy import — kept optional).
"""

from __future__ import annotations

from pathlib import Path

from ..config import settings
from ..logging import get_logger

logger = get_logger("audio.align")


def align_words(audio_path: Path, *, language: str | None = None) -> list[dict]:
    """Return ``[{start_ms, end_ms, text}]`` word timings, or ``[]`` on failure."""
    try:
        from faster_whisper import WhisperModel  # type: ignore[import]
    except Exception as e:  # pragma: no cover - optional dep
        logger.warning("faster-whisper unavailable; skipping word alignment", error=str(e))
        return []

    try:
        model = WhisperModel(
            settings.asr_model,
            device=settings.torch_device,
            compute_type=settings.asr_compute_type,
        )
        segments, _ = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            vad_filter=True,
            language=language,
        )
        words: list[dict] = []
        for seg in segments:
            for w in getattr(seg, "words", None) or []:
                text = (w.word or "").strip()
                if not text:
                    continue
                words.append(
                    {
                        "start_ms": int(w.start * 1000),
                        "end_ms": int(w.end * 1000),
                        "text": text,
                    }
                )
        return words
    except Exception as e:
        logger.warning("Word alignment failed; captions fall back to segments", error=str(e))
        return []
