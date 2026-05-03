# Retrospectives — YouNet Voice Studio

## Phase 1 Retro — 2026-04-19

**Scope:** Auth, voice enrollment, single-speaker generation, admin CP, CI.

### What went well
- End-to-end flow from invite → enroll → generate works in one pass.
- Prisma schema proved stable — no breaking migrations needed during Phase 1.
- Redis Streams queue is simple and observable; no dead-letter surprises.
- Auth.js v5 credentials provider with forced-password-change is clean to extend.
- Tailwind v4 CSS variable tokens make theming fast.

### What was harder than expected
- `next-intl` v3 requires the plugin wrapper in `next.config.ts` — easy to miss, breaks build.
- `@prisma/client` types aren't available until `prisma generate` runs; CI needed explicit generate step.
- TTS package (`coqui-tts`) requires Python < 3.12 — system Python was 3.13. Resolved by making all ML imports lazy and running unit tests in a lightweight venv.
- TypeScript `typedRoutes: true` experimental flag broke compilation; removed.

### Action items for Phase 2
- Add `python-version` pinning (`.python-version` file) to worker to avoid version drift. ✓ Done.
- Separate CI worker tests into lightweight (no ML) and heavy (GPU) stages. ✓ Done.
- Document `.env.local` setup in README so first-time contributors don't hit missing-env build failures.

---

## Phase 2 Retro — 2026-04-19

**Scope:** Podcast pipeline, ElevenLabs/Gemini TTS, ASR+diarization, re-voice UI.

### What went well
- Timed-script format `[MM:SS A] text` is simple and robust; parser handles edge cases well.
- ID3 chapter markers via mutagen work seamlessly with the stitch module.
- Provider registry pattern makes adding new TTS backends a one-file change.
- Pacing-lock Gemini integration is opt-in and doesn't affect non-podcast renders.

### What was harder than expected
- `pyannote` speaker diarization requires HuggingFace token — added to `.env.example` with instructions.
- ElevenLabs voice cloning API rate limits require retry logic (exponential back-off added).
- Re-voice timeline editor UI state is complex; simplified to text-based timed script editor.

### Action items for Phase 3
- Add ClamAV scanning to prevent malicious audio uploads. ✓ Done (P3-07).
- Rate-limit render endpoints to prevent quota abuse. ✓ Done (P3-08).
- Verify i18n catalog parity with a CI script. ✓ Done (P3-11).

---

## Phase 3 Retro — 2026-04-19

**Scope:** Polish, hardening, Gemini draft, ClamAV, watermark, monitoring, i18n.

### What went well
- Gemini script drafting landed cleanly in the existing tRPC mutation pattern.
- ClamAV INSTREAM TCP scan is lightweight and fails open in dev (no blocking).
- Prometheus `/api/metrics` + Grafana provisioning is zero-config via docker-compose.
- i18n parity script found zero gaps — 168 keys in sync across en/vi.

### What was harder than expected
- `@sentry/nextjs` is an optional runtime dep; needed a lazy-require wrapper to avoid type errors when package isn't installed.
- `@axe-core/playwright` has no bundled types in some environments — dynamic import with try/catch was the safest pattern.
- ClamAV docker image takes ~90 s to fully start (DB update) — `start_period: 90s` in healthcheck is important.

### Action items for Phase 4
- Implement public share links (P4-03) — strongly requested by comms team.
- REST API + API keys (P4-05) — needed for integration with other YouNet tools.
- GPU worker deployment guide (P4-01) — required before production XTTS use.
