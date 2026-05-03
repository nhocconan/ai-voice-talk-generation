"""VoxCPM2 provider via the official Python package."""

from __future__ import annotations

import asyncio
import io
from pathlib import Path
from typing import Any, ClassVar

import numpy as np
import soundfile as sf

from ..config import settings
from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.voxcpm2")


class VoxCPM2Provider:
    name = "VOXCPM2"
    supported_languages: ClassVar[list[str]] = [
        "vi",
        "en",
        "zh",
        "fr",
        "de",
        "es",
        "pt",
        "ja",
        "ko",
        "th",
        "id",
        "ms",
    ]

    _model: Any = None
    _lock: asyncio.Lock

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 260))
        self._lock = asyncio.Lock()

    def _model_name(self) -> str:
        return str(self._config.get("model", "openbmb/VoxCPM2")).strip()

    def _device(self) -> str:
        return str(self._config.get("device", settings.torch_device or "cpu")).strip() or "cpu"

    def _cfg_value(self) -> float:
        return float(self._config.get("cfgValue", 2.0))

    def _inference_timesteps(self) -> int:
        return int(self._config.get("inferenceTimesteps", 10))

    def _use_prompt_clone(self) -> bool:
        return bool(self._config.get("usePromptClone", False))

    def _prompt_text(self) -> str:
        return str(self._config.get("promptText", "")).strip()

    async def _load_model(self) -> None:
        async with self._lock:
            if self._model is not None:
                return

            try:
                from voxcpm import VoxCPM  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError(
                    "VoxCPM2 is not installed. Run `cd apps/worker && uv sync --extra voxcpm` first."
                ) from exc

            model_name = self._model_name()
            load_denoiser = bool(self._config.get("loadDenoiser", False))
            device = self._device()

            def _init() -> Any:
                model = VoxCPM.from_pretrained(model_name, load_denoiser=load_denoiser)
                move = getattr(model, "to", None)
                if callable(move):
                    try:
                        move(device)
                    except Exception:
                        logger.warning("VoxCPM2 model does not support explicit device move", device=device)
                return model

            logger.info(
                "Loading VoxCPM2 runtime",
                model=model_name,
                device=device,
                load_denoiser=load_denoiser,
            )
            self._model = await asyncio.to_thread(_init)
            logger.info("VoxCPM2 ready", model=model_name, device=device)

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        await self._load_model()

        if not samples:
            return VoiceRef(provider_name=self.name, data={})

        sample_path = str(samples[0])
        return VoiceRef(
            provider_name=self.name,
            data={
                "reference_wav_path": sample_path,
                "prompt_wav_path": sample_path if self._use_prompt_clone() else None,
                "prompt_text": self._prompt_text(),
            },
        )

    async def synthesize(
        self,
        text: str,
        voice: VoiceRef,
        lang: str,
        speed: float = 1.0,
        style: str | None = None,
    ) -> AudioBytes:
        del lang, speed
        await self._load_model()

        def _synth() -> bytes:
            prompt = text
            if style:
                prompt = f"({style}){prompt}"

            kwargs: dict[str, Any] = {
                "text": prompt,
                "cfg_value": self._cfg_value(),
                "inference_timesteps": self._inference_timesteps(),
            }

            reference_wav_path = voice.data.get("reference_wav_path")
            if reference_wav_path:
                kwargs["reference_wav_path"] = reference_wav_path

            prompt_wav_path = voice.data.get("prompt_wav_path")
            prompt_text = str(voice.data.get("prompt_text", "")).strip()
            if prompt_wav_path and prompt_text:
                kwargs["prompt_wav_path"] = prompt_wav_path
                kwargs["prompt_text"] = prompt_text

            wav = self._model.generate(**kwargs)  # type: ignore[union-attr]
            sample_rate = getattr(getattr(self._model, "tts_model", None), "sample_rate", 48000)

            buf = io.BytesIO()
            sf.write(buf, np.asarray(wav, dtype=np.float32), sample_rate, format="WAV")
            return buf.getvalue()

        return await asyncio.to_thread(_synth)

    async def self_test(self) -> str:
        await self._load_model()
        return (
            f"VoxCPM2 ready ({self._model_name()}) on {self._device()} "
            f"with cfg={self._cfg_value()} and steps={self._inference_timesteps()}."
        )

    async def close(self) -> None:
        self._model = None
