"""Worker entrypoint — FastAPI health server + Redis Streams consumers."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import Counter, Histogram, start_http_server

from .config import settings
from .job_payloads import AsrJobPayload, IngestJobPayload, RenderJobPayload
from .logging import get_logger, setup_logging
from .pipelines.asr import run_asr
from .pipelines.ingest import run_ingest
from .pipelines.render import run_render
from .providers.registry import get_provider
from .queue import QueueConsumer, publish_progress

setup_logging()
logger = get_logger("main")

# Metrics
RENDERS_TOTAL = Counter("voice_render_total", "Total render jobs", ["status", "provider"])
RENDER_DURATION = Histogram(
    "voice_render_duration_seconds", "Render duration", ["provider", "kind"]
)
INGEST_TOTAL = Counter("voice_ingest_total", "Total ingest jobs", ["status"])

# ---- DB helpers (minimal psycopg for worker updates) -----------------------


async def _db_update_sample(
    *,
    profile_id: str,
    version: int,
    output_key: str,
    duration_ms: int,
    score: int,
    detail: dict,
    notes: str | None,
) -> None:
    """Update voice_samples + voice_profiles after ingest."""
    import os

    import psycopg2  # type: ignore[import]

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO voice_samples (id, "profileId", version, "storageKey", "durationMs",
                   "sampleRate", "qualityScore", "qualityDetail", notes, "createdAt")
                   VALUES (gen_random_uuid(), %s, %s, %s, %s, 24000, %s, %s, %s, now())
                   ON CONFLICT ("profileId", version) DO UPDATE
                   SET "storageKey"=EXCLUDED."storageKey", "durationMs"=EXCLUDED."durationMs",
                       "qualityScore"=EXCLUDED."qualityScore",
                       "qualityDetail"=EXCLUDED."qualityDetail"
                """,
                (
                    profile_id,
                    version,
                    output_key,
                    duration_ms,
                    score,
                    psycopg2.extras.Json(detail),
                    notes,
                ),
            )
            cur.execute(
                'UPDATE voice_profiles SET "activeVersion"=%s WHERE id=%s AND "activeVersion" < %s',
                (version, profile_id, version),
            )
        conn.commit()
    finally:
        conn.close()


async def _db_asr_result(*, generation_id: str, segments: list) -> None:
    import json
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            segs_json = json.dumps(
                [
                    {"startMs": s.start_ms, "endMs": s.end_ms, "speaker": s.speaker, "text": s.text}
                    for s in segments
                ]
            )
            cur.execute(
                """
                UPDATE generations
                SET status='DONE', "inputScript"=%s, "finishedAt"=now()
                WHERE id=%s
                """,
                (segs_json, generation_id),
            )
        conn.commit()
    finally:
        conn.close()


async def _db_render_result(
    *,
    generation_id: str,
    output_mp3_key: str | None,
    output_wav_key: str | None,
    duration_ms: int,
) -> None:
    import os

    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE generations
                SET status='DONE', "outputMp3Key"=%s, "outputWavKey"=%s,
                    "durationMs"=%s, "finishedAt"=now()
                WHERE id=%s
                """,
                (output_mp3_key, output_wav_key, duration_ms, generation_id),
            )
        conn.commit()
    finally:
        conn.close()


async def _db_render_failed(*, generation_id: str, error: str) -> None:
    import os

    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE generations
                SET status='FAILED', "errorMessage"=%s, "finishedAt"=now()
                WHERE id=%s
                """,
                (error, generation_id),
            )
        conn.commit()
    finally:
        conn.close()


