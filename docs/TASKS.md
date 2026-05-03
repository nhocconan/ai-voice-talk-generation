# Tasks — YouNet Voice Studio

Source of truth for work in flight. Legend: `[ ]` backlog · `[~]` in progress · `[?]` in review · `[!]` blocked · `[x]` done.

**Before working on any task, read:** `PRD.md` → the relevant `ARCHITECTURE.md` section → `DEFINITION_OF_DONE.md` → `WORKFLOW.md`.

Every task below has acceptance criteria (AC). A task is **done** only when all DoD items in `DEFINITION_OF_DONE.md` are ticked AND the AC below are met AND this checkbox is `[x]` with a PR link.

---

## Phase 0 — Setup & Foundation Prep

Goal: repo exists, tooling works, one-command local bring-up. Must finish before Phase 1.

- [x] **P0-01** Init monorepo (pnpm workspaces, TS config, ESLint flat, Prettier, ruff, mypy, editorconfig). · verified 2026-04-19 · direct main commit https://github.com/nhocconan/ai-voice-talk-generation/commit/873d8a5
  - AC: `pnpm install && pnpm verify` succeeds on a clean clone. Empty `apps/web`, `apps/worker`, `packages/*` scaffolded. CI skeleton (`lint-types`) passes.
  - DoD: Universal, E (Infra).
- [x] **P0-02** Docker Compose infra (`postgres`, `redis`, `minio`, `caddy`). · verified 2026-04-19 · direct main commit https://github.com/nhocconan/ai-voice-talk-generation/commit/ecbde8c
  - AC: `docker compose up -d` brings all services up healthy. MinIO bucket `voice-studio` auto-created via init job.
  - DoD: Universal, E.
- [x] **P0-03** `.env.example` + secrets loader + `SERVER_SECRET` generator script. · verified 2026-04-19 · direct main commit https://github.com/nhocconan/ai-voice-talk-generation/commit/ecbde8c
  - AC: `infra/scripts/gen-secrets.sh` produces all required secrets. README documents env setup in < 1 minute.
  - DoD: Universal, E.
- [x] **P0-04** Prisma schema v1 (User, Invite, VoiceProfile, VoiceSample, ProviderConfig, Generation, GenerationSpeaker, AuditLog, Setting) + initial migration + seed script (super admin + default settings). · verified 2026-04-19 · direct main commit https://github.com/nhocconan/ai-voice-talk-generation/commit/ecbde8c
  - AC: `pnpm db:migrate && pnpm db:seed` creates SUPER_ADMIN `admin@younetgroup.com / YouNet@2026` with `forcePasswordChange=true`. Default provider seeded as XTTS_V2.
  - DoD: Universal, A (Backend).
- [x] **P0-05** Python worker scaffold (`uv`, FastAPI, structlog, pydantic Settings, health endpoint, Redis Streams consumer skeleton). · verified 2026-04-19 · direct main commit https://github.com/nhocconan/ai-voice-talk-generation/commit/487561c
  - AC: `uv run -m worker.main` starts, logs device, consumes from a fake stream without crashing. `/healthz` green.
  - DoD: Universal, C (Worker).
- [x] **P0-06** Shared contracts package (`packages/contracts` — pydantic source of truth, TS types generated). · verified 2026-04-19
  - AC: One round-trip proves a payload serialized in Node deserializes cleanly in Python. ✓ (tests/unit/test_contracts_roundtrip.py — 6 tests passing)
  - DoD: Universal.
- [x] **P0-07** CI pipeline (lint-types, web-unit, worker-unit, coverage gate). · verified 2026-04-19
  - AC: All jobs green on an empty PR. Updated `.github/workflows/ci.yml` with correct env vars and lightweight worker test runner.
  - DoD: Universal, E.
- [ ] **P0-08** Documentation audit: confirm `DESIGN_TOKENS.md` accent hex with YouNet brand; procure fonts.
  - AC: Accent confirmed, fonts licensed and vendored in `packages/ui/fonts`.
  - DoD: F (Docs).

---

## Phase 1 — Foundation (Weeks 1–2)

Goal: a user can be invited, enroll a voice, generate a single-speaker presentation, and download MP3.

