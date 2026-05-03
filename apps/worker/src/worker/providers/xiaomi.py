"""Xiaomi MiMo TTS provider — built-in voices and audio-sample voice cloning."""
from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import ClassVar

import httpx

from ..config import settings
from ..logging import get_logger
from ..services.crypto import decrypt_api_key
from .base import AudioBytes, VoiceRef

logger = get_logger("provider.xiaomi")

# Two MiMo deployments share the same OpenAI-compatible contract:
#   - api.xiaomimimo.com           → pay-as-you-go (keys start with sk-…)
#   - token-plan-sgp.xiaomimimo.com → Token Plan / subscription (keys start with tp-…)
DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1"
TOKEN_PLAN_BASE_URL = "https://token-plan-sgp.xiaomimimo.com/v1"


def _audio_mime(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in (".mp3", ".mpeg", ".mpga"):
        return "audio/mpeg"
    if suffix == ".wav":
        return "audio/wav"
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "audio/mpeg"


class XiaomiTTSProvider:
    name = "XIAOMI_TTS"
    supported_languages: ClassVar[list[str]] = ["zh", "en", "vi"]
    max_chunk_chars = 1500

    def __init__(self, api_key_enc: str | None = None, config: dict | None = None) -> None:
        self._config = config or {}
        raw = api_key_enc or settings.xiaomi_api_key
        self._api_key = decrypt_api_key(raw) if (raw and raw.startswith("sbx1:")) else raw or ""
        self.max_chunk_chars = int(self._config.get("maxChunkChars", 1500))
        self._base_url = self._resolve_base_url()

    def _resolve_base_url(self) -> str:
        configured = (self._config.get("baseUrl") or "").strip()
        if configured:
            return configured.rstrip("/")
        # Token Plan keys (tp-…) hit the SGP endpoint; default keys (sk-…) hit api.xiaomimimo.com.
        if self._api_key.startswith("tp-"):
            return TOKEN_PLAN_BASE_URL
        return DEFAULT_BASE_URL

    def _builtin_model(self) -> str:
        return str(self._config.get("model", "mimo-v2.5-tts"))

    def _clone_model(self) -> str:
        return str(self._config.get("cloneModel", "mimo-v2.5-tts-voiceclone"))

    def _format(self) -> str:
        return str(self._config.get("format", "wav"))

    def _builtin_voice(self) -> str:
        return str(self._config.get("voice", "Chloe"))

    def _style(self) -> str:
        return str(self._config.get("style", "")).strip()

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        """Encode reference audio to a data URL — MiMo uses it inline per request."""
        if not samples:
            return VoiceRef(
                provider_name=self.name,
                data={"mode": "builtin", "voice": self._builtin_voice()},
            )

        ref = samples[0]
        mime = _audio_mime(ref)
        encoded = base64.b64encode(ref.read_bytes()).decode("ascii")
        data_url = f"data:{mime};base64,{encoded}"
        logger.info("Xiaomi voice clone prepared", sample=str(ref), mime=mime, bytes=len(encoded))
        return VoiceRef(
            provider_name=self.name,
            data={"mode": "clone", "voice": data_url},
        )

    async def synthesize(
        self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0, style: str | None = None
    ) -> AudioBytes:
        if not self._api_key:
            raise RuntimeError("Xiaomi MiMo API key not configured")

        mode = voice.data.get("mode", "builtin")
        is_clone = mode == "clone"
        model = self._clone_model() if is_clone else self._builtin_model()

        style_text = (style or self._style()).strip()
        messages: list[dict[str, str]] = []
        if style_text:
            messages.append({"role": "user", "content": style_text})
        else:
            # Voice-clone always needs a user message slot per docs (may be empty).
            messages.append({"role": "user", "content": ""})
        messages.append({"role": "assistant", "content": text})

        audio_param: dict[str, str] = {"format": self._format(), "voice": voice.data["voice"]}

        payload = {"model": model, "messages": messages, "audio": audio_param}

        async with httpx.AsyncClient(timeout=300) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "api-key": self._api_key,
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code >= 400:
                logger.error("Xiaomi TTS failed", status=resp.status_code, body=resp.text[:500])
                resp.raise_for_status()
            data = resp.json()

        try:
            audio_b64 = data["choices"][0]["message"]["audio"]["data"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(f"Xiaomi TTS response missing audio data: {data}") from exc
        return base64.b64decode(audio_b64)

    async def self_test(self) -> str:
        if not self._api_key:
            return "Xiaomi MiMo: no API key configured."
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "api-key": self._api_key,
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._builtin_model(),
                    "messages": [
                        {"role": "user", "content": "Calm tone."},
                        {"role": "assistant", "content": "ok"},
                    ],
                    "audio": {"format": "wav", "voice": self._builtin_voice()},
                },
            )
        if resp.status_code == 200:
            return f"Xiaomi MiMo live ({self._builtin_model()})."
        return f"Xiaomi MiMo HTTP {resp.status_code}: {resp.text[:200]}"

    async def close(self) -> None:
        pass
