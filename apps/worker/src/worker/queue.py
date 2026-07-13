"""Redis Streams queue consumer for explicit ingest/asr/render payload streams."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Awaitable, Callable, Mapping
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import redis.asyncio as aioredis
from pydantic import BaseModel, ValidationError

from .config import settings
from .logging import get_logger

logger = get_logger("queue")

PENDING_RETRY_SECONDS = 60
MAX_DELIVERIES = 3

JobHandler = Callable[[str, object], Awaitable[None]]


@dataclass(slots=True)
class StreamMessage:
    job_name: str
    payload: dict[str, Any]


@dataclass(slots=True)
class RegisteredHandler:
    handler: JobHandler
    payload_model: type[BaseModel] | None = None


def decode_stream_message(fields: Mapping[str, str]) -> StreamMessage:
    job_name = fields.get("job") or fields.get("name")
    if not job_name:
        raise ValueError("Stream message is missing a job name")

    raw_payload = fields.get("payload") or fields.get("data")
    if raw_payload is None:
        raise ValueError("Stream message is missing a payload")

    try:
        payload = json.loads(raw_payload)
    except json.JSONDecodeError as exc:
        raise ValueError("Stream message payload is not valid JSON") from exc

    if not isinstance(payload, dict):
        raise TypeError("Stream message payload must decode to an object")

    return StreamMessage(job_name=job_name, payload=payload)


class QueueConsumer:
    """Minimal Redis Streams consumer over explicit per-queue payload streams."""

    def __init__(
        self,
        queue_name: str,
        group: str,
        consumer: str,
        *,
        stream_key: str | None = None,
    ) -> None:
        self.queue_name = queue_name
        self.group = group
        self.consumer = consumer
        self.stream_key = stream_key or queue_name
        self._redis: aioredis.Redis | None = None
        self._handlers: dict[str, RegisteredHandler] = {}
        self._running = False
        self._next_pending_retry = 0.0

    def register(
        self,
        job_name: str,
        handler: JobHandler,
        payload_model: type[BaseModel] | None = None,
    ) -> None:
        self._handlers[job_name] = RegisteredHandler(handler=handler, payload_model=payload_model)

    async def start(self) -> None:
        # socket_timeout must exceed the XREADGROUP `block` (5s) — redis-py 8.x's
        # default read timeout is ~5s, so an idle blocking read would otherwise raise
        # "Timeout reading from redis:6379" every poll cycle while the queue is empty.
        self._redis = aioredis.from_url(
            settings.redis_url, decode_responses=True, socket_timeout=10
        )
        # Ensure consumer group exists
        with suppress(Exception):
            await self._redis.xgroup_create(self.stream_key, self.group, id="0", mkstream=True)
        self._running = True
        logger.info("Queue consumer started", queue=self.queue_name, stream=self.stream_key)

    async def run(self) -> None:
        if self._redis is None:
            raise RuntimeError("QueueConsumer.start() must be called before run()")

        while self._running:
            try:
                if time.monotonic() >= self._next_pending_retry:
                    await self._recover_pending()
                    self._next_pending_retry = time.monotonic() + PENDING_RETRY_SECONDS
                results = await self._redis.xreadgroup(
                    self.group,
                    self.consumer,
                    {self.stream_key: ">"},
                    count=1,
                    block=5000,
                )
                for _stream, messages in results or []:
                    for msg_id, fields in messages:
                        await self._handle(msg_id, fields)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Consumer error", error=str(e))
                await asyncio.sleep(1)

    async def _recover_pending(self) -> None:
        """Resume messages owned by this stable consumer after a worker restart."""
        if self._redis is None:
            raise RuntimeError("QueueConsumer.start() must be called before recovery")

        while self._running:
            results = await self._redis.xreadgroup(
                self.group,
                self.consumer,
                {self.stream_key: "0"},
                count=1,
            )
            messages = [
                (msg_id, fields)
                for _stream, stream_messages in results or []
                for msg_id, fields in stream_messages
            ]
            if not messages:
                return

            msg_id, fields = messages[0]
            pending = await self._redis.xpending_range(
                self.stream_key,
                self.group,
                min=msg_id,
                max=msg_id,
                count=1,
                consumername=self.consumer,
            )
            deliveries = int(pending[0].get("times_delivered", 1)) if pending else 1
            if deliveries > MAX_DELIVERIES:
                logger.error(
                    "Pending job exhausted retries",
                    queue=self.queue_name,
                    msg_id=msg_id,
                    deliveries=deliveries,
                )
                await self._ack(msg_id)
                continue

            logger.warning(
                "Recovering pending job",
                queue=self.queue_name,
                msg_id=msg_id,
                attempt=deliveries,
            )
            if not await self._handle(msg_id, fields):
                return

    async def _handle(self, msg_id: str, fields: dict[str, str]) -> bool:
        try:
            message = decode_stream_message(fields)
        except (TypeError, ValueError) as exc:
            logger.error("Malformed stream message", msg_id=msg_id, error=str(exc))
            await self._ack(msg_id)
            return True

        registered = self._handlers.get(message.job_name)
        if not registered:
            logger.warning("No handler", job=message.job_name)
            await self._ack(msg_id)
            return True

        payload: object = message.payload
        if registered.payload_model is not None:
            try:
                payload = registered.payload_model.model_validate(message.payload)
            except ValidationError as exc:
                logger.error("Invalid job payload", job=message.job_name, errors=exc.errors())
                await self._ack(msg_id)
                return True

        try:
            logger.info("Job start", job=message.job_name, msg_id=msg_id)
            await registered.handler(message.job_name, payload)
            await self._ack(msg_id)
            logger.info("Job done", job=message.job_name, msg_id=msg_id)
        except Exception as e:
            logger.error("Job failed", job=message.job_name, error=str(e))
            # Leave the message pending for retry/recovery.
            return False
        else:
            return True

    async def _ack(self, msg_id: str) -> None:
        if self._redis is None:
            raise RuntimeError("QueueConsumer.start() must be called before acknowledging messages")
        await self._redis.xack(self.stream_key, self.group, msg_id)

    async def stop(self) -> None:
        self._running = False
        if self._redis:
            await self._redis.aclose()


async def publish_progress(generation_id: str, phase: str, progress: float, message: str) -> None:
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        payload = json.dumps(
            {
                "phase": phase,
                "progress": progress,
                "message": message,
                "ts": datetime.now(UTC).isoformat(),
            }
        )
        await redis.set(f"job:{generation_id}:progress", payload, ex=7 * 24 * 60 * 60)
        await redis.publish(f"job:{generation_id}:events", payload)
    finally:
        await redis.aclose()


async def publish_ingest_status(
    profile_id: str, version: int, status: str, message: str = ""
) -> None:
    """Persist ingest status so the web `ingest-status` endpoint can poll it
    (W-15). Ingest has no generation id, so a completed sample row appearing in
    the DB is the success signal; this key makes RUNNING/FAILED explicit so the
    app never waits forever on a failed enrollment. 24h TTL."""
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        payload = json.dumps({"status": status, "message": message})
        await redis.set(f"ingest:{profile_id}:{version}", payload, ex=86400)
    finally:
        await redis.aclose()