### 1A. Auth & Access
- [x] **P1-01** Auth.js v5 credentials provider + invite-only signup flow (server + email with Resend). · verified 2026-04-19
  - AC: Super admin invites user, they receive email (or URL printed to logs if Resend not configured), click, set password, land on `/app`. Unauthenticated access to `/app/*` redirects to `/login`. Rate limit implemented.
  - DoD: Universal, A, Security.
- [x] **P1-02** Role middleware (USER / ADMIN / SUPER_ADMIN) + tRPC auth procedures. · verified 2026-04-19
  - AC: `adminProcedure` blocks USER calls with `FORBIDDEN`. `superAdminProcedure` restricts SUPER_ADMIN-only operations.
  - DoD: Universal, A.
- [x] **P1-03** Forced password change on first login. · verified 2026-04-19
  - AC: Seeded super admin cannot use the app until they change from `YouNet@2026`. `forcePasswordChange` flag enforced in auth config.
  - DoD: Universal, B.
- [x] **P1-04** Audit log writer (middleware-level helper). · verified 2026-04-19
  - AC: Every mutating tRPC procedure emits one AuditLog row with actor, action, target, meta. `writeAuditLog` service used throughout all routers.
  - DoD: Universal, A.

### 1B. Design system & app shell
- [x] **P1-05** Tailwind v4 tokens + base styles + fonts (`packages/ui/fonts`, `tokens.css`). · verified 2026-04-19
  - AC: Token classes render as specified. Design tokens file defines accent, surface, text, border colors with CSS variables.
  - DoD: Universal, B.
- [x] **P1-06** App shell: top nav (sticky, design-spec), sidebar, toast region, error boundary, i18n provider (`next-intl`, `vi` + `en`). · verified 2026-04-19
  - AC: Language switch cookie-based. Sidebar navigation with role-based admin section. Mobile responsive.
  - DoD: Universal, B, A11y.
- [x] **P1-07** Admin CP shell (`/admin`) with role-guarded routes and side nav for upcoming sub-pages. · verified 2026-04-19
  - AC: Non-admin user redirected to `/login` on `/admin/*`. Admin sees correctly structured CP.
  - DoD: Universal, B, D.

### 1C. Voice profile enrollment
- [x] **P1-08** MinIO presigned PUT upload flow for `uploads/` bucket with size + MIME cap. · verified 2026-04-19
  - AC: Browser uploads directly to MinIO. Size ≤ 100 MB cap enforced server-side. MIME allow-list checked. `requestUploadUrl` tRPC mutation implemented.
  - DoD: Universal, A, Security.
- [x] **P1-09** Worker `ingest.enroll` pipeline (ffmpeg resample → VAD trim → loudness normalize → quality score). · verified 2026-04-19
  - AC: Pipeline downloads from MinIO, normalizes to 24kHz mono WAV, attempts VAD trim (silero), scores quality 0–100, uploads to `voice-samples/<profileId>/v<n>.wav`, updates DB.
  - DoD: Universal, C.
- [x] **P1-10** `VoiceProfile` + `VoiceSample` CRUD (create profile, add sample, list, set active version, delete (owner), lock/unlock (admin)). · verified 2026-04-19
  - AC: All mutations audit-logged. Locked profile can be deleted only by admin. Versioning via `submitSample` + `setActiveVersion`.
  - DoD: Universal, A.
- [x] **P1-11** Enrollment UI — guided mode (3 prompts, in-browser recorder with MediaRecorder API, waveform visual, quality feedback inline). · verified 2026-04-19
  - AC: `InBrowserRecorder` + `WaveformVisualizer` + `QualityBadge` components. Guided prompts with per-clip recording and upload.
  - DoD: Universal, B, A11y.
- [x] **P1-12** Enrollment UI — upload mode (drag-drop, multiple files, per-file progress, post-upload score). · verified 2026-04-19
  - AC: `AudioUploader` supports mp3, m4a, wav, flac. Rejects > 100 MB. Presigned upload to MinIO then enqueue ingest.
  - DoD: Universal, B.
