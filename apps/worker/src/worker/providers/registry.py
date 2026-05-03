"""Provider factory — instantiate the right provider from a config dict."""
from __future__ import annotations

import json
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
    normalized_config = config or {}
    cache_key = f"{name}:{api_key_enc or ''}:{json.dumps(normalized_config, sort_keys=True, default=str)}"
    if cache_key in _INSTANCES:
        return _INSTANCES[cache_key]

    provider: TTSProvider
    match name:
        case "VIENEU_TTS":
            from .vieneu import VieNeuProvider
            provider = VieNeuProvider(config=normalized_config)
        case "VOXCPM2":
            from .voxcpm2 import VoxCPM2Provider
            provider = VoxCPM2Provider(config=normalized_config)
        case "XTTS_V2":
            provider = XTTSProvider(config=normalized_config)
        case "F5_TTS":
            from .f5 import F5Provider
            provider = F5Provider(config=normalized_config)
        case "ELEVENLABS":
            provider = ElevenLabsProvider(api_key_enc=api_key_enc, config=normalized_config)
        case "GEMINI_TTS":
            provider = GeminiTTSProvider(api_key_enc=api_key_enc, config=normalized_config)
        case "VIBEVOICE":
            from .vibevoice import VibeVoiceProvider
            provider = VibeVoiceProvider(config=normalized_config)
        case "XIAOMI_TTS":
            from .xiaomi import XiaomiTTSProvider
            provider = XiaomiTTSProvider(api_key_enc=api_key_enc, config=normalized_config)
        case "XAI_TTS":
            from .xai import XAITTSProvider
            provider = XAITTSProvider(api_key_enc=api_key_enc, config=normalized_config)
        case _:
            raise ValueError(f"Unknown provider: {name}")

    _INSTANCES[cache_key] = provider
    return provider