async def _get_provider_for_generation(provider_id: str):
    """Fetch provider config from DB and build TTSProvider."""
    import json
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(
                'SELECT name, "apiKeyEnc", config FROM provider_configs WHERE id=%s', (provider_id,)
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        raise ValueError(f"Provider {provider_id} not found")

    return get_provider(
        row["name"],
        api_key_enc=row["apiKeyEnc"],
        config=json.loads(row["config"]) if row["config"] else {},
    )


async def _get_speaker_sample_keys(speakers: list[dict]) -> list[dict]:
    """For each speaker, fetch the active sample storage key."""
    import os

    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            result = []
            for spk in speakers:
                cur.execute(
                    """SELECT vs."storageKey", vp.lang FROM voice_samples vs
                       JOIN voice_profiles vp ON vp.id = vs."profileId"
                       WHERE vs."profileId"=%s AND vs.version = vp."activeVersion" """,
                    (spk["profileId"],),
                )
                row = cur.fetchone()
                result.append(
                    {
                        **spk,
                        "sample_keys": [row["storageKey"]] if row else [],
                        "lang": row["lang"] if row else "vi",
                    }
                )
        return result
    finally:
        conn.close()


# ---- Job handlers -----------------------------------------------------------


async def handle_ingest(job_name: str, data: object) -> None:
    if not isinstance(data, IngestJobPayload):
        raise TypeError(f"{job_name} expected IngestJobPayload")

    INGEST_TOTAL.labels(status="started").inc()
    try:
        await run_ingest(
            profile_id=data.profile_id,
            storage_key=data.storage_key,
            version=data.version,
            user_id=data.user_id,
            notes=data.notes,
            db_update_fn=_db_update_sample,
        )
        INGEST_TOTAL.labels(status="success").inc()
    except Exception as e:
        logger.error("Ingest job failed", error=str(e))
        INGEST_TOTAL.labels(status="failed").inc()
        raise


async def handle_asr(job_name: str, data: object) -> None:
    if not isinstance(data, AsrJobPayload):
        raise TypeError(f"{job_name} expected AsrJobPayload")

    await run_asr(
        generation_id=data.generation_id,
        source_key=data.source_key,
        expected_speakers=data.expected_speakers,
        result_fn=_db_asr_result,
    )


async def handle_render(job_name: str, data: object) -> None:
    if not isinstance(data, RenderJobPayload):
        raise TypeError(f"{job_name} expected RenderJobPayload")

    generation_id = data.generation_id
    provider_id = data.provider_id
    kind = data.kind

    import os
    import time

    provider_name = "unknown"
    t0 = time.monotonic()

    try:
        provider = await _get_provider_for_generation(provider_id)
        provider_name = provider.name

        # Mark running
        import psycopg2

        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE generations SET status='RUNNING', \"startedAt\"=now() WHERE id=%s",
                (generation_id,),
            )
        conn.commit()
        conn.close()

        speakers = await _get_speaker_sample_keys(
            [speaker.model_dump(by_alias=True) for speaker in data.speakers]
        )

        async def progress(gid: str, pct: float, msg: str) -> None:
            await publish_progress(gid, "CHUNK", pct, msg)

        await run_render(
            generation_id=generation_id,
            kind=kind,
            provider=provider,
            speakers=speakers,
            output=data.output.model_dump(),
            pacing_lock=data.pacing_lock,
            progress_fn=progress,
            result_fn=_db_render_result,
        )

        RENDERS_TOTAL.labels(status="success", provider=provider_name).inc()
        RENDER_DURATION.labels(provider=provider_name, kind=kind).observe(time.monotonic() - t0)
        await publish_progress(generation_id, "DONE", 1.0, "Generation complete")

    except Exception as e:
        logger.error("Render failed", generation_id=generation_id, error=str(e))
        RENDERS_TOTAL.labels(status="failed", provider=provider_name).inc()
        await _db_render_failed(generation_id=generation_id, error=str(e))
        await publish_progress(generation_id, "FAILED", 0.0, str(e))
        raise


# ---- FastAPI app + lifecycle ------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "Worker starting", device=settings.torch_device, concurrency=settings.worker_concurrency
    )
    start_http_server(settings.prometheus_port)

    consumers = [
        QueueConsumer("ingest", "workers", f"worker-ingest-{settings.torch_device}"),
        QueueConsumer("asr", "workers", f"worker-asr-{settings.torch_device}"),
        QueueConsumer("render", "workers", f"worker-render-{settings.torch_device}"),
    ]
    consumers[0].register("ingest.enroll", handle_ingest, IngestJobPayload)
    consumers[1].register("asr.diarize", handle_asr, AsrJobPayload)
    consumers[2].register("render.generation", handle_render, RenderJobPayload)

    for c in consumers:
        await c.start()

    tasks = [asyncio.create_task(c.run()) for c in consumers]
    logger.info("Worker ready")

    yield

    for t in tasks:
        t.cancel()
    for c in consumers:
        await c.stop()
    logger.info("Worker stopped")


app = FastAPI(title="YouNet Voice Worker", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "device": settings.torch_device}


@app.get("/readyz")
async def readyz():
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url)
    try:
        await r.ping()
    finally:
        await r.aclose()
    return {"status": "ready"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
