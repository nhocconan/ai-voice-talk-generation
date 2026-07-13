"""Unit tests for FR-9 pacing-lock rephrase (web LLM endpoint first, silent degrade)."""

from __future__ import annotations

import httpx
import pytest
import respx

from worker.config import settings
from worker.pipelines.render import _rephrase_for_pacing


@pytest.mark.asyncio
@respx.mock
async def test_rephrase_uses_web_endpoint_first(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "web_base_url", "http://web:3000")
    monkeypatch.setattr(settings, "internal_api_token", "secret-token")
    # Ensure the env-Gemini fallback is never reached on the happy path.
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    route = respx.post("http://web:3000/api/internal/llm-rephrase").mock(
        return_value=httpx.Response(200, json={"text": "tightened line"})
    )

    out = await _rephrase_for_pacing("original line", target_ms=5000, lang="en")

    assert out == "tightened line"
    assert route.called
    sent = route.calls.last.request
    assert sent.headers["x-internal-token"] == "secret-token"


@pytest.mark.asyncio
@respx.mock
async def test_rephrase_degrades_to_original(monkeypatch: pytest.MonkeyPatch) -> None:
    # Web endpoint fails and no env Gemini → original text is returned, never raises.
    monkeypatch.setattr(settings, "web_base_url", "http://web:3000")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    respx.post("http://web:3000/api/internal/llm-rephrase").mock(
        return_value=httpx.Response(503, json={"error": "No LLM configured"})
    )

    out = await _rephrase_for_pacing("keep me", target_ms=5000, lang="vi")

    assert out == "keep me"
