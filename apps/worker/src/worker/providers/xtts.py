"""XTTS-v2 provider — runs locally on MPS / CUDA / CPU."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, ClassVar

from ..config import settings
from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.xtts")

LANG_MAP = {"vi": "vi", "en": "en", "multi": "en"}  # XTTS uses ISO codes


class XTTSProvider:
    name = "XTTS_V2"
    supported_languages: ClassVar[list[str]] = ["vi", "en", "zh-cn", "fr", "de", "es", "pt"]

    _tts: Any = None
    _lock: asyncio.Lock

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 250))
        self._lock = asyncio.Lock()

    def _model_name(self) -> str:
        return str(self._config.get("model", "tts_models/multilingual/multi-dataset/xtts_v2"))

    def _device(self) -> str:
        return str(self._config.get("device", settings.torch_device))

    async def _load_model(self) -> None:
        async with self._lock:
            if self._tts is not None:
                return
            device = self._device()
            model_name = self._model_name()
            logger.info("Loading XTTS-v2 model…", device=device, model=model_name)
            # Import here so startup doesn't fail if torch not present
            from TTS.api import TTS  # type: ignore[import]

            self._tts = await asyncio.to_thread(
                lambda: TTS(model_name).to(device)
            )
            logger.info("XTTS-v2 loaded", device=device, model=model_name)

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        await self._load_model()
        # XTTS uses speaker_wav directly in synthesize — just pass paths
        return VoiceRef(
            provider_name=self.name,
            data={"speaker_wavs": [str(s) for s in samples]},
        )

    async def synthesize(
        self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0, style: str | None = None
    ) -> AudioBytes:
        await self._load_model()
        import io

        import numpy as np
        import soundfile as sf

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

    async def self_test(self) -> str:
        await self._load_model()
        return f"XTTS-v2 loaded on {self._device()} ({self._model_name()})."
