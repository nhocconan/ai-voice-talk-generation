# Architecture — Voice Studio

## 1. System Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (Next.js 15 App Router, React 19, Tailwind v4)      │
│   · Auth.js v5 session cookie  · SSE for job progress        │
└───────────────┬───────────────────────────────┬──────────────┘
                │ tRPC (typed RPC)              │ presigned PUT
                ▼                               ▼
┌──────────────────────────────────┐    ┌──────────────────────┐
│  Next.js server (Node 22)        │    │  MinIO (S3-compat)   │
│   · Route handlers / tRPC        │    │   · reference audio  │
│   · Prisma + Postgres            │    │   · outputs mp3/wav  │
│   · Redis Streams job producer   │    │   · renders/<id>/    │
│   · Auth.js (email/pw invite)    │    │     audiogram.mp4    │
│   · Admin CP                     │    │   · presigned uploads│
└─────────┬──────────────────┬─────┘    └──────────────────────┘
          │ enqueue          │ read/write
          ▼                  ▼
┌──────────────────┐   ┌────────────────────┐
│  Redis 7         │   │  Postgres 16       │
│   · Redis Streams │   │   · Prisma schema │
│   · Rate limits  │   │   · Row-level locks│
│   · SSE pub/sub  │   │   · Audit append   │
└──────────────────┘   └────────────────────┘
          │
          │ pops jobs
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Python 3.11 Worker (FastAPI admin + Redis Streams consumer) │
│  ──────────────────────────────────────────────────────────  │
│  Ingest pipeline                                             │
│   · ffmpeg resample → 24kHz mono WAV                         │
│   · VAD (Silero) → trim                                      │
│   · Loudness normalize (pyloudnorm, -16 LUFS)                │
│   · Quality scoring (SNR, pitch variance, clipping)          │
│                                                              │
│  ASR + Diarization pipeline                                  │
│   · faster-whisper large-v3 (word timestamps)                │
│   · pyannote 3.x (speaker diarization)                       │
│   · merge → timed script                                     │
│                                                              │
│  TTS providers (pluggable, one interface)                    │
│   ┌──────────────┬──────────────┬──────────────┬──────────┐  │
│   │ VieNeu-TTS   │ VoxCPM2      │ XTTS / F5    │ Cloud    │  │
│   │ (SDK, local  │ (Python API, │ (compat      │ fallback │  │
│   │  or remote)  │  future GPU) │  providers)  │          │  │
│   └──────────────┴──────────────┴──────────────┴──────────┘  │
│                                                              │
│  Render pipeline                                             │
│   · Sentence chunker (language-aware; underthesea for VI)    │
│   · Per-chunk synth → concat with 80ms crossfade (pydub)     │
│   · LUFS normalize                                           │
│   · Encode MP3 320k + WAV 24-bit                             │
│   · ID3 tags + chapter markers (for podcasts)                │
│   · Optional audiogram render (ffmpeg) → renders/<id>/       │
│     audiogram.mp4 (1:1 / 9:16 / 16:9)                        │
└──────────────────────────────────────────────────────────────┘
```

## 2. Component Responsibilities

### 2.1 Next.js server (web)
- Owns HTTP routing, authentication, authorization, session, CSRF.
- Serves UI (RSC), tRPC API (`/api/trpc/*`), webhooks (`/api/webhooks/*`).
- **Never runs ML inference.** Only enqueues jobs and reads results.
- Issues **presigned PUT URLs** for direct browser → MinIO uploads (bypasses Node body limits).
- SSE stream at `/api/jobs/:id/events` subscribes to Redis pub/sub for progress updates.

### 2.2 Python worker (inference)
- Stateless. Scales horizontally (N worker processes per host; 1 on Mac, N on Linux+GPU).
- Pulls jobs from explicit Redis Streams (`render`, `ingest`, `asr`) via a thin custom consumer.
- Reads/writes MinIO via presigned URLs issued by the server (workers do not hold root S3 creds).
- Posts progress events back via Redis pub/sub.
- Provider adapters behind a single `TTSProvider` protocol — swap via settings, not code.

### 2.3 Postgres
- Source of truth for users, profiles, generations, settings, audit log.
- Audit log is **append-only** (no update/delete trigger enforces this).
- All timestamps UTC with `TIMESTAMPTZ`.

### 2.4 Redis
- Redis Streams (`render`, `ingest`, `asr`).
- SSE pub/sub channels (`job:<id>:events`).
- Rate-limit counters (sliding window via Upstash/ratelimit algorithm).

### 2.5 MinIO
- Buckets: `voice-samples/`, `renders/`, `uploads/`, `thumbnails/`.
- Lifecycle rule: delete `renders/` objects older than `retention_days` (default 90).
- Versioning off (we control versions via VoiceSample rows).

## 3. Data Model (Prisma)

```prisma
// User & Access
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  name            String
  passwordHash    String
  role            Role      @default(USER)
  active          Boolean   @default(true)
  quotaMinutes    Int       @default(60)   // per calendar month
  usedMinutes     Int       @default(0)    // reset monthly by cron
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  profiles        VoiceProfile[]
  generations     Generation[]
  invitesCreated  Invite[]        @relation("InviteCreator")
}
enum Role { SUPER_ADMIN ADMIN USER }

model Invite {
  id          String    @id @default(cuid())
  email       String
  tokenHash   String    @unique
  role        Role      @default(USER)
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdById String
  createdBy   User      @relation("InviteCreator", fields: [createdById], references: [id])
  createdAt   DateTime  @default(now())
  @@index([email])
}

// Voice profiles & samples
model VoiceProfile {
  id              String    @id @default(cuid())
  ownerId         String
  owner           User      @relation(fields: [ownerId], references: [id])
  name            String
  lang            String                       // "vi", "en", "multi"
  isOrgShared     Boolean   @default(false)
  isLocked        Boolean   @default(false)    // only admin can delete
  activeVersion   Int       @default(1)
  consent         Json                         // { signedAt, ip, userAgent, text }
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  samples         VoiceSample[]
  @@index([ownerId])
}

model VoiceSample {
  id             String   @id @default(cuid())
  profileId      String
  profile        VoiceProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  version        Int
  storageKey     String                        // MinIO key to normalized WAV
  durationMs     Int
  sampleRate     Int
  qualityScore   Int                           // 0-100
  qualityDetail  Json                          // { snrDb, pitchStdHz, clipping, noiseFloorDb, ... }
  notes          String?
  createdAt      DateTime @default(now())
  @@unique([profileId, version])
}

// Providers
model ProviderConfig {
  id         String   @id @default(cuid())
  name       ProviderName
  apiKeyEnc  String?                          // sealed-box ciphertext (cloud only)
  enabled    Boolean  @default(true)
  isDefault  Boolean  @default(false)
  config     Json                             // { model, mode, device, apiBase, maxChunkChars, cfgValue, ... }
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
// TTS providers (the enum also carries LLM providers for the draft-script feature)
enum ProviderName { VIENEU_TTS VOXCPM2 XTTS_V2 F5_TTS ELEVENLABS GEMINI_TTS VIBEVOICE XIAOMI_TTS XAI_TTS MINIMAX_TTS KOKORO INDEXTTS2 … }

// P5-01 — Catalog of models advertised by each provider. Populated by the
// admin "Fetch latest models" action (calls each provider's list-models
// endpoint when available) or seeded from a curated default list.
model ProviderModel {
  id            String         @id @default(cuid())
  providerId    String
  provider      ProviderConfig @relation(fields: [providerId], references: [id], onDelete: Cascade)
  modelId       String                             // provider-native model identifier
  displayName   String
  kind          ModelKind      @default(TTS)
  languages     String[]       @default([])
  enabled       Boolean        @default(true)
  isDefault     Boolean        @default(false)
  meta          Json           @default("{}")
  lastSyncedAt  DateTime?
  @@unique([providerId, modelId])
  @@index([providerId, enabled])
}
enum ModelKind { TTS STT LLM }

// Generations
model Generation {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id])
  kind            GenKind
  status          GenStatus  @default(QUEUED)
  providerId      String
  provider        ProviderConfig @relation(fields: [providerId], references: [id])

  inputScript     String?                     // null when audio-source
  sourceAudioKey  String?                     // MinIO key when re-voicing audio
  sourceVideoKey  String?                     // MinIO key when re-voicing a NotebookLM-style video
  outputMp3Key    String?
  outputWavKey    String?
  outputVideoKey  String?                     // audiogram MP4 or re-voiced video output
  audiogram       Boolean   @default(false)   // produce a square waveform MP4 alongside audio
  durationMs      Int?
  chapters        Json?                       // [{ title, startMs, speaker }]
  costCents       Int?                        // billing estimate for cloud providers
  errorMessage    String?

  speakers        GenerationSpeaker[]
  createdAt       DateTime @default(now())
  startedAt       DateTime?
  finishedAt      DateTime?
  @@index([userId, createdAt])
  @@index([status])
}
enum GenKind   { PRESENTATION PODCAST REVOICE VIDEO_REVOICE AUDIOGRAM }
enum GenStatus { QUEUED RUNNING DONE FAILED CANCELLED }

model GenerationSpeaker {
  id            String   @id @default(cuid())
  generationId  String
  generation    Generation @relation(fields: [generationId], references: [id], onDelete: Cascade)
  label         String                        // "A", "B"
  profileId     String
  profile       VoiceProfile @relation(fields: [profileId], references: [id])
  segments      Json                          // [{ startMs, endMs, text }]
}

// Audit & Settings
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?
  action     String                             // "user.invite", "provider.update", ...
  targetType String
  targetId   String?
  meta       Json
  ip         String?
  createdAt  DateTime @default(now())
  @@index([actorId, createdAt])
  @@index([targetType, targetId])
}

model Setting {
  key   String @id
  value Json
}
```

### Settings keys (seeded)
```
retention.renderDays        = 90
quota.defaultMinutes        = 60
generation.maxMinutes       = 60
provider.defaultId          = <cuid of the admin-selected default provider>
branding.accentHex          = "#E5001A"        // Demo red (confirm)
feature.orgSharedLibrary    = true
feature.publicShareLinks    = false
```

## 4. Provider Abstraction

```python
# apps/worker/providers/base.py
class TTSProvider(Protocol):
    name: str
    supports_languages: list[str]
    max_chunk_chars: int

    async def prepare_voice(self, samples: list[Path]) -> VoiceRef:
        """Return a provider-specific handle (embedding file, cloud voice ID, etc.)."""

    async def synthesize(
        self, text: str, voice: VoiceRef, lang: str, speed: float = 1.0,
    ) -> AudioBytes:
        """Raw PCM or mp3 bytes at provider's native sample rate."""

    async def close(self) -> None: ...
```

Implementations now include `VieNeuProvider`, `VoxCPM2Provider`, `XTTSProvider`, `F5Provider`, `VibeVoiceProvider`, `XiaomiTTSProvider`, `XAITTSProvider`, `MiniMaxProvider`, `ElevenLabsProvider`, and `GeminiTTSProvider`. Each reads runtime settings from `provider_configs.config`, so the admin UI can change model, device, mode, or cloning options without code edits. The `/admin/providers` screen exposes provider docs links, setup steps, runtime config fields, and a live `Test` action backed by the worker `/provider-test` endpoint.

`MiniMaxProvider` (`apps/worker/src/worker/providers/minimax.py`, `MINIMAX_TTS`) clones a voice via `files/upload` (`purpose=voice_clone`) → `voice_clone` → synthesizes via `t2a_v2`. It derives a deterministic `voice_id` from a SHA-1 hash of the reference clip so repeat renders of the same profile reuse the existing clone instead of paying the clone fee again, and treats a duplicate-id error from `voice_clone` as "clone already exists." Default model is `speech-2.8-hd`; MiniMax lists the `speech-2.6-*` family as deprecated and documents 2.8 as a drop-in replacement with an identical parameter interface. Existing `provider_configs` rows keep whatever model they were seeded with — the default applies to new installs and to configs that omit `model`.

`XAITTSProvider` (`XAI_TTS`) uses a pinned provider-native Voice ID. Voice profiles store validated native IDs per provider in `providerVoiceIds` for xAI, MiniMax, and ElevenLabs. The profile editor verifies each non-empty ID against the configured provider account before saving; generation, preview, REST, and worker paths select the profile only and resolve the provider Voice ID exclusively from that profile.

**Model catalog (P5-01).** Each provider also owns rows in `provider_models`. `/admin/models` lets a super admin click *Fetch latest models* to call the provider's list-models endpoint (Gemini, ElevenLabs, xAI today) and upsert the result. Providers without a public listing endpoint seed from a curated default table — admins can still rename, mark default, enable/disable, or delete rows inline. The catalog table is consumed by provider implementations through `provider_configs.config.modelId`, so picking a different default flows through to the next render.

## 5. Job Contracts

All jobs serialize to JSON in Redis Streams; worker deserializes via pydantic model.

### 5.1 `ingest.enroll`
```json
{
  "profileId": "cuid",
  "sampleUploads": [{"storageKey": "uploads/abc.wav", "uploadedBy": "userId"}],
  "version": 2
}
```

### 5.2 `asr.diarize`
```json
{
  "generationId": "cuid",
  "sourceKey": "uploads/podcast.mp3",
  "expectedSpeakers": 2
}
```

### 5.3 `render.generation`
```json
{
  "generationId": "cuid",
  "providerId": "cuid",
  "kind": "PODCAST",
  "speakers": [
    { "label": "A", "profileId": "cuid", "segments": [ ... ] },
    { "label": "B", "profileId": "cuid", "segments": [ ... ] }
  ],
  "output": { "mp3": true, "wav": true, "chapters": true, "audiogram": false, "audiogramAspect": "1:1" },
  "pacingLock": false,
  "audiogramTitle": "Optional title for the audiogram MP4"
}
```

For `kind: "REVOICE"`, the payload also carries `sourceAudioKey`; each speaker has `keepOriginal: true` or a replacement `profileId`. The worker starts with the normalized source waveform and overwrites only replacement intervals, leaving kept speakers and audio outside those intervals intact. Revoice supports the same optional audiogram output as presentation and podcast renders.

`output.audiogramAspect` (TS: `RenderJobOutput.audiogramAspect?: "1:1" | "9:16" | "16:9"`, default `"1:1"`; worker: `RenderOutputPayload.audiogram_aspect`, pydantic alias `audiogramAspect`) selects the audiogram canvas. Web forwards it from the `createPresentation` / `createPodcast` / revoice-submit tRPC inputs into `output`. **`audiogramAspect` and `audiogramTitle` are not persisted to the `Generation` row** — they exist only in the render job payload for that one render; `Generation.audiogram` (the toggle itself) is the only one of the three that is a real Prisma column.

### 5.4 `render.video_revoice` (Mode B)
```json
{
  "generationId": "cuid",
  "providerId": "cuid",
  "sourceVideoKey": "uploads/videos/<userId>/<uuid>.mp4",
  "speakers": [
    { "label": "A", "profileId": "cuid", "segments": [ ... ] },
    { "label": "B", "profileId": "cuid", "segments": [ ... ] }
  ],
  "captions": true
}
```

The worker pipeline (`apps/worker/src/worker/pipelines/video_revoice.py`) downloads the source video, synthesizes each segment with the assigned speaker's voice, muxes the new track back into the source video via `ffmpeg` (`-c:v copy`, `-map 0:v:0 -map 1:a:0`), and optionally burns ASS subtitles. Audio side-products (MP3, WAV) are still uploaded so the user can download audio-only.

### 5.5 Audiogram (Mode A)
Triggered inline when a render job carries `output.audiogram = true`. After the audio is encoded, `apps/worker/src/worker/audio/audiogram.py` (`render_audiogram`) calls `ffmpeg` to generate a social-ready MP4 with a moving waveform overlaid on an animated dark canvas. Output is stored at `renders/{generationId}/audiogram.mp4` and written back to `Generation.outputVideoKey`.

`aspect` selects the canvas: `"1:1"` → 1080×1080, `"9:16"` → 1080×1920 (TikTok/Reels/Shorts), `"16:9"` → 1920×1080 (YouTube). An unrecognized value falls back to `"1:1"`.

**Filter graph layers** (built by `_build_filter_complex`), bottom to top:
1. **Background** — an animated ffmpeg `gradients` source (two dark stops derived from `background_hex`), 30fps. Falls back to a static `color` fill when the running ffmpeg build lacks the `gradients` filter (`_has_ffmpeg_filter("gradients")` probes `ffmpeg -filters`).
2. **Waveform** — `showwaves` in `mode=cline` at ≈H/4 tall, overlaid in the lower third (lower-middle on 9:16, keeping ≥320px clear at the bottom and ≥220px at the top for platform safe areas). Uses `draw=full`, not the ffmpeg default `draw=scale` — `draw=scale` shades each sample by amplitude, which renders the wave near-invisible against a dark background; this was a real bug found and fixed during this work.
3. **Progress bar** — a 10px-tall `color` source overlaid at the bottom edge, its `x` position driven by a `t`-based expression so it grows left→right across the full audio duration (`duration_ms`, computed once by the render pipeline and passed in rather than re-measured).
4. **Captions** — burned via a libass `ass`/`subtitles` filter chain. Word-level karaoke captions (from whisper-alignment, when `word_captions=true`) or segment/chapter captions, whichever was written to the `.ass` file.

**libass caveat.** Caption burning requires an ffmpeg build with libass (the `ass` or `subtitles` filter). The production Docker image (`infra/docker/worker.Dockerfile`, Debian ffmpeg) has it. A bare ffmpeg build without libass — e.g. the default Homebrew formula on macOS — silently skips the caption layer and logs a warning (`Captions skipped: this ffmpeg build lacks libass...`); the rest of the video (background, waveform, progress bar) still renders.

## Technical Decision — Audiogram video architecture (2026-07-09)

This is the recorded rationale for how the audiogram video is built, not a benchmarked comparison of alternatives.

**Options considered:**
- **ffmpeg filter graph, in-worker** (chosen) — compose background/waveform/progress-bar/captions as one `-filter_complex` graph and shell out to the `ffmpeg` binary the worker already depends on.
- **Remotion / headless-browser renderer** — define the video as a React component tree, render frames via a Node + Chromium pipeline.
- **Hosted rendering service (e.g. Shotstack)** — send a render spec to a third-party API and poll for the output.

**Choice:** ffmpeg filter graph, in-worker.

**Rationale:** the worker already shells out to `ffmpeg` for every other audio/video step in this codebase, so this path adds no new runtime, dependency, or service to operate. It is CPU-cheap (no GPU/Chromium render farm) and deterministic (same filter graph, same inputs, same output bytes modulo codec nondeterminism). Remotion was rejected because it would require standing up a Node + Chromium render farm for a visual result (waveform + progress bar + burned captions) that ffmpeg's native filters already produce, and the projected render volume does not justify that operational cost. A hosted service was rejected for the same reason plus the added external dependency and per-render cost.

Workers post progress events to Redis channel `job:<generationId>:events` as:
```json
{"ts": "...", "phase": "CHUNK", "progress": 0.42, "message": "Rendering 21/50"}
```

## 6. Cross-Language Queue Bridge

The queue boundary is implemented directly on **Redis Streams** with `XADD` on the web side and `XREADGROUP` in the worker. Both sides validate the same payload shape, with TypeScript contracts under `/packages/contracts` and pydantic models under `apps/worker/src/worker/job_payloads.py`.

## 7. Security

- **Auth.** Auth.js v5 credentials provider; bcrypt (cost 12) for password hash; session cookie `HttpOnly; Secure; SameSite=Lax`; 30-day rolling session; CSRF token on mutating routes.
- **Invites.** 32-byte random token; stored as SHA-256 hash; TTL 7 days; single-use.
- **API keys.** Stored as `libsodium` sealed-box ciphertext under `SERVER_SECRET` (32-byte env var); decrypted only in-memory at provider init.
- **RBAC.** tRPC middleware per role. SUPER_ADMIN > ADMIN > USER. Voice-profile access checks: owner OR org-shared OR admin.
- **Rate limits.** Auth endpoints: 5 req / 15 min / IP. Generate: 10 req / minute / user. Upload: 20 req / hour / user.
- **Abuse.** Every generation logs: userId, timestamp, profileIds used, provider, input hash. Profile lock prevents deletion.
- **Secrets in CI.** GitHub Actions OIDC → env; never commit `.env`.

## 8. Observability

- **Logs.** pino (Node) + structlog (Python), both emitting JSON to stdout. Collected by Docker → Loki (optional) or just file.
- **Metrics.** Prometheus `/metrics` on both web and worker. Key metrics: `voice_render_duration_seconds{provider,kind}`, `voice_queue_depth`, `voice_generation_total{status}`, `http_request_duration_seconds`.
- **Traces.** OpenTelemetry auto-instrumentation for Next.js route handlers and Python FastAPI. Manual spans around `TTSProvider.synthesize`.
- **Errors.** Sentry (self-hosted optional).
- **Health.** `/healthz` (liveness) and `/readyz` (DB + Redis + MinIO reachable).

## 9. Admin CP

Routes under `/admin`. SUPER_ADMIN sees all; ADMIN sees all except provider API key editing.

| Route | Function |
|---|---|
| `/admin/users` | List, invite, edit role, set quota, deactivate |
| `/admin/providers` | List, add/edit config, follow provider docs, test, enable, toggle default |
| `/admin/models` | Pull latest model catalog per provider, edit names/languages, mark default, enable/disable |
| `/admin/library` | Browse all profiles, mark shared, lock, delete |
| `/admin/generations` | Browse, replay, delete, export CSV |
| `/admin/audit` | Filterable audit log |
| `/admin/settings` | Retention days, default quota, accent color, max length |
| `/admin/system-health` | Probe infra services and provider readiness |
| `/admin/help` | Render the repository administrator manual in-app |
| `/admin/workspaces` | Workspace isolation controls for the future multi-tenant lane |

## 10. Deployment Topology

### Phase 1 (dev / internal pilot)
- Single host (Mac Mini M4 or Hetzner CPX51 — 16 vCPU / 32 GB).
- Docker Compose: `web`, `worker`, `postgres`, `redis`, `minio`, `caddy` (TLS).
- Worker concurrency = 1 on Mac (MPS is single-stream-friendly).

### Phase 4 (GPU scale)
- Web + DB + MinIO on cheap CPU host.
- Dedicated Linux+GPU host runs N workers.
- Shared Redis; MinIO publicly reachable over private network.
- TLS everywhere via Caddy or Traefik.

## 11. Local Dev

- `pnpm dev` starts web.
- `pnpm worker:dev` starts Python worker (uv + uvicorn reload).
- `docker compose up -d postgres redis minio` for infra.
- First run: `pnpm db:migrate && pnpm db:seed` — seeds SUPER_ADMIN `admin@demo.demo / Demo1234` (forced password change on first login).

## Changelog
- 2026-04-19: v1.0 initial architecture.
- 2026-04-20: Updated the provider architecture for VieNeu-TTS and VoxCPM2, and documented the live provider configuration flow in `/admin/providers`.
- 2026-07-09: Documented `MiniMaxProvider` (`MINIMAX_TTS`); audiogram social-video presets (1:1/9:16/16:9), filter-graph pipeline, and libass caveat; the `audiogramAspect` job-contract field and its non-persistence to `Generation`; and the audiogram architecture decision record. Working tree, pending commit.
