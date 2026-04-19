# Tech Stack — YouNet Voice Studio

Pinned versions are intentional — see `CODING_GUIDELINES.md` for upgrade policy.

## Repo Layout (Monorepo — pnpm workspaces)

```
/
├── apps/
│   ├── web/              # Next.js 15, TS, tRPC, Auth.js v5
│   └── worker/           # Python 3.11, FastAPI, inference
├── packages/
│   ├── contracts/        # Shared queue payload contracts / TS types
│   ├── ui/               # Shared React components, design tokens
│   └── config/           # ESLint, TS, Tailwind, Prettier configs
├── infra/
│   ├── docker/           # Dockerfiles, compose files
│   └── scripts/          # Seed, backup, migrate helpers
├── docs/
└── .github/workflows/
```

## Web (`apps/web`)

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | |
| Framework | Next.js | 15.x (App Router) | RSC by default; client components only when needed |
| UI | React | 19.x | |
| Language | TypeScript | 5.6+ | `strict: true`, `noUncheckedIndexedAccess: true` |
| Styling | Tailwind CSS | 4.x | CSS-first config via `@theme` |
| Component primitives | shadcn/ui + Radix UI | latest | Copy-in, own the code |
| Forms | React Hook Form + Zod | latest | Same Zod schemas used by tRPC |
| API | tRPC | 11.x | End-to-end types, no code gen |
| Auth | Auth.js | v5 | Credentials provider; invite-only |
| ORM | Prisma | 5.x | Postgres adapter, typed client |
| Queue client | Redis Streams via ioredis | 5.x | Web publishes `XADD` jobs to Redis Streams |
| Storage client | `@aws-sdk/client-s3` | 3.x | For MinIO presigned URLs |
| Validation | Zod | 3.x | Single source of truth for runtime + types |
| i18n | next-intl | 3.x | vi + en message catalogs |
| Logging | pino | 9.x | JSON structured logs |
| Testing | Vitest + Playwright | latest | Unit + E2E |
| Linting | ESLint 9 + Prettier | | Flat config |
| Package manager | pnpm | 9.x | Workspaces |

## Worker (`apps/worker`)

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Runtime | Python | 3.11 | |
| Package manager | uv | latest | `uv sync`, `uv run`; faster than pip |
| App framework | FastAPI | 0.115+ | Health, admin ops, provider probing |
| Queue consumer | Redis Streams | — | Explicit `XREADGROUP` consumers per queue |
| Data validation | pydantic | 2.x | Worker validates queue payloads at the boundary |
| Audio I/O | ffmpeg + pydub | — | ffmpeg is the workhorse; pydub for stitching |
| VAD | silero-vad | latest | Lightweight, CPU-friendly |
| Loudness | pyloudnorm | latest | BS.1770 |
| ASR | faster-whisper | latest (large-v3) | CTranslate2 backend |
| Diarization | pyannote.audio | 3.x | HF token required |
| Text processing (VI) | underthesea | latest | Vietnamese sentence tokenization |
| TTS — XTTS-v2 | coqui-tts fork (idiap) | latest | PyTorch MPS on Apple Silicon |
| TTS — F5-TTS | F5-TTS | latest | PyTorch MPS |
| TTS — ElevenLabs | httpx | — | REST, streaming response |
| TTS — Gemini TTS | google-genai | latest | REST |
| LLM (Gemini) | google-genai | latest | For scripting / pacing |
| Logging | structlog | 24.x | JSON |
| Crypto | PyNaCl | latest | sealed-box decryption of API keys |
| Testing | pytest + pytest-asyncio + hypothesis | latest | |
| Linting | ruff + mypy | latest | Strict mypy |

## Infra

