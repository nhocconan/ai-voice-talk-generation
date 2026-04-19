"""F5-TTS provider (placeholder — enabled when GPU available)."""
from __future__ import annotations
from pathlib import Path
from .base import VoiceRef, AudioBytes
from ..logging import get_logger

logger = get_logger("provider.f5")


class F5Provider:
    name = "F5_TTS"
    supported_languages = ["vi", "en", "zh"]
    max_chunk_chars = 300

    _model = None

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        await self._load()
        return VoiceRef(provider_name=self.name, data={"ref_audio": str(samples[0]), "ref_text": ""})

    async def synthesize(self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0) -> AudioBytes:
        await self._load()
        import asyncio
        import io
        import soundfile as sf
        import numpy as np

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
        if self._model is not None:
            return
        import asyncio
        from ..config import settings
        logger.info("Loading F5-TTS model…", device=settings.torch_device)

        def _init():
            from f5_tts.infer.utils_infer import load_model  # type: ignore[import]
            return load_model("F5TTS_v1_Base", vocab_file="")

        self._model = await asyncio.to_thread(_init)
        logger.info("F5-TTS loaded")

    async def close(self) -> None:
        self._model = None
