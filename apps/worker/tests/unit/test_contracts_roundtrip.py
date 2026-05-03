"""P0-06: Round-trip test proving Node-serialized JSON payloads deserialize in Python."""

from __future__ import annotations

import json

from worker.job_payloads import AsrJobPayload, IngestJobPayload, RenderJobPayload


def _node_ingest_json() -> str:
    """Simulate what the Node web app sends to the Redis Stream."""
    return json.dumps({
        "profileId": "clxxx0001profileid",
        "storageKey": "uploads/clxxx0001profileid/abc123.wav",
        "version": 1,
        "userId": "clxxx0001userid",
        "notes": "Initial enrollment",
    })


def _node_render_presentation_json() -> str:
    return json.dumps({
        "generationId": "clxxx0002genid",
        "providerId": "clxxx0003providerid",
        "kind": "PRESENTATION",
        "speakers": [
            {
                "label": "A",
                "profileId": "clxxx0001profileid",
                "segments": [],
                "script": "Xin chào và chào mừng đến với bản tin hôm nay.",
            }
        ],
        "output": {"mp3": True, "wav": True, "chapters": False},
        "pacingLock": False,
    })


def _node_render_podcast_json() -> str:
    return json.dumps({
        "generationId": "clxxx0004genid",
        "providerId": "clxxx0003providerid",
        "kind": "PODCAST",
        "speakers": [
            {
                "label": "A",
                "profileId": "clxxx0001profileid",
                "segments": [{"startMs": 0, "endMs": 8000, "text": "Xin chào"}],
            },
            {
                "label": "B",
                "profileId": "clxxx0002profileid",
                "segments": [{"startMs": 8000, "endMs": 14000, "text": "Cảm ơn bạn"}],
            },
        ],
        "output": {"mp3": True, "wav": True, "chapters": True},
        "pacingLock": False,
    })


def _node_asr_json() -> str:
    return json.dumps({
        "generationId": "clxxx0005genid",
        "sourceKey": "uploads/sources/userid/podcast.mp3",
        "expectedSpeakers": 2,
    })


def test_ingest_payload_roundtrip() -> None:
    payload = IngestJobPayload.model_validate_json(_node_ingest_json())

    assert payload.profile_id == "clxxx0001profileid"
    assert payload.storage_key == "uploads/clxxx0001profileid/abc123.wav"
    assert payload.version == 1
    assert payload.user_id == "clxxx0001userid"
    assert payload.notes == "Initial enrollment"


def test_ingest_payload_roundtrip_minimal() -> None:
    """Node may omit optional fields."""
    minimal = json.dumps({
        "profileId": "prof-abc",
        "storageKey": "uploads/prof-abc/x.wav",
        "version": 3,
    })
    payload = IngestJobPayload.model_validate_json(minimal)
    assert payload.version == 3
    assert payload.notes is None


def test_render_presentation_roundtrip() -> None:
    payload = RenderJobPayload.model_validate_json(_node_render_presentation_json())

    assert payload.generation_id == "clxxx0002genid"
    assert payload.kind == "PRESENTATION"
    assert len(payload.speakers) == 1
    assert payload.speakers[0].label == "A"
    assert payload.speakers[0].script is not None
    assert payload.output.mp3 is True
    assert payload.output.chapters is False
    assert payload.pacing_lock is False


def test_render_podcast_roundtrip() -> None:
    payload = RenderJobPayload.model_validate_json(_node_render_podcast_json())

    assert payload.kind == "PODCAST"
    assert len(payload.speakers) == 2
    speaker_b = next(s for s in payload.speakers if s.label == "B")
    assert len(speaker_b.segments) == 1
    assert speaker_b.segments[0].start_ms == 8000
    assert speaker_b.segments[0].end_ms == 14000
    assert payload.output.chapters is True


def test_asr_payload_roundtrip() -> None:
    payload = AsrJobPayload.model_validate_json(_node_asr_json())

    assert payload.generation_id == "clxxx0005genid"
    assert payload.source_key == "uploads/sources/userid/podcast.mp3"
    assert payload.expected_speakers == 2


def test_unknown_fields_ignored() -> None:
    """Extra fields from future Node versions must not crash the worker."""
    future_payload = json.dumps({
        "profileId": "prof-x",
        "storageKey": "uploads/prof-x/y.wav",
        "version": 1,
        "newFieldAddedInV2": "some value",
    })
    payload = IngestJobPayload.model_validate_json(future_payload)
    assert payload.profile_id == "prof-x"
