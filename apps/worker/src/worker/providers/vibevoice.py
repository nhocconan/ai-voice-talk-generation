"""VibeVoice-1.5B provider stub — inference backend not yet integrated."""

from __future__ import annotations

from pathlib import Path
from typing import Any, ClassVar

from ..logging import get_logger
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.vibevoice")


class VibeVoiceProvider:
    """Stub for VibeVoice-1.5B. Raises NotImplementedError until the model is wired."""

    name = "VIBEVOICE"
    supported_languages: ClassVar[list[str]] = ["vi", "en"]
    max_chunk_chars = 300

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 300))

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        logger.warning("VibeVoice provider is a stub — prepare_voice not implemented")
        raise NotImplementedError("VibeVoice-1.5B inference is not yet available")

    async def synthesize(
        self,
        text: str,
        voice: VoiceRef,
        lang: str,
        speed: float = 1.0,
        style: str | None = None,
    ) -> AudioBytes:
        logger.warning("VibeVoice provider is a stub — synthesize not implemented")
        raise NotImplementedError("VibeVoice-1.5B inference is not yet available")

    async def close(self) -> None:
        pass

    async def self_test(self) -> str:
        raise NotImplementedError(
            "VibeVoice is documented in this app, but the worker integration is still a stub."
        )
