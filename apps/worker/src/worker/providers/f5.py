"""F5-TTS provider (placeholder — enabled when GPU available)."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, ClassVar

from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.f5")


class F5Provider:
    name = "F5_TTS"
    supported_languages: ClassVar[list[str]] = ["vi", "en", "zh"]

    _model: Any = None
    _lock: asyncio.Lock

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 300))
        self._lock = asyncio.Lock()

    def _model_name(self) -> str:
        return str(self._config.get("model", "F5TTS_v1_Base"))

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        await self._load()
        return VoiceRef(
            provider_name=self.name, data={"ref_audio": str(samples[0]), "ref_text": ""}
        )

    async def synthesize(
        self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0, style: str | None = None
    ) -> AudioBytes:
        await self._load()
        import io

        import numpy as np
        import soundfile as sf

        ref_audio = voice.data["ref_audio"]

        def _synth() -> bytes:
            # F5-TTS inference call
            audio, sr = self._model.infer(  # type: ignore[union-attr]
                ref_file=ref_audio,
                ref_text=voice.data.get("ref_text", ""),
                gen_text=text,
                speed=speed,
            )
            buf = io.BytesIO()
            sf.write(buf, np.array(audio, dtype=np.float32), sr, format="WAV")
            return buf.getvalue()

        return await asyncio.to_thread(_synth)

    async def _load(self) -> None:
        async with self._lock:
            if self._model is not None:
                return

            from ..config import settings

            logger.info("Loading F5-TTS model…", device=settings.torch_device, model=self._model_name())

            def _init():
                from f5_tts.infer.utils_infer import load_model  # type: ignore[import]

                return load_model(self._model_name(), vocab_file="")

            self._model = await asyncio.to_thread(_init)
            logger.info("F5-TTS loaded", model=self._model_name())

    async def close(self) -> None:
        self._model = None

    async def self_test(self) -> str:
        await self._load()
        return f"F5-TTS loaded ({self._model_name()})."
