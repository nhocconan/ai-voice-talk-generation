"""Provider-native voice IDs resolve exclusively from the selected profile."""

from __future__ import annotations

import psycopg2
import pytest

from worker.main import _get_speaker_sample_keys


class FakeCursor:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def __enter__(self) -> FakeCursor:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def execute(self, query: str, _params: tuple[str]) -> None:
        self.queries.append(query)

    def fetchone(self) -> dict[str, object]:
        return {
            "lang": "vi",
            "providerVoiceIds": {"XAI_TTS": "profile-owned-id"},
        }

    def fetchall(self) -> list[dict[str, str]]:
        raise AssertionError("xAI profile-native voices must not load sample audio")


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor
        self.closed = False

    def cursor(self, **_kwargs: object) -> FakeCursor:
        return self._cursor

    def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_profile_mapping_is_authoritative_even_for_legacy_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cursor = FakeCursor()
    connection = FakeConnection(cursor)
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused")
    monkeypatch.setattr(psycopg2, "connect", lambda _url: connection)

    speakers = await _get_speaker_sample_keys(
        [{
            "label": "A",
            "profileId": "profile-1",
            "segments": [],
            "xaiVoiceId": "legacy-override-must-be-ignored",
        }],
        provider_name="XAI_TTS",
    )

    assert speakers[0]["provider_voice_id"] == "profile-owned-id"
    assert len(cursor.queries) == 1
    assert connection.closed
