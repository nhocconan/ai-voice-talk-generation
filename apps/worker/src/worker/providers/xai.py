"""xAI Grok TTS + custom voices provider."""
from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import ClassVar

import httpx

from ..config import settings
from ..logging import get_logger
from ..services.crypto import decrypt_api_key
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.xai")

BASE_URL = "https://api.x.ai/v1"

# xAI BCP-47 codes — pass through `auto` if the language is unknown.
_LANG_PASSTHROUGH = {
    "vi", "en", "zh", "fr", "de", "hi", "id", "it",
    "ja", "ko", "ru", "tr", "bn",
}

CONTENT_TYPE_BY_CODEC = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "pcm": "audio/pcm",
    "mulaw": "audio/basic",
    "alaw": "audio/alaw",
}


def _audio_mime(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".wav":
        return "audio/wav"
    if suffix in (".mp3", ".mpeg"):
        return "audio/mpeg"
    if suffix == ".flac":
        return "audio/flac"
    if suffix in (".m4a", ".mp4"):
        return "audio/mp4"
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "audio/wav"


class XAITTSProvider:
    name = "XAI_TTS"
    supported_languages: ClassVar[list[str]] = sorted(_LANG_PASSTHROUGH)
    max_chunk_chars = 5000

    def __init__(self, api_key_enc: str | None = None, config: dict | None = None) -> None:
        self._config = config or {}
        raw = api_key_enc or settings.xai_api_key
        self._api_key = decrypt_api_key(raw) if (raw and raw.startswith("sbx1:")) else raw or ""
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 5000))

    def _default_voice(self) -> str:
        return str(self._config.get("voice", "eve"))

    def _output_format(self) -> dict[str, int | str]:
        return {
            "codec": str(self._config.get("codec", "mp3")),
            "sample_rate": int(self._config.get("sampleRate", 24000)),
            "bit_rate": int(self._config.get("bitRate", 128000)),
        }

    def _language(self, lang: str) -> str:
        return lang if lang in _LANG_PASSTHROUGH else "auto"

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        """Upload reference audio to /custom-voices and return the voice_id."""
        if not samples:
            return VoiceRef(provider_name=self.name, data={"voice_id": self._default_voice()})

        if not self._api_key:
            raise RuntimeError("xAI API key not configured")

        ref = samples[0]
        mime = _audio_mime(ref)
        async with httpx.AsyncClient(timeout=180) as client:
            files = {"file": (ref.name, ref.read_bytes(), mime)}
            data = {"name": f"yng-clone-{ref.stem[:32]}"}
            resp = await client.post(
                f"{BASE_URL}/custom-voices",
                headers={"Authorization": f"Bearer {self._api_key}"},
                files=files,
                data=data,
            )
            if resp.status_code >= 400:
                logger.error("xAI custom-voice failed", status=resp.status_code, body=resp.text[:500])
                resp.raise_for_status()
            payload = resp.json()
        voice_id = payload.get("voice_id") or payload.get("id")
        if not voice_id:
            raise RuntimeError(f"xAI custom-voice response missing voice_id: {payload}")
        logger.info("xAI custom voice created", voice_id=voice_id)
        return VoiceRef(provider_name=self.name, data={"voice_id": voice_id})

    async def synthesize(
        self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0, style: str | None = None
    ) -> AudioBytes:
        if not self._api_key:
            raise RuntimeError("xAI API key not configured")

        voice_id = voice.data.get("voice_id") or self._default_voice()
        body = {
            "text": text,
            "voice_id": voice_id,
            "language": self._language(lang),
            "output_format": self._output_format(),
            "text_normalization": bool(self._config.get("textNormalization", False)),
        }

        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                f"{BASE_URL}/tts",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            if resp.status_code >= 400:
                logger.error("xAI TTS failed", status=resp.status_code, body=resp.text[:500])
                resp.raise_for_status()
            return await resp.aread()

    async def self_test(self) -> str:
        if not self._api_key:
            return "xAI: no API key configured."
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{BASE_URL}/tts/voices",
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
        if resp.status_code == 200:
            data = resp.json()
            voices = data.get("voices") or data.get("data") or []
            return f"xAI live. {len(voices)} voices reachable."
        return f"xAI HTTP {resp.status_code}: {resp.text[:200]}"

    async def close(self) -> None:
        pass
