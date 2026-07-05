"""IndexTTS-2 provider — high-fidelity zero-shot cloning with emotion control.

IndexTTS-2 leads recent zero-shot benchmarks on WER and speaker similarity and
adds *disentangled* emotion control (you can borrow one speaker's timbre and
another reference's emotion). English/Chinese-centric, so it sits as the
advanced-quality lane alongside VoxCPM2 — not the Vietnamese default.

Installs from source (not on PyPI):
    uv pip install "git+https://github.com/index-tts/index-tts.git"
and needs the checkpoints downloaded locally; point `modelDir`/`cfgPath` at them.
"""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from typing import Any, ClassVar

from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.indextts")


class IndexTTS2Provider:
    name = "INDEXTTS2"
    supported_languages: ClassVar[list[str]] = ["en", "zh"]

    _tts: Any = None
    _lock: asyncio.Lock

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 300))
        self._lock = asyncio.Lock()

    def _model_dir(self) -> str:
        return str(self._config.get("modelDir", "checkpoints")).strip()

    def _cfg_path(self) -> str:
        return str(self._config.get("cfgPath", "checkpoints/config.yaml")).strip()

    async def _load(self) -> None:
        async with self._lock:
            if self._tts is not None:
                return
            try:
                from indextts.infer_v2 import IndexTTS2  # type: ignore[import]
            except ImportError as exc:
                raise RuntimeError(
                    "IndexTTS-2 is not installed. Run "
                    '`uv pip install "git+https://github.com/index-tts/index-tts.git"` '
                    "in the worker env and download the checkpoints."
                ) from exc

            model_dir = self._model_dir()
            cfg_path = self._cfg_path()
            use_fp16 = bool(self._config.get("useFp16", False))

            logger.info("Loading IndexTTS-2", model_dir=model_dir)
            self._tts = await asyncio.to_thread(
                IndexTTS2, cfg_path=cfg_path, model_dir=model_dir, use_fp16=use_fp16
            )
            logger.info("IndexTTS-2 ready")

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        if not samples:
            return VoiceRef(provider_name=self.name, data={})
        return VoiceRef(provider_name=self.name, data={"spk_audio": str(samples[0])})

    async def synthesize(
        self,
        text: str,
        voice: VoiceRef,
        lang: str,
        speed: float = 1.0,
        style: str | None = None,
    ) -> AudioBytes:
        del lang, speed
        await self._load()

        spk_audio = voice.data.get("spk_audio")
        if not spk_audio:
            raise RuntimeError("IndexTTS-2 requires a speaker reference clip.")

        # Emotion control: a free-text `style` (or configured `emoText`) drives the
        # emotion when `emoAlpha` > 0; an optional `emoAudio` ref overrides with a
        # separate emotion reference.
        emo_text = (style or str(self._config.get("emoText", ""))).strip() or None
        emo_alpha = float(self._config.get("emoAlpha", 1.0))
        emo_audio = str(self._config.get("emoAudio", "")).strip() or None

        def _synth() -> bytes:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                out_path = Path(tmp.name)
            kwargs: dict[str, Any] = {
                "spk_audio_prompt": spk_audio,
                "text": text,
                "output_path": str(out_path),
            }
            if emo_audio:
                kwargs["emo_audio_prompt"] = emo_audio
                kwargs["emo_alpha"] = emo_alpha
            elif emo_text:
                kwargs["use_emo_text"] = True
                kwargs["emo_text"] = emo_text
                kwargs["emo_alpha"] = emo_alpha
            try:
                self._tts.infer(**kwargs)  # type: ignore[union-attr]
                return out_path.read_bytes()
            finally:
                out_path.unlink(missing_ok=True)

        return await asyncio.to_thread(_synth)

    async def self_test(self) -> str:
        await self._load()
        return f"IndexTTS-2 ready (modelDir={self._model_dir()})."

    async def close(self) -> None:
        self._tts = None
