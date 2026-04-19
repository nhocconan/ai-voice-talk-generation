"""Provider factory — instantiate the right provider from a config dict."""
from __future__ import annotations

from typing import Any

from .base import TTSProvider
from .elevenlabs import ElevenLabsProvider
from .gemini_tts import GeminiTTSProvider
from .xtts import XTTSProvider

_INSTANCES: dict[str, TTSProvider] = {}


def get_provider(
    name: str,
    api_key_enc: str | None = None,
    config: dict[str, Any] | None = None,
) -> TTSProvider:
    cache_key = f"{name}:{api_key_enc or ''}"
    if cache_key in _INSTANCES:
        return _INSTANCES[cache_key]

    provider: TTSProvider
    match name:
        case "XTTS_V2":
            provider = XTTSProvider()
        case "F5_TTS":
            from .f5 import F5Provider
            provider = F5Provider()
        case "ELEVENLABS":
            provider = ElevenLabsProvider(api_key_enc=api_key_enc)
        case "GEMINI_TTS":
            provider = GeminiTTSProvider(api_key_enc=api_key_enc)
        case _:
            raise ValueError(f"Unknown provider: {name}")

    _INSTANCES[cache_key] = provider
    return provider
