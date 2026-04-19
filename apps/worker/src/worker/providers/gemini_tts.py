"""Gemini TTS provider via google-generativeai."""
from __future__ import annotations

from pathlib import Path
import httpx
import json

from .base import VoiceRef, AudioBytes
from ..config import settings
from ..logging import get_logger
from ..services.crypto import decrypt_api_key

logger = get_logger("provider.gemini_tts")


class GeminiTTSProvider:
    name = "GEMINI_TTS"
    supported_languages = ["vi", "en", "zh", "fr", "de", "es", "pt", "ja", "ko"]
    max_chunk_chars = 5000

    def __init__(self, api_key_enc: str | None = None) -> None:
        raw = api_key_enc or settings.google_api_key
        self._api_key = decrypt_api_key(raw) if (raw and len(raw) > 40) else raw or ""
        self._model = "gemini-2.5-flash-preview-tts"

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        # Gemini TTS doesn't support custom voice cloning via standard API
        # Use a predefined voice mapped to the sample language
        return VoiceRef(provider_name=self.name, data={"voice_name": "Aoede", "sample_path": str(samples[0])})

    async def synthesize(self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0) -> AudioBytes:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent?key={self._api_key}"

        payload = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice.data.get("voice_name", "Aoede")}}
                },
            },
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

        # Extract base64 audio
        import base64
        audio_b64 = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
        return base64.b64decode(audio_b64)

    async def close(self) -> None:
        pass