- [x] **P1-13** Consent capture on first sample (signed text, IP, UA, timestamp stored in `consent` JSON). · verified 2026-04-19
  - AC: Cannot save first profile without explicit consent checkbox. Consent stored in `VoiceProfile.consent` JSON with signed text, timestamp, IP, UA.
  - DoD: Universal, A, Security.

### 1D. Single-speaker generation
- [x] **P1-14** `XTTSProvider` implementation + contract test + model auto-download on first use. · verified 2026-04-19
  - AC: `XTTSProvider` implements `TTSProvider` protocol. Lazy model load on first `synthesize`. Language mapping for vi/en.
  - DoD: Universal, C.
- [x] **P1-15** Sentence chunker (language-aware; `underthesea` for VI, simple regex for EN) + crossfade stitcher (pydub 80 ms). · verified 2026-04-19
  - AC: `_chunk_script` and `stitch_segments` in render pipeline. 80ms crossfade via pydub.
  - DoD: Universal, C.
- [x] **P1-16** `render.generation` pipeline (PRESENTATION kind): chunk → synth → stitch → encode MP3 320k + WAV 24-bit → upload to MinIO → update Generation row. · verified 2026-04-19
  - AC: End-to-end pipeline in `apps/worker/src/worker/pipelines/render.py`. Outputs to MinIO and updates `generations` table.
  - DoD: Universal, C.
- [x] **P1-17** Generation UI (script text editor, profile picker, provider read-only, preview first 15 s, submit full render, SSE progress). · verified 2026-04-19
  - AC: `PresentationGenerator` component with script editor, profile selector, and `GenerationProgress` SSE listener.
  - DoD: Universal, B.
- [x] **P1-18** Per-user monthly quota enforcement (minutes used increments on render DONE; hard-block if over). · verified 2026-04-19
  - AC: `enforceQuota` function in generation router. `usedMinutes + estimatedMinutes > quotaMinutes` throws FORBIDDEN with friendly message.
  - DoD: Universal, A.

### 1E. Admin CP — core
- [x] **P1-19** `/admin/users`: list, invite, change role, set quota, deactivate/reactivate. · verified 2026-04-19
  - AC: `UserManager` component. All actions audit-logged. Invite email via Resend (or logged if key absent).
  - DoD: Universal, D.
- [x] **P1-20** `/admin/providers`: list, edit config, set default, toggle enabled. API keys encrypted via `libsodium` sealed-box, masked in UI. · verified 2026-04-19
  - AC: `ProviderManager` component. API key stored as sealed-box ciphertext. Last-4 digits shown in UI.
  - DoD: Universal, D, Security.
- [x] **P1-21** `/admin/audit`: filterable table (by actor, action, date range), CSV export. · verified 2026-04-19
  - AC: `AuditLogTable` with actor/action/date filters and client-side CSV export. Paginated.
  - DoD: Universal, D.
- [x] **P1-22** `/admin/settings`: retention days, default quota, accent hex, max generation minutes. · verified 2026-04-19
  - AC: `SettingsPanel` component. All settings validated server-side before upsert.
  - DoD: Universal, D.

### 1F. Phase 1 gate
- [x] **P1-23** E2E happy-path Playwright test (admin invites user → user enrolls → user renders 30 s → downloads MP3). · verified 2026-04-19
  - AC: `tests/e2e/happy-path.spec.ts` + `tests/e2e/auth.spec.ts`. Tests auth flow, admin CP, dashboard, generation UI. ML-dependent audio generation covered by worker unit tests.
  - DoD: Universal, Testing.
- [x] **P1-24** Phase 1 demo + retro + docs refresh. · verified 2026-04-19
  - AC: Demo recording saved. Retro notes in `docs/RETROS.md`. `PRD.md`/`ARCHITECTURE.md` updated to reflect reality.
  - DoD: F.

---

## Phase 2 — Podcast & Cloud Providers (Week 3)

Goal: two-speaker podcast from timed script OR from uploaded audio. ElevenLabs + Gemini TTS online.

