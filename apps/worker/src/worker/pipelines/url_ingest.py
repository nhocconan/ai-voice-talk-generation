"""URL / YouTube audio ingest via yt-dlp (borrowed from voice-pro).

Downloads the audio track of a public URL and extracts a WAV so the existing ASR
pipeline can turn it into a timed script for re-voicing. Admin-gated: the worker
only honours this when ``ALLOW_URL_INGEST=true`` because of ToS/abuse concerns.

Optional dependency: ``uv sync --extra ingest``.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from ..logging import get_logger

logger = get_logger("pipeline.url_ingest")


async def download_audio(url: str, out_dir: Path, *, sample_rate: int = 24000) -> Path:
    """Download ``url``'s audio and return a mono WAV path under ``out_dir``."""
    out_dir.mkdir(parents=True, exist_ok=True)
    out_base = out_dir / "url_source"

    def _download() -> Path:
        try:
            import yt_dlp  # type: ignore[import]
        except ImportError as exc:
            raise RuntimeError(
                "yt-dlp is not installed. Run `cd apps/worker && uv sync --extra ingest` first."
            ) from exc

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(out_base) + ".%(ext)s",
            "quiet": True,
            "noplaylist": True,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "wav",
                }
            ],
            "postprocessor_args": ["-ac", "1", "-ar", str(sample_rate)],
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        wav = out_base.with_suffix(".wav")
        if not wav.exists():
            raise RuntimeError("yt-dlp did not produce a WAV file")
        return wav

    logger.info("Downloading URL audio", url=url)
    wav = await asyncio.to_thread(_download)
    logger.info("URL audio downloaded", path=str(wav), bytes=wav.stat().st_size)
    return wav
