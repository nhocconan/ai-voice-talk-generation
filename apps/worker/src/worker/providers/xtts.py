"""XTTS-v2 provider — runs locally on MPS / CUDA / CPU."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, ClassVar

from ..config import settings
from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.xtts")

# Official Coqui XTTS-v2 language codes (no Vietnamese in stock weights).
# See model error list: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, hu, ko, ja, hi
LANG_MAP = {
    "en": "en",
    "es": "es",
    "fr": "fr",
    "de": "de",
    "it": "it",
    "pt": "pt",
    "zh": "zh-cn",
    "zh-cn": "zh-cn",
    "ko": "ko",
    "ja": "ja",
    "hi": "hi",
    "ar": "ar",
    "ru": "ru",
    "nl": "nl",
    "cs": "cs",
    "pl": "pl",
    "tr": "tr",
    "hu": "hu",
}


class XTTSProvider:
    name = "XTTS_V2"
    # Stock Coqui multi-dataset XTTS-v2 does NOT include Vietnamese.
    supported_languages: ClassVar[list[str]] = list(LANG_MAP.keys())

    _tts: Any = None
    _lock: asyncio.Lock

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 250))
        self._lock = asyncio.Lock()

    def _model_name(self) -> str:
        # Seed/admin sometimes store a short tag ("xtts_v2") — map to Coqui id.
        raw = str(self._config.get("model", "tts_models/multilingual/multi-dataset/xtts_v2")).strip()
        aliases = {
            "xtts_v2": "tts_models/multilingual/multi-dataset/xtts_v2",
            "xtts-v2": "tts_models/multilingual/multi-dataset/xtts_v2",
            "xtts": "tts_models/multilingual/multi-dataset/xtts_v2",
        }
        return aliases.get(raw, raw)

    def _device(self) -> str:
        return str(self._config.get("device", settings.torch_device))

    async def _load_model(self) -> None:
        async with self._lock:
            if self._tts is not None:
                return
            device = self._device()
            model_name = self._model_name()
            logger.info("Loading XTTS-v2 model…", device=device, model=model_name)
            # Coqui prompts interactively for CPML unless this is set — worker
            # has no TTY so load would fail with "EOF when reading a line".
            import os

            os.environ.setdefault("COQUI_TOS_AGREED", "1")

            # PyTorch 2.6+ defaults torch.load(weights_only=True), which breaks
            # Coqui XTTS checkpoints (custom classes in the pickle).
            import torch

            if not getattr(torch.load, "_voice_studio_weights_patch", False):
                _orig_load = torch.load

                def _load(*args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
                    kwargs.setdefault("weights_only", False)
                    return _orig_load(*args, **kwargs)

                _load._voice_studio_weights_patch = True  # type: ignore[attr-defined]
                torch.load = _load  # type: ignore[assignment]

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

        lang_key = (lang or "en").lower().replace("_", "-")
        tts_lang = LANG_MAP.get(lang_key) or LANG_MAP.get(lang_key.split("-")[0])
        if not tts_lang:
            raise ValueError(
                f"XTTS-v2 stock model does not support language '{lang}'. "
                f"Supported: {sorted(set(LANG_MAP.values()))}. "
                "For Vietnamese cloning use VieNeu (approx), MiniMax, xAI, or ElevenLabs."
            )
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
