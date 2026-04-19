from __future__ import annotations

import json

import pytest

from worker.job_payloads import IngestJobPayload, RenderJobPayload
from worker.queue import QueueConsumer, decode_stream_message


class FakeRedis:
    def __init__(self) -> None:
        self.acks: list[tuple[str, str, str]] = []

    async def xack(self, stream_key: str, group: str, msg_id: str) -> None:
        self.acks.append((stream_key, group, msg_id))


def test_decode_stream_message_supports_explicit_and_legacy_fields() -> None:
    explicit = decode_stream_message(
        {
            "job": "ingest.enroll",
            "payload": json.dumps(
                {"profileId": "profile-1", "storageKey": "uploads/a.wav", "version": 3}
            ),
        }
    )
    assert explicit.job_name == "ingest.enroll"
    assert explicit.payload["profileId"] == "profile-1"

    legacy = decode_stream_message(
        {
            "name": "asr.diarize",
            "data": json.dumps({"generationId": "gen-1", "sourceKey": "uploads/a.wav"}),
        }
    )
    assert legacy.job_name == "asr.diarize"
    assert legacy.payload["sourceKey"] == "uploads/a.wav"


@pytest.mark.asyncio
async def test_queue_consumer_acks_malformed_messages() -> None:
    consumer = QueueConsumer("ingest", "workers", "worker-test")
    redis = FakeRedis()
    consumer._redis = redis

    await consumer._handle("0-1", {"job": "ingest.enroll", "payload": "{bad json"})

    assert redis.acks == [("ingest", "workers", "0-1")]


@pytest.mark.asyncio
async def test_queue_consumer_dispatches_typed_payloads_from_explicit_streams() -> None:
    consumer = QueueConsumer("ingest", "workers", "worker-test")
    redis = FakeRedis()
    consumer._redis = redis

    received: list[tuple[str, IngestJobPayload]] = []

    async def handler(job_name: str, payload: object) -> None:
        assert isinstance(payload, IngestJobPayload)
        received.append((job_name, payload))

    consumer.register("ingest.enroll", handler, IngestJobPayload)

    await consumer._handle(
        "1-0",
        {
            "job": "ingest.enroll",
            "payload": json.dumps(
                {
                    "profileId": "profile-1",
                    "storageKey": "uploads/sample.wav",
                    "version": 2,
                    "userId": "user-9",
                }
            ),
        },
    )

    assert len(received) == 1
    assert received[0][0] == "ingest.enroll"
    assert received[0][1].storage_key == "uploads/sample.wav"
    assert redis.acks == [("ingest", "workers", "1-0")]


@pytest.mark.asyncio
async def test_queue_consumer_acks_invalid_typed_payloads() -> None:
    consumer = QueueConsumer("render", "workers", "worker-test")
    redis = FakeRedis()
    consumer._redis = redis

    called = False

    async def handler(job_name: str, payload: object) -> None:
        nonlocal called
        called = True

    consumer.register("render.generation", handler, RenderJobPayload)

    await consumer._handle(
        "2-0",
        {
            "job": "render.generation",
            "payload": json.dumps({"generationId": "gen-1", "kind": "PODCAST"}),
        },
    )

    assert called is False
    assert redis.acks == [("render", "workers", "2-0")]


@pytest.mark.asyncio
async def test_queue_consumer_leaves_failed_jobs_pending() -> None:
    consumer = QueueConsumer("asr", "workers", "worker-test")
    redis = FakeRedis()
    consumer._redis = redis

    async def handler(job_name: str, payload: object) -> None:
        raise RuntimeError(f"{job_name} failed")

    consumer.register("asr.diarize", handler)

    await consumer._handle(
        "3-0",
        {
            "job": "asr.diarize",
            "payload": json.dumps({"generationId": "gen-1", "sourceKey": "uploads/a.wav"}),
        },
    )

    assert redis.acks == []
