"""xAI TTS uses the Voice ID resolved from the selected profile."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from worker.providers.base import VoiceRef
from worker.providers.xai import XAITTSProvider


@pytest.mark.asyncio
@respx.mock
async def test_synthesize_uses_profile_voice_id() -> None:
    route = respx.post("https://api.x.ai/v1/tts").mock(
        return_value=httpx.Response(200, content=b"audio-bytes")
    )
    provider = XAITTSProvider(api_key_enc="test-key")

    audio = await provider.synthesize(
        "Xin chào",
        VoiceRef("XAI_TTS", {"voice_id": "profile-voice-id"}),
        "vi",
    )

    assert audio == b"audio-bytes"
    body = json.loads(route.calls[0].request.content)
    assert body["voice_id"] == "profile-voice-id"
    assert body["language"] == "vi"


@pytest.mark.asyncio
async def test_synthesize_rejects_missing_profile_voice_id() -> None:
    provider = XAITTSProvider(api_key_enc="test-key", config={"defaultVoiceId": "legacy-default"})

    with pytest.raises(RuntimeError, match="selected voice profile"):
        await provider.synthesize("Xin chào", VoiceRef("XAI_TTS", {}), "vi")
