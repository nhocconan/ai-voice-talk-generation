"""Unit tests for the MiniMax Speech provider (cloning reuse + T2A synthesis)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
import respx

from worker.providers.base import VoiceRef
from worker.providers.minimax import BASE_URL, MiniMaxProvider

OK = {"status_code": 0, "status_msg": "success"}


@pytest.fixture
def sample(tmp_path: Path) -> Path:
    ref = tmp_path / "ref.wav"
    ref.write_bytes(b"RIFF-fake-wav-bytes")
    return ref


def _provider(**config) -> MiniMaxProvider:
    return MiniMaxProvider(api_key_enc="test-key", config=config)


def test_clone_voice_id_is_deterministic(sample: Path) -> None:
    a = MiniMaxProvider._clone_voice_id(sample)
    b = MiniMaxProvider._clone_voice_id(sample)
    assert a == b
    assert a.startswith("vs")
    assert 8 <= len(a) <= 256


@pytest.mark.asyncio
@respx.mock
async def test_prepare_voice_reuses_existing_clone(sample: Path) -> None:
    voice_id = MiniMaxProvider._clone_voice_id(sample)
    respx.post(f"{BASE_URL}/get_voice").mock(
        return_value=httpx.Response(
            200, json={"voice_cloning": [{"voice_id": voice_id}], "base_resp": OK}
        )
    )
    clone_route = respx.post(f"{BASE_URL}/voice_clone")

    ref = await _provider().prepare_voice([sample])

    assert ref.data["voice_id"] == voice_id
    assert not clone_route.called


@pytest.mark.asyncio
@respx.mock
async def test_prepare_voice_clones_when_missing(sample: Path) -> None:
    voice_id = MiniMaxProvider._clone_voice_id(sample)
    respx.post(f"{BASE_URL}/get_voice").mock(
        return_value=httpx.Response(200, json={"voice_cloning": [], "base_resp": OK})
    )
    respx.post(f"{BASE_URL}/files/upload").mock(
        return_value=httpx.Response(200, json={"file": {"file_id": 42}, "base_resp": OK})
    )
    clone_route = respx.post(f"{BASE_URL}/voice_clone").mock(
        return_value=httpx.Response(200, json={"base_resp": OK})
    )

    ref = await _provider().prepare_voice([sample])

    assert ref.data["voice_id"] == voice_id
    body = json.loads(clone_route.calls.last.request.content)
    assert body == {"file_id": 42, "voice_id": voice_id}


@pytest.mark.asyncio
@respx.mock
async def test_prepare_voice_treats_duplicate_clone_as_reuse(sample: Path) -> None:
    respx.post(f"{BASE_URL}/get_voice").mock(
        return_value=httpx.Response(200, json={"voice_cloning": [], "base_resp": OK})
    )
    respx.post(f"{BASE_URL}/files/upload").mock(
        return_value=httpx.Response(200, json={"file": {"file_id": 42}, "base_resp": OK})
    )
    respx.post(f"{BASE_URL}/voice_clone").mock(
        return_value=httpx.Response(
            200, json={"base_resp": {"status_code": 2038, "status_msg": "voice_id already exists"}}
        )
    )

    ref = await _provider().prepare_voice([sample])
    assert ref.data["voice_id"] == MiniMaxProvider._clone_voice_id(sample)


@pytest.mark.asyncio
async def test_prepare_voice_without_samples_uses_fallback_voice() -> None:
    ref = await _provider(voice="Deep_Voice_Man").prepare_voice([])
    assert ref.data["voice_id"] == "Deep_Voice_Man"


@pytest.mark.asyncio
@respx.mock
async def test_synthesize_decodes_hex_and_sets_language_boost() -> None:
    audio = b"fake-mp3-bytes"
    route = respx.post(f"{BASE_URL}/t2a_v2").mock(
        return_value=httpx.Response(
            200, json={"data": {"audio": audio.hex(), "status": 2}, "base_resp": OK}
        )
    )

    voice = VoiceRef(provider_name="MINIMAX_TTS", data={"voice_id": "vsabc12345678"})
    result = await _provider(model="speech-2.6-hd").synthesize("Xin chào", voice, "vi")

    assert result == audio
    body = json.loads(route.calls.last.request.content)
    assert body["model"] == "speech-2.6-hd"
    assert body["language_boost"] == "Vietnamese"
    assert body["voice_setting"]["voice_id"] == "vsabc12345678"
    assert body["output_format"] == "hex"


@pytest.mark.asyncio
@respx.mock
async def test_synthesize_raises_on_api_error() -> None:
    respx.post(f"{BASE_URL}/t2a_v2").mock(
        return_value=httpx.Response(
            200, json={"base_resp": {"status_code": 1004, "status_msg": "voice not found"}}
        )
    )

    voice = VoiceRef(provider_name="MINIMAX_TTS", data={"voice_id": "vsmissing123"})
    with pytest.raises(RuntimeError, match="voice not found"):
        await _provider().synthesize("Xin chào", voice, "vi")


def test_registry_resolves_minimax() -> None:
    from worker.providers.registry import get_provider

    provider = get_provider("MINIMAX_TTS", api_key_enc="k", config={"maxChunkChars": 1234})
    assert provider.name == "MINIMAX_TTS"
    assert provider.max_chunk_chars == 1234