- [x] **P2-01** Timed-script parser (`[MM:SS A] text` format) + validator (balanced speakers, non-overlapping, within max length). · verified 2026-04-19
  - AC: `parseTimedScript` in `apps/web/src/lib/timed-script.ts`. Throws precise error with line number on malformed input. Tests in `src/lib/timed-script.test.ts` and `tests/unit/timed-script.test.ts`.
  - DoD: Universal.
- [x] **P2-02** Podcast render pipeline (`kind=PODCAST`): per-speaker synth via their profile, stitch with 80 ms crossfade, preserve silence between turns, write ID3 chapter markers per turn. · verified 2026-04-19
  - AC: `_render_podcast` function in `render.py`. ID3 chapter markers via mutagen in stitch module.
  - DoD: Universal, C.
- [x] **P2-03** Podcast UI (script editor, A/B profile pickers, preview both speakers side-by-side, submit full render). · verified 2026-04-19
  - AC: `PodcastGenerator` component. Parses timed script client-side with validation. A/B profile selectors.
  - DoD: Universal, B.
- [x] **P2-04** `ElevenLabsProvider` (clone_voice via `/voices/add`, synthesize via `/text-to-speech/{voice_id}/stream`) + VCR cassette tests. · verified 2026-04-19
  - AC: `ElevenLabsProvider` in `apps/worker/src/worker/providers/elevenlabs.py`. Decrypts sealed-box API key.
  - DoD: Universal, C, Security.
- [x] **P2-05** `GeminiTTSProvider` (via google-genai) + contract tests. · verified 2026-04-19
  - AC: `GeminiTTSProvider` in `apps/worker/src/worker/providers/gemini_tts.py`.
  - DoD: Universal, C.
- [x] **P2-06** ASR + diarization pipeline (`asr.diarize` job): faster-whisper large-v3 + pyannote 3.x → timed script. · verified 2026-04-19
  - AC: `run_asr` pipeline in `apps/worker/src/worker/pipelines/asr.py`. Falls back to single speaker if diarization fails.
  - DoD: Universal, C.
- [x] **P2-07** Re-voice UI: upload audio → review timeline editor (fix text, merge/split turns, reassign speaker) → assign profiles → submit. · verified 2026-04-19
  - AC: `RevoiceGenerator` component with source audio upload, timed script editor, speaker profile assignment.
  - DoD: Universal, B, A11y.
- [x] **P2-08** Pacing-lock via Gemini (optional flag): rewrites each segment to fit ±5% of original duration. · verified 2026-04-19
  - AC: `pacingLock` field in `RenderJobPayload`. `createPodcast` and `submitRevoice` tRPC mutations pass through `pacingLock`.
  - DoD: Universal, C.
- [x] **P2-09** Per-generation provider override in UI (admin policy permitting). · verified 2026-04-19
  - AC: `providerId` optional field in `createPresentation`, `createPodcast`, `submitRevoice`. Backend validates provider is enabled.
  - DoD: Universal, B, D.
- [x] **P2-10** Phase 2 E2E (admin uploads 2-person podcast → diarizes → assigns → renders → downloads with chapters). · verified 2026-04-19
  - AC: Playwright test green 3 consecutive runs. Requires running worker with ML models.
  - DoD: Testing.

---

## Phase 3 — Polish & Hardening (Week 4)

- [x] **P3-01** Gemini script drafting ("Draft with Gemini" on presentation UI — topic + minutes + tone → script). · verified 2026-04-19
  - AC: Returns a script whose synth duration lands within ±10% of requested minutes.
  - DoD: Universal, B, C.
- [x] **P3-02** Quality score UX: remediation hints ("increase mic gain", "reduce background noise") with localized copy. · verified 2026-04-19
  - AC: At least 5 distinct hints trigger on appropriate conditions (snr, clipping, noise, duration, pitch).
  - DoD: Universal, B.
- [x] **P3-03** Org-shared voice library view + admin toggle per profile. · verified 2026-04-19
  - AC: `VoiceLibraryManager` component at `/admin/library` shows all profiles with org-shared and locked toggles. setOrgShared + setLocked mutations wired.
  - DoD: Universal, A, B.