| Layer | Choice | Version |
|---|---|---|
| Database | PostgreSQL | 16 |
| Cache / Queue | Redis | 7 |
| Object Store | MinIO | latest (S3-compatible) |
| Reverse proxy / TLS | Caddy | 2.x |
| Containers | Docker + Compose v2 | |
| CI | GitHub Actions | |
| Secrets | dotenv in dev, `age`-encrypted `.env.prod` | |
| Observability | Prometheus + Grafana (optional Loki) | |
| Errors | Sentry | self-hosted optional |
| Email (invites) | Resend | API |

## Rationale (Why These Choices)

### Why Next.js 15 + tRPC over a split SPA+REST?
- End-to-end types remove an entire class of API drift bugs.
- RSC + server actions keep the auth boundary clean.
- The team is small; a monolith per app keeps ops cost down.

### Why a separate Python worker?
- The entire ML ecosystem is Python. Forcing Node inference (ONNX, node-addon-api) hurts quality and dev speed.
- The queue boundary gives us a hard isolation point: web stays fast even if a render hangs.

### Why pluggable providers over committing to VibeVoice/VoxCPM now?
- Our hardware (Apple Silicon, 16 GB) can't reliably run VibeVoice-7B. XTTS-v2 and F5-TTS are the realistic local choices today.
- Vietnamese quality varies wildly between models; empirical A/B will decide the default.
- Cloud providers (ElevenLabs, Gemini TTS) are an immediate quality backstop without committing long-term.

### Why Prisma + Postgres over Drizzle / Mongo?
- Prisma's migration story is mature and approachable for a small team.
- Postgres has the JSONB we need (audit meta, generation chapters) and real referential integrity.

### Why pnpm workspaces over Nx/Turborepo?
- The monorepo is small (web + worker + shared). pnpm is enough; adding Turborepo later is trivial.

### Why MinIO over a cloud bucket?
- Data sovereignty. Vietnamese enterprise customers and leadership voice samples should not leave YouNet infra by default.
- Swap to S3 is a config change.

## Version Upgrade Policy

- **Security patches:** merge within 7 days.
- **Minor versions:** monthly review.
- **Major versions:** one per quarter max, tracked as a dedicated task with its own DoD (full test run, manual smoke, rollback plan).
- **ML models:** pin by SHA; upgrade is a benchmark task (new model must beat current on internal A/B before promotion).

## License Review

| Package | License | OK for internal commercial use? |
|---|---|---|
| XTTS-v2 (coqui-tts) | MPL 2.0 (code) + CPML (weights, non-commercial original) → use **idiap/coqui-ai-TTS** fork weights | Needs confirmation; fallback to F5-TTS |
| F5-TTS | Apache 2.0 | Yes |
| faster-whisper | MIT | Yes |
| pyannote.audio | MIT (code), weights CC-BY 4.0 | Yes with attribution |
| underthesea | GPL-3.0 | **Viral** — isolate behind an HTTP boundary in worker, do not link from proprietary code |
| ElevenLabs / Gemini | Commercial APIs | Per their terms |

Any package entering the repo must pass license review — PR reviewer checks this (see `WORKFLOW.md`).

## Environment Variables

A complete list lives in `.env.example`. Critical ones:

```
# Web
DATABASE_URL=postgres://...
REDIS_URL=redis://...
AUTH_SECRET=<32-byte random>
SERVER_SECRET=<32-byte random, for sealed-box>
MINIO_ENDPOINT=...
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=voice-studio
RESEND_API_KEY=...
NEXT_PUBLIC_APP_URL=https://...

# Worker
REDIS_URL=...
MINIO_ENDPOINT=...
SERVER_SECRET=<same as web, for API-key decryption>
HF_TOKEN=<for pyannote>
GOOGLE_API_KEY=<for Gemini, optional>
ELEVENLABS_API_KEY=<optional, normally stored encrypted in DB via admin>
TORCH_DEVICE=mps|cuda|cpu
WORKER_CONCURRENCY=1
```

## Changelog
- 2026-04-19: v1.0 initial stack.
- 2026-04-19: Updated queue transport to Redis Streams and aligned worker/web contract notes with the implementation.
