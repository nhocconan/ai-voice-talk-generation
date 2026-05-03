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
from .tracing import setup_tracing, span

setup_logging()
setup_tracing()
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


async def _fire_webhook(payload: dict) -> None:
    """P4-04: Fire Slack/Teams webhook if configured in settings table."""
    import json
    import os
    import urllib.request

    import psycopg2

    try:
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT value FROM settings WHERE key='webhook.url'")
                row = cur.fetchone()
        finally:
            conn.close()

        if not row or not row[0]:
            return

        webhook_url = row[0] if isinstance(row[0], str) else str(row[0])
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            webhook_url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)  # noqa: S310
    except Exception as exc:
        logger.warning("Webhook delivery failed", error=str(exc))


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

    await _fire_webhook({
        "event": "generation.done",
        "generationId": generation_id,
        "durationMs": duration_ms,
        "mp3Key": output_mp3_key,
    })


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

    await _fire_webhook({
        "event": "generation.failed",
        "generationId": generation_id,
        "errorMessage": error,
    })


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
    with span("ingest.enroll", {"profile_id": data.profile_id, "version": data.version}):
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

    with span("render.generation", {"generation_id": generation_id, "kind": kind}):
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


from pydantic import BaseModel as _BaseModel  # noqa: E402


class ProviderTestRequest(_BaseModel):
    provider_id: str


@app.post("/provider-test")
async def provider_test(req: ProviderTestRequest):
    from fastapi.responses import JSONResponse

    try:
        provider = await _get_provider_for_generation(req.provider_id)
        self_test = getattr(provider, "self_test", None)
        if callable(self_test):
            message = await self_test()
        else:
            message = f"{provider.name} is configured."
        return {"ok": True, "message": message}
    except Exception as exc:
        logger.error("Provider self-test failed", provider_id=req.provider_id, error=str(exc))
        return JSONResponse(status_code=500, content={"ok": False, "message": str(exc)})

# ---- Preview endpoint (FR-Flow 5.2) ----------------------------------------


class PreviewRequest(_BaseModel):
    provider_id: str
    profile_id: str
    script: str
    # How many characters to render (≈15 s at average speaking rate)
    max_chars: int = 250


@app.post("/preview")
async def preview_audio(req: PreviewRequest):
    """Render first ~15 s of a script and return presigned URL."""
    import tempfile
    import uuid
    from pathlib import Path

    from fastapi.responses import JSONResponse

    from .audio.io import encode_mp3
    from .pipelines.render import _chunk_text, _bytes_to_wav
    from .providers.base import VoiceRef
    from .services.storage import download_object, upload_object, generate_presigned_get

    try:
        provider = await _get_provider_for_generation(req.provider_id)
        speakers = await _get_speaker_sample_keys([{"label": "A", "profileId": req.profile_id, "segments": []}])
        spk = speakers[0]

        # Trim script to max_chars at sentence boundary
        trimmed = req.script[: req.max_chars]
        chunks = _chunk_text(trimmed, provider.max_chunk_chars, lang=spk.get("lang", "vi"))[:3]

        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            # Download reference sample
            voice_ref = VoiceRef("", {})
            for key in spk.get("sample_keys", []):
                dest = tmp_dir / Path(key).name
                await asyncio.to_thread(download_object, key, dest)
                voice_ref = await provider.prepare_voice([dest])
                break

            # Render chunks
            from .audio.stitch import stitch_segments
            segment_wavs = []
            for i, chunk in enumerate(chunks):
                audio_bytes = await provider.synthesize(chunk, voice_ref, spk.get("lang", "vi"))
                seg_path = tmp_dir / f"preview_seg_{i}.wav"
                _bytes_to_wav(audio_bytes, seg_path)
                segment_wavs.append(seg_path)

            stitched = tmp_dir / "preview_stitched.wav"
            stitch_segments(segment_wavs, stitched)

            mp3_path = tmp_dir / "preview.mp3"
            await encode_mp3(stitched, mp3_path)

            preview_key = f"previews/{uuid.uuid4()}.mp3"
            await asyncio.to_thread(upload_object, mp3_path, preview_key, "audio/mpeg")

        url = await asyncio.to_thread(generate_presigned_get, preview_key, 300)
        return {"url": url, "key": preview_key}

    except Exception as exc:
        logger.error("Preview failed", error=str(exc))
        return JSONResponse(status_code=500, content={"error": str(exc)})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
