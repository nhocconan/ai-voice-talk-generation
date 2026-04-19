"""ElevenLabs cloud TTS provider."""
from __future__ import annotations

from pathlib import Path
from typing import ClassVar

import httpx

from ..config import settings
from ..logging import get_logger
from ..services.crypto import decrypt_api_key
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.elevenlabs")

BASE_URL = "https://api.elevenlabs.io/v1"


class ElevenLabsProvider:
    name = "ELEVENLABS"
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
    ]
    max_chunk_chars = 2500

    def __init__(self, api_key_enc: str | None = None) -> None:
        raw = api_key_enc or settings.elevenlabs_api_key
        self._api_key = decrypt_api_key(raw) if (raw and len(raw) > 40) else raw or ""

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        """Clone voice via ElevenLabs /voices/add."""
        async with httpx.AsyncClient(timeout=120) as client:
            files = [("files", (s.name, s.read_bytes(), "audio/mpeg")) for s in samples]
            resp = await client.post(
                f"{BASE_URL}/voices/add",
                headers={"xi-api-key": self._api_key},
                data={"name": f"yng-clone-{samples[0].stem[:20]}"},
                files=files,
            )
            resp.raise_for_status()
            voice_id: str = resp.json()["voice_id"]
            logger.info("ElevenLabs voice cloned", voice_id=voice_id)
            return VoiceRef(provider_name=self.name, data={"voice_id": voice_id})

    async def synthesize(
        self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0
    ) -> AudioBytes:
        voice_id = voice.data["voice_id"]
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{BASE_URL}/text-to-speech/{voice_id}/stream",
                headers={"xi-api-key": self._api_key, "Accept": "audio/mpeg"},
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.8,
                        "style": 0.0,
                        "use_speaker_boost": True,
                    },
                },
            )
            resp.raise_for_status()
            return await resp.aread()

    async def close(self) -> None:
        pass
