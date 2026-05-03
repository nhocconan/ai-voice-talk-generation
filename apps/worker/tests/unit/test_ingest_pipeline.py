"""Unit tests for the ingest audio pipeline (normalize, quality, storage)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from unittest.mock import AsyncMock, patch


@dataclass
class FakeQualityDetail:
    duration_s: float = 12.5
    snr_db: float = 35.2
    pitch_std_hz: float = 8.1
    clipping_ratio: float = 0.0
    noise_floor_db: float = -55.0


async def _run(
    *,
    profile_id: str = "prof-1",
    storage_key: str = "uploads/x.wav",
    version: int = 1,
    user_id: str = "user-1",
    notes: str | None = None,
    db_calls: list[dict],
) -> None:
    from worker.pipelines.ingest import run_ingest

    async def fake_db(**kwargs: object) -> None:
        db_calls.append(dict(kwargs))

    with (
        patch("worker.pipelines.ingest.download_object") as dl,
        patch("worker.pipelines.ingest.upload_object") as ul,
        patch("worker.pipelines.ingest.normalize_audio", new_callable=AsyncMock) as norm,
        patch("worker.pipelines.ingest.score_sample") as score,
        patch("worker.pipelines.ingest._vad_trim") as vad,
    ):
        async def async_normalize(src: Path, dst: Path) -> None:
            dst.write_bytes(b"RIFF")

        norm.side_effect = async_normalize

        fake_detail = FakeQualityDetail()
        score.return_value = (82, fake_detail)

        def fake_dl(key: str, dest: Path) -> None:
            dest.write_bytes(b"fake audio data")

        dl.side_effect = fake_dl
        ul.return_value = None
        vad.side_effect = Exception("silero not available")  # force skip

        await run_ingest(
            profile_id=profile_id,
            storage_key=storage_key,
            version=version,
            user_id=user_id,
            notes=notes,
            db_update_fn=fake_db,
        )


def test_ingest_calls_db_update_with_correct_fields() -> None:
    import asyncio

    db_calls: list[dict] = []
    asyncio.run(_run(profile_id="prof-abc", version=2, db_calls=db_calls))

    assert len(db_calls) == 1
    call = db_calls[0]
    assert call["profile_id"] == "prof-abc"
    assert call["version"] == 2
    assert call["output_key"] == "voice-samples/prof-abc/v2.wav"
    assert call["score"] == 82
    assert call["duration_ms"] == 12500
    assert call["notes"] is None


def test_ingest_passes_notes_to_db() -> None:
    import asyncio

    db_calls: list[dict] = []
    asyncio.run(_run(notes="Recorded in quiet room", db_calls=db_calls))
    assert db_calls[0]["notes"] == "Recorded in quiet room"


def test_ingest_output_key_format() -> None:
    import asyncio

    db_calls: list[dict] = []
    asyncio.run(_run(profile_id="profile-xyz", version=5, db_calls=db_calls))
    assert db_calls[0]["output_key"] == "voice-samples/profile-xyz/v5.wav"
