"""VieNeu-TTS provider via the official Python SDK."""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from typing import Any, ClassVar

from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.vieneu")


class VieNeuProvider:
    name = "VIENEU_TTS"
    supported_languages: ClassVar[list[str]] = ["vi", "en"]

    _tts: Any = None
    _lock: asyncio.Lock

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 320))
        self._lock = asyncio.Lock()

    def _mode(self) -> str:
        return "remote" if str(self._config.get("mode", "local")).lower() == "remote" else "local"

    def _model_name(self) -> str:
        return str(self._config.get("model", "pnnbao-ump/VieNeu-TTS")).strip()

    def _reference_text(self) -> str:
        return str(self._config.get("referenceText", "")).strip()

    async def _load_client(self) -> None:
        async with self._lock:
            if self._tts is not None:
                return

            try:
                from vieneu import Vieneu  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError(
                    "VieNeu-TTS SDK is not installed. Run `cd apps/worker && uv sync --extra vieneu` first."
                ) from exc

            mode = self._mode()
            model_name = self._model_name()
            api_base = str(self._config.get("apiBase", "")).strip()

            def _init() -> Any:
                if mode == "remote":
                    if not api_base:
                        raise RuntimeError("VieNeu remote mode requires provider config `apiBase`.")
                    return Vieneu(mode="remote", api_base=api_base, model_name=model_name)
                return Vieneu()

            logger.info("Loading VieNeu-TTS runtime", mode=mode, model=model_name or "default")
            self._tts = await asyncio.to_thread(_init)
            logger.info("VieNeu-TTS ready", mode=mode, model=model_name or "default")

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        await self._load_client()

        if not samples:
            return VoiceRef(provider_name=self.name, data={})

        sample_path = str(samples[0])
        ref_text = self._reference_text()

        if self._mode() == "local":
            encoded_voice = await asyncio.to_thread(self._tts.encode_reference, sample_path)  # type: ignore[union-attr]
            return VoiceRef(
                provider_name=self.name,
                data={
                    "encoded_voice": encoded_voice,
                    "ref_audio": sample_path,
                    "ref_text": ref_text,
                },
            )

        return VoiceRef(
            provider_name=self.name,
            data={
                "ref_audio": sample_path,
                "ref_text": ref_text,
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
        del lang, speed, style
        await self._load_client()

        def _synth() -> bytes:
            infer_kwargs: dict[str, Any] = {"text": text}

            encoded_voice = voice.data.get("encoded_voice")
            if encoded_voice is not None:
                infer_kwargs["voice"] = encoded_voice
            elif voice.data.get("ref_audio"):
                infer_kwargs["ref_audio"] = voice.data["ref_audio"]
                ref_text = str(voice.data.get("ref_text", "")).strip()
                if ref_text:
                    infer_kwargs["ref_text"] = ref_text

            audio = self._tts.infer(**infer_kwargs)  # type: ignore[union-attr]

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = Path(tmp.name)

            try:
                self._tts.save(audio, str(tmp_path))  # type: ignore[union-attr]
                return tmp_path.read_bytes()
            finally:
                tmp_path.unlink(missing_ok=True)

        return await asyncio.to_thread(_synth)

    async def self_test(self) -> str:
        await self._load_client()
        return f"VieNeu-TTS ready in {self._mode()} mode ({self._model_name()})."

    async def close(self) -> None:
        self._tts = None