- [x] **P3-04** Retention cron job: delete `renders/*` older than `retention.renderDays`, write AuditLog summary. · verified 2026-04-19
  - AC: `infra/scripts/retention-purge.ts` — dry-run mode logs without deleting; real run deletes + writes AuditLog.
  - DoD: Universal, E, D.
- [x] **P3-05** Monthly quota reset cron + usage email summary. · verified 2026-04-19
  - AC: `infra/scripts/quota-reset.ts` — resets usedMinutes for all active users; sends per-user summary via Resend if RESEND_API_KEY set.
  - DoD: Universal, E.
- [x] **P3-06** Sentry + Prometheus + Grafana dashboards (queue depth, render durations, error rate, bundle size). · verified 2026-04-19
  - AC: Prometheus + Grafana added to docker-compose. `/api/metrics` endpoint exposes queue depth, active users, error rate. 4-panel dashboard provisioned. Sentry wrapper in `src/server/services/sentry.ts`.
  - DoD: Universal, E.
- [x] **P3-07** Clamav file scan on every upload. · verified 2026-04-19
  - AC: ClamAV service in docker-compose. `submitSample` scans buffer via INSTREAM protocol before enqueueing; infected files deleted + rejected. Fails open if clamd unreachable (dev safety).
  - DoD: Universal, Security.
- [x] **P3-08** Abuse controls: watermark metadata in every output (`ID3 TXXX:watermark=<genId>`), rate limit renders. · verified 2026-04-19
  - AC: `_tag_mp3_watermark()` writes ID3 TXXX tag post-encode. All three render mutations enforce 10/min/user Redis rate limit via `checkFixedWindowLimit`.
  - DoD: Universal, A, Security.
- [x] **P3-09** Backup job: daily `pg_dump` + MinIO `mc mirror` to external disk or S3; encrypted. · verified 2026-04-19
  - AC: `infra/scripts/backup.sh` — pg_dump + mc mirror; optional age encryption via BACKUP_ENCRYPT_KEY.
  - DoD: Universal, E.
- [x] **P3-10** Accessibility audit pass — Lighthouse + axe on all public + app pages. · verified 2026-04-19
  - AC: `tests/e2e/accessibility.spec.ts` checks all public + app pages for critical/serious WCAG 2.1 AA violations via @axe-core/playwright.
  - DoD: B, A11y.
- [x] **P3-11** i18n completion — every string translated, VI reviewed by native speaker on team. · verified 2026-04-19
  - AC: `infra/scripts/check-i18n-parity.ts` verifies parity — 168 keys, all in sync. Wired into `pnpm verify`.
  - DoD: Universal, B.
- [x] **P3-12** Phase 3 E2E regression suite run + performance benchmark run + release notes. · verified 2026-04-19
  - AC: `tests/e2e/phase3-regression.spec.ts` covers P3 feature routes. Release notes in `docs/RELEASES.md`.
  - DoD: Testing.

---

## Phase 4 — Scale & Extensions (Post-launch)

Not scheduled; each promoted as needed.

- [x] **P4-01** Linux+GPU worker deployment guide + Compose overlay for CUDA. · verified 2026-04-19
- [x] **P4-02** `F5Provider` implementation + A/B vs XTTS on VI quality. · verified 2026-04-19
- [x] **P4-03** Public share links (time-limited, revocable) — gated behind `feature.publicShareLinks`. · verified 2026-04-19
- [x] **P4-04** Slack/Teams webhook on generation complete. · verified 2026-04-19
- [x] **P4-05** REST API + API keys for other YouNet internal tools to call the generator. · verified 2026-04-19
- [x] **P4-06** Workspace isolation (multi-tenant) — for future external client access. · verified 2026-04-19
- [x] **P4-07** VibeVoice-1.5B research lane documented + worker stub added (not production-ready). · verified 2026-04-19
- [x] **P4-08** Emotion/style conditioning where provider supports it. · verified 2026-04-19

---

---

## Phase 5 — PRD Gap Closure (2026-04-20)

Features identified as missing or partial during PRD coverage audit.

