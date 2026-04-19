"""XTTS-v2 provider — runs locally on MPS / CUDA / CPU."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from .base import VoiceRef, AudioBytes
from ..config import settings
from ..logging import get_logger

logger = get_logger("provider.xtts")

LANG_MAP = {"vi": "vi", "en": "en", "multi": "en"}  # XTTS uses ISO codes


class XTTSProvider:
    name = "XTTS_V2"
    supported_languages = ["vi", "en", "zh-cn", "fr", "de", "es", "pt"]
    max_chunk_chars = 250

    _tts: Any = None
    _lock: asyncio.Lock

    def __init__(self) -> None:
        self._lock = asyncio.Lock()

    async def _load_model(self) -> None:
        async with self._lock:
            if self._tts is not None:
                return
            logger.info("Loading XTTS-v2 model…", device=settings.torch_device)
            # Import here so startup doesn't fail if torch not present
            from TTS.api import TTS  # type: ignore[import]
            import torch

            device = settings.torch_device
            self._tts = await asyncio.to_thread(
                lambda: TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
            )
            logger.info("XTTS-v2 loaded", device=device)

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        await self._load_model()
        # XTTS uses speaker_wav directly in synthesize — just pass paths
        return VoiceRef(
            provider_name=self.name,
            data={"speaker_wavs": [str(s) for s in samples]},
        )

    async def synthesize(self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0) -> AudioBytes:
        await self._load_model()
        import io
        import soundfile as sf
        import numpy as np

        tts_lang = LANG_MAP.get(lang, "en")
        speaker_wavs = voice.data["speaker_wavs"]

        def _synth() -> bytes:
            wav = self._tts.tts(
                text=text,
                speaker_wav=speaker_wavs[0],
                language=tts_lang,
                speed=speed,
            )
            buf = io.BytesIO()
            sf.write(buf, np.array(wav, dtype=np.float32), 22050, format="WAV")
            return buf.getvalue()

        return await asyncio.to_thread(_synth)

    async def close(self) -> None:
        self._tts = None
