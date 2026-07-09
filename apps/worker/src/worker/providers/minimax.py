"""MiniMax Speech provider — rapid voice cloning + T2A v2 synthesis."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any, ClassVar

import httpx

from ..config import settings
from ..logging import get_logger
from ..services.crypto import decrypt_api_key
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.minimax")

BASE_URL = "https://api.minimax.io/v1"

# ISO 639-1 → MiniMax language_boost values (t2a_v2 docs).
_LANGUAGE_BOOST = {
    "vi": "Vietnamese",
    "en": "English",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "pt": "Portuguese",
    "ru": "Russian",
    "it": "Italian",
    "id": "Indonesian",
    "th": "Thai",
    "tr": "Turkish",
    "nl": "Dutch",
    "pl": "Polish",
    "hi": "Hindi",
    "ar": "Arabic",
}

_AUDIO_MIME = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
}


def _check_base_resp(payload: dict, action: str) -> None:
    base = payload.get("base_resp") or {}
    if base.get("status_code", 0) != 0:
        raise RuntimeError(
            f"MiniMax {action} failed ({base.get('status_code')}): {base.get('status_msg', 'unknown error')}"
        )


class MiniMaxProvider:
    name = "MINIMAX_TTS"
    supported_languages: ClassVar[list[str]] = sorted(_LANGUAGE_BOOST)
    max_chunk_chars = 3000

    def __init__(self, api_key_enc: str | None = None, config: dict[str, Any] | None = None) -> None:
        self._config = config or {}
        raw = api_key_enc or settings.minimax_api_key
        self._api_key = (decrypt_api_key(raw) if (raw and raw.startswith("sbx1:")) else raw or "").strip()
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 3000))

    def _headers(self) -> dict[str, str]:
        if not self._api_key:
            raise RuntimeError("MiniMax API key not configured")
        return {"Authorization": f"Bearer {self._api_key}"}

    def _model(self) -> str:
        return str(self._config.get("model", "speech-2.6-hd"))

    def _default_voice(self) -> str:
        return str(self._config.get("voice", "Wise_Woman"))

    def _audio_setting(self) -> dict[str, int | str]:
        return {
            "sample_rate": int(self._config.get("sampleRate", 32000)),
            "bitrate": int(self._config.get("bitRate", 128000)),
            "format": str(self._config.get("format", "mp3")),
            "channel": 1,
        }

    @staticmethod
    def _clone_voice_id(sample: Path) -> str:
        """Deterministic voice_id per reference clip, so re-renders reuse the
        same MiniMax clone instead of paying the clone fee every time."""
        digest = hashlib.sha1(sample.read_bytes()).hexdigest()[:16]
        return f"vs{digest}"

    async def _clone_exists(self, client: httpx.AsyncClient, voice_id: str) -> bool:
        resp = await client.post(
            f"{BASE_URL}/get_voice",
            headers=self._headers(),
            json={"voice_type": "voice_cloning"},
        )
        resp.raise_for_status()
        payload = resp.json()
        _check_base_resp(payload, "get_voice")
        voices = payload.get("voice_cloning") or []
        return any(v.get("voice_id") == voice_id for v in voices)

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        """Reuse an existing MiniMax clone for this reference clip, or create one.

        Note: MiniMax deletes cloned voices that go unused for 7 days, and
        never-used clones are invisible to get_voice — so a duplicate-id error
        from /voice_clone also means the clone exists and is usable.
        """
        if not samples:
            return VoiceRef(provider_name=self.name, data={"voice_id": self._default_voice()})

        ref = samples[0]
        voice_id = self._clone_voice_id(ref)

        async with httpx.AsyncClient(timeout=180) as client:
            if await self._clone_exists(client, voice_id):
                logger.info("Reusing MiniMax cloned voice", voice_id=voice_id)
                return VoiceRef(provider_name=self.name, data={"voice_id": voice_id})

            mime = _AUDIO_MIME.get(ref.suffix.lower(), "audio/wav")
            upload = await client.post(
                f"{BASE_URL}/files/upload",
                headers=self._headers(),
                data={"purpose": "voice_clone"},
                files={"file": (ref.name, ref.read_bytes(), mime)},
            )
            upload.raise_for_status()
            upload_payload = upload.json()
            _check_base_resp(upload_payload, "file upload")
            file_id = (upload_payload.get("file") or {}).get("file_id")
            if not file_id:
                raise RuntimeError(f"MiniMax upload response missing file_id: {upload_payload}")

            body: dict[str, Any] = {"file_id": file_id, "voice_id": voice_id}
            if bool(self._config.get("noiseReduction", False)):
                body["need_noise_reduction"] = True
            resp = await client.post(f"{BASE_URL}/voice_clone", headers=self._headers(), json=body)
            resp.raise_for_status()
            payload = resp.json()
            base = payload.get("base_resp") or {}
            msg = str(base.get("status_msg", ""))
            if base.get("status_code", 0) != 0:
                if "exist" in msg.lower() or "duplicate" in msg.lower():
                    logger.info("MiniMax clone already exists, reusing", voice_id=voice_id)
                else:
                    raise RuntimeError(f"MiniMax voice_clone failed ({base.get('status_code')}): {msg}")
            else:
                logger.info("MiniMax voice cloned", voice_id=voice_id, file_id=file_id)

        return VoiceRef(provider_name=self.name, data={"voice_id": voice_id})

    async def synthesize(
        self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0, style: str | None = None
    ) -> AudioBytes:
        voice_id = voice.data.get("voice_id") or self._default_voice()
        body = {
            "model": self._model(),
            "text": text,
            "stream": False,
            "output_format": "hex",
            "language_boost": _LANGUAGE_BOOST.get(lang, "auto"),
            "voice_setting": {
                "voice_id": voice_id,
                "speed": max(0.5, min(2.0, float(speed))),
                "vol": 1.0,
                "pitch": 0,
            },
            "audio_setting": self._audio_setting(),
        }

        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(f"{BASE_URL}/t2a_v2", headers=self._headers(), json=body)
            if resp.status_code >= 400:
                logger.error("MiniMax T2A failed", status=resp.status_code, body=resp.text[:500])
                resp.raise_for_status()
            payload = resp.json()
        _check_base_resp(payload, "t2a_v2")
        audio_hex = (payload.get("data") or {}).get("audio")
        if not audio_hex:
            raise RuntimeError(f"MiniMax t2a_v2 response missing audio: {payload.get('base_resp')}")
        return bytes.fromhex(audio_hex)

    async def self_test(self) -> str:
        if not self._api_key:
            return "MiniMax: no API key configured."
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{BASE_URL}/get_voice",
                headers=self._headers(),
                json={"voice_type": "voice_cloning"},
            )
        if resp.status_code != 200:
            return f"MiniMax HTTP {resp.status_code}: {resp.text[:200]}"
        payload = resp.json()
        base = payload.get("base_resp") or {}
        if base.get("status_code", 0) != 0:
            return f"MiniMax error {base.get('status_code')}: {base.get('status_msg', '')[:200]}"
        count = len(payload.get("voice_cloning") or [])
        return f"MiniMax live ({self._model()}). {count} cloned voice(s) registered."

    async def close(self) -> None:
        pass