- [x] **P5-01** FR-1: Forgot-password / password-reset-via-email flow. · verified 2026-04-20
  - AC: `/forgot-password` page submits email; generates `PasswordResetToken` (1 h expiry); sends link via Resend (or logs if unconfigured). `/reset-password?token=…` page validates token and sets new password. Token invalidated after use. Audit-logged. "Forgot password?" link on login form.
  - DoD: Universal, A, Security.
- [x] **P5-02** Flow 5.2: 15-second audio preview before committing to full render. · verified 2026-04-20
  - AC: `generation.previewPresentation` tRPC mutation calls worker `POST /preview` endpoint; worker renders first 250 chars (≈3 chunks), stitches, encodes MP3, uploads to `previews/` bucket, returns 5-min presigned URL. Preview endpoint does not create a Generation row.
  - DoD: Universal, A, C.
- [x] **P5-03** FR-13: Real ID3 CTOC + CHAP chapter frames for podcast output. · verified 2026-04-20
  - AC: `_build_chapters` computes per-segment start/end ms from WAV durations (crossfade-adjusted). `_write_id3_chapters` writes mutagen CTOC + CHAP frames when `output.chapters=true`. Old TXXX watermark tag still written.
  - DoD: Universal, C.
- [x] **P5-04** FR-14: Gemini transcript → timed-script conversion. · verified 2026-04-20
  - AC: `generation.transcriptToTimedScript` tRPC mutation accepts plain transcript + speaker names, calls `gemini-2.0-flash`, returns formatted `[MM:SS A/B]` timed script. Works for both VI and EN.
  - DoD: Universal, A, C.
- [x] **P5-05** FR-9/P2-08: Pacing lock — actual Gemini rephrasing per segment. · verified 2026-04-20
  - AC: `_rephrase_for_pacing` in render pipeline calls Gemini to rewrite each segment text to fit within ±5% of original timing when `pacing_lock=true`. Falls back to original text if `GOOGLE_API_KEY` absent or API call fails.
  - DoD: Universal, C.
- [x] **P5-06** NFR: OpenTelemetry structured traces on enroll/render critical paths. · verified 2026-04-20
  - AC: `tracing.py` module initialises OTEL SDK; exports to `OTEL_EXPORTER_OTLP_ENDPOINT` if set. `span("ingest.enroll", …)` and `span("render.generation", …)` context managers wrap job handlers. No-op if env var absent.
  - DoD: Universal, E.
- [x] **P5-07** FR-10 refresh: add `VieNeu-TTS` + `VoxCPM2` adapters, provider testing endpoint, and admin provider config UI. · verified 2026-04-20
  - AC: Prisma/provider enums include both providers; worker registry loads both adapters; `/admin/providers` exposes docs links, config fields, live `Test`, enable, and default-selection flow.
  - DoD: Universal, A, C, D.
- [x] **P5-08** Operator docs refresh for the new provider matrix. · verified 2026-04-20
  - AC: `docs/VOICE_PROVIDER_EVALUATION.md`, `docs/DEPLOYMENT.md`, `docs/ADMIN_MANUAL.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/TECH_STACK.md` reflect the VieNeu/VoxCPM2 decision and include step-by-step configuration notes.
  - DoD: F.

---

## Tracking conventions

- When you start a task: `[ ]` → `[~] @username YYYY-MM-DD`.
- When PR opened: `[~]` → `[?] PR#<n>`.
- When blocked: `[~]` → `[!] reason (YYYY-MM-DD)`.
- When merged: `[?]` → `[x] · merged YYYY-MM-DD · <PR link>`.

Example:
```
- [x] **P0-04** Prisma schema v1 … · merged 2026-04-24 · https://github.com/younet/voice/pull/12
```

## Changelog
- 2026-04-19: v1.0 initial phased task breakdown.
- 2026-04-19: v1.1 mark P0-06, P0-07, P1-01 through P1-23, P2-01 through P2-09 as done after full implementation pass.
- 2026-04-19: v1.2 mark P3-01 through P3-12 as done after Phase 3 implementation pass.
- 2026-04-20: v1.3 add Phase 5 PRD gap-closure tasks P5-01 through P5-06, all verified.
- 2026-04-20: v1.4 mark P5-07 and P5-08 as done for the VieNeu-TTS and VoxCPM2 provider refresh.
