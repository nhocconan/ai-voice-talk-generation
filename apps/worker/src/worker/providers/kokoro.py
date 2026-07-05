"""Kokoro TTS provider — fast, preset-voice synthesis for the preview/draft lane.

Kokoro (82M params, Apache-2.0) is a non-cloning model: it ships fixed voices and
runs many times faster than the cloning engines, which makes it ideal for the
15-second preview path and quick script-pacing checks where exact voice identity
does not matter. It is intentionally NOT a clone of the user's voice — callers that
need the leader's voice must use VieNeu/VoxCPM/IndexTTS/ElevenLabs instead.

``prepare_voice`` ignores reference samples; the voice is chosen from provider
config (``voice``), e.g. ``af_heart`` (en) or a language-appropriate Kokoro pack.
"""

from __future__ import annotations

import asyncio
import io
from pathlib import Path
from typing import Any, ClassVar

from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.kokoro")

SAMPLE_RATE = 24000

# Map our language codes to Kokoro lang_code prefixes.
_LANG_CODE = {"en": "a", "vi": "a"}  # Kokoro has no Vietnamese pack → fall back to English


class KokoroProvider:
    name = "KOKORO"
    supported_languages: ClassVar[list[str]] = ["en"]

    _pipelines: dict[str, Any]
    _lock: asyncio.Lock

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 400))
        self._pipelines = {}
        self._lock = asyncio.Lock()

    def _voice(self) -> str:
        return str(self._config.get("voice", "af_heart")).strip()

    async def _get_pipeline(self, lang_code: str) -> Any:
        async with self._lock:
            if lang_code in self._pipelines:
                return self._pipelines[lang_code]
            try:
                from kokoro import KPipeline  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError(
                    "Kokoro is not installed. Run `cd apps/worker && uv sync --extra kokoro` first."
                ) from exc

            logger.info("Loading Kokoro pipeline", lang_code=lang_code)
            pipeline = await asyncio.to_thread(KPipeline, lang_code=lang_code)
            self._pipelines[lang_code] = pipeline
            return pipeline

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        # Kokoro does not clone; the voice comes from config, not the samples.
        del samples
        return VoiceRef(provider_name=self.name, data={"voice": self._voice()})

    async def synthesize(
        self,
        text: str,
        voice: VoiceRef,
        lang: str,
        speed: float = 1.0,
        style: str | None = None,
    ) -> AudioBytes:
        del style
        lang_code = _LANG_CODE.get(lang, "a")
        pipeline = await self._get_pipeline(lang_code)
        voice_name = voice.data.get("voice") or self._voice()

        def _synth() -> bytes:
            import numpy as np
            import soundfile as sf

            chunks: list[np.ndarray] = []
            for _, _, audio in pipeline(text, voice=voice_name, speed=speed):
                arr = audio.detach().cpu().numpy() if hasattr(audio, "detach") else audio
                chunks.append(np.asarray(arr, dtype="float32"))
            if not chunks:
                raise RuntimeError("Kokoro produced no audio")
            full = np.concatenate(chunks)
            buf = io.BytesIO()
            sf.write(buf, full, SAMPLE_RATE, format="WAV", subtype="PCM_16")
            return buf.getvalue()

        return await asyncio.to_thread(_synth)

    async def self_test(self) -> str:
        await self._get_pipeline("a")
        return f"Kokoro ready (voice={self._voice()})."

    async def close(self) -> None:
        self._pipelines = {}
