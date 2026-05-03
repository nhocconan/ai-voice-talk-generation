"""TTSProvider protocol — all providers implement this interface."""
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable


@dataclass
class VoiceRef:
    """Provider-specific handle returned by prepare_voice."""
    provider_name: str
    data: dict  # provider-specific: embedding path, voice_id, etc.


AudioBytes = bytes


@runtime_checkable
class TTSProvider(Protocol):
    name: str
    supported_languages: list[str]
    max_chunk_chars: int

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        """Load reference audio samples and return a reusable voice handle."""
        ...

    async def synthesize(
        self,
        text: str,
        voice: VoiceRef,
        lang: str,
        speed: float = 1.0,
        style: str | None = None,
    ) -> AudioBytes:
        """Return raw wav/pcm bytes at the provider's native sample rate."""
        ...

    async def close(self) -> None:
        """Release any held resources."""
        ...
