"""VieNeu-TTS provider via the official Python SDK."""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from typing import Any, ClassVar

import numpy as np
import soundfile as sf

from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.vieneu")

# Zero-shot cloning degrades when the reference is very long (model dilutes the
# speaker embedding toward its training prior — often Northern VN for VieNeu).
# Keep a short, speech-dense window for encode_reference.
_REF_TARGET_SEC = 12.0
_REF_MAX_SEC = 18.0


def _trim_reference_clip(src: Path, dest: Path) -> tuple[Path, float]:
    """Write a short mono clip optimized for zero-shot cloning.

    Prefer a mid-recording window (enrollment intros often have silence / setup
    talk), fall back to the start if the file is short.
    """
    audio, sr = sf.read(str(src), always_2d=False)
    if getattr(audio, "ndim", 1) > 1:
        audio = np.mean(audio, axis=1)
    audio = np.asarray(audio, dtype=np.float32)
    total_sec = float(len(audio) / sr) if sr else 0.0
    if total_sec <= _REF_MAX_SEC:
        if src.resolve() != dest.resolve():
            sf.write(str(dest), audio, sr)
            return dest, total_sec
        return src, total_sec

    win = int(_REF_TARGET_SEC * sr)
    # Start ~20% into the clip so we skip countdown/silence, but leave a full window.
    start = int(min(max(total_sec * 0.2, 0.0), max(total_sec - _REF_TARGET_SEC, 0.0)) * sr)
    clip = audio[start : start + win]
    if clip.size < int(3 * sr):  # pathological — fall back to head
        clip = audio[:win]
    sf.write(str(dest), clip, sr)
    return dest, float(len(clip) / sr)


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
            logger.warning("VieNeu prepare_voice called with no samples — will use model default voice")
            return VoiceRef(provider_name=self.name, data={})

        raw_path = samples[0]
        trimmed = raw_path.with_name(f"{raw_path.stem}_ref12s.wav")
        try:
            sample_path, used_sec = await asyncio.to_thread(_trim_reference_clip, raw_path, trimmed)
            logger.info(
                "VieNeu reference clip",
                source=str(raw_path.name),
                used_sec=round(used_sec, 2),
                trimmed=sample_path != raw_path,
            )
        except Exception as exc:  # noqa: BLE001 — fall back to full file
            logger.warning("VieNeu reference trim failed; using full sample", error=str(exc))
            sample_path = raw_path

        sample_path_str = str(sample_path)
        ref_text = self._reference_text()

        if self._mode() == "local":
            encoded_voice = await asyncio.to_thread(self._tts.encode_reference, sample_path_str)  # type: ignore[union-attr]
            return VoiceRef(
                provider_name=self.name,
                data={
                    "encoded_voice": encoded_voice,
                    "ref_audio": sample_path_str,
                    "ref_text": ref_text,
                },
            )

        return VoiceRef(
            provider_name=self.name,
            data={
                "ref_audio": sample_path_str,
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
