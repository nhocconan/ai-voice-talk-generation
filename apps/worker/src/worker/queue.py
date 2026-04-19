"""BullMQ-compatible Redis queue consumer using bullmq-python (or custom XREAD)."""
from __future__ import annotations

import asyncio
import json
from typing import Any, Callable, Awaitable

import redis.asyncio as aioredis

from .config import settings
from .logging import get_logger

logger = get_logger("queue")

JobHandler = Callable[[str, dict[str, Any]], Awaitable[None]]


class QueueConsumer:
    """Minimal BullMQ-compatible consumer over Redis Streams (XREADGROUP)."""

    def __init__(self, queue_name: str, group: str, consumer: str) -> None:
        self.queue_name = queue_name
        self.group = group
        self.consumer = consumer
        self.stream_key = f"bull:{queue_name}:events"
        self._redis: aioredis.Redis | None = None
        self._handlers: dict[str, JobHandler] = {}
        self._running = False

    def register(self, job_name: str, handler: JobHandler) -> None:
        self._handlers[job_name] = handler

    async def start(self) -> None:
        self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        # Ensure consumer group exists
        try:
            await self._redis.xgroup_create(self.stream_key, self.group, id="0", mkstream=True)
        except Exception:
            pass  # group already exists
        self._running = True
        logger.info("Queue consumer started", queue=self.queue_name)

    async def run(self) -> None:
        while self._running:
            try:
                results = await self._redis.xreadgroup(  # type: ignore[union-attr]
                    self.group, self.consumer,
                    {self.stream_key: ">"},
                    count=1, block=5000,
                )
                for _stream, messages in (results or []):
                    for msg_id, fields in messages:
                        await self._handle(msg_id, fields)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Consumer error", error=str(e))
                await asyncio.sleep(1)

    async def _handle(self, msg_id: str, fields: dict[str, str]) -> None:
        job_name = fields.get("name", "")
        try:
            data = json.loads(fields.get("data", "{}"))
        except json.JSONDecodeError:
            data = {}

        handler = self._handlers.get(job_name)
        if not handler:
            logger.warning("No handler", job=job_name)
            await self._redis.xack(self.stream_key, self.group, msg_id)  # type: ignore[union-attr]
            return

        try:
            logger.info("Job start", job=job_name, msg_id=msg_id)
            await handler(job_name, data)
            await self._redis.xack(self.stream_key, self.group, msg_id)  # type: ignore[union-attr]
            logger.info("Job done", job=job_name, msg_id=msg_id)
        except Exception as e:
            logger.error("Job failed", job=job_name, error=str(e))
            # Don't ack — let BullMQ retry logic handle it

    async def stop(self) -> None:
        self._running = False
        if self._redis:
            await self._redis.aclose()


async def publish_progress(
    generation_id: str, phase: str, progress: float, message: str
) -> None:
    import json
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        payload = json.dumps({"phase": phase, "progress": progress, "message": message, "ts": asyncio.get_event_loop().time()})
        await redis.publish(f"job:{generation_id}:events", payload)
    finally:
        await redis.aclose()
