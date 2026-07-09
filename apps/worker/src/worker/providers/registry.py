"""Provider factory — instantiate the right provider from a config dict."""
from __future__ import annotations

import json
from typing import Any

from .base import TTSProvider
from .elevenlabs import ElevenLabsProvider
from .gemini_tts import GeminiTTSProvider

_INSTANCES: dict[str, TTSProvider] = {}

# Soft-dropped 2026-07: stock Coqui XTTS-v2 has no Vietnamese and dragged in a
# heavy coqui-tts + transformers pin. Enum may still exist in DB history rows.
_DROPPED_PROVIDERS = {
    "XTTS_V2": (
        "XTTS-v2 support was dropped. Stock Coqui multi-dataset XTTS does not "
        "support Vietnamese. Use MiniMax / xAI / ElevenLabs for production clone, "
        "or VieNeu / VoxCPM2 for local screening."
    ),
}


def get_provider(
    name: str,
    api_key_enc: str | None = None,
    config: dict[str, Any] | None = None,
) -> TTSProvider:
    if name in _DROPPED_PROVIDERS:
        raise ValueError(_DROPPED_PROVIDERS[name])

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
        case "MINIMAX_TTS":
            from .minimax import MiniMaxProvider
            provider = MiniMaxProvider(api_key_enc=api_key_enc, config=normalized_config)
        case "KOKORO":
            from .kokoro import KokoroProvider
            provider = KokoroProvider(config=normalized_config)
        case "INDEXTTS2":
            from .indextts import IndexTTS2Provider
            provider = IndexTTS2Provider(config=normalized_config)
        case _:
            raise ValueError(f"Unknown provider: {name}")

    _INSTANCES[cache_key] = provider
    return provider
