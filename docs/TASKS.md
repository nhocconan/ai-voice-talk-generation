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
- [ ] **P0-05** Python worker scaffold (`uv`, FastAPI, structlog, pydantic Settings, health endpoint, Redis Streams consumer skeleton).
  - AC: `uv run -m worker.main` starts, logs device, consumes from a fake stream without crashing. `/healthz` green.
  - DoD: Universal, C (Worker).
- [ ] **P0-06** Shared contracts package (`packages/contracts` — pydantic source of truth, TS types generated).
  - AC: One round-trip proves a payload serialized in Node deserializes cleanly in Python.
  - DoD: Universal.
- [ ] **P0-07** CI pipeline (lint-types, web-unit, worker-unit, coverage gate).
  - AC: All jobs green on an empty PR. Avg run time ≤ 6 min.
  - DoD: Universal, E.
- [ ] **P0-08** Documentation audit: confirm `DESIGN_TOKENS.md` accent hex with YouNet brand; procure fonts.
  - AC: Accent confirmed, fonts licensed and vendored in `packages/ui/fonts`.
  - DoD: F (Docs).

---

## Phase 1 — Foundation (Weeks 1–2)

Goal: a user can be invited, enroll a voice, generate a single-speaker presentation, and download MP3.

### 1A. Auth & Access
- [ ] **P1-01** Auth.js v5 credentials provider + invite-only signup flow (server + email with Resend).
  - AC: Super admin invites `test@younetgroup.com`, they receive email, click, set password, land on `/app`. Unauthenticated access to `/app/*` redirects to `/login`. Rate limit verified (5 req / 15 min / IP on `/api/auth/*`).
  - DoD: Universal, A, Security.
- [ ] **P1-02** Role middleware (USER / ADMIN / SUPER_ADMIN) + tRPC auth procedures.
  - AC: `adminProcedure` blocks USER calls with `FORBIDDEN`. Covered by integration tests.
  - DoD: Universal, A.
- [ ] **P1-03** Forced password change on first login.
  - AC: Seeded super admin cannot use the app until they change from `YouNet@2026`.
  - DoD: Universal, B.
- [ ] **P1-04** Audit log writer (middleware-level helper).
  - AC: Every mutating tRPC procedure emits one AuditLog row with actor, action, target, meta.
  - DoD: Universal, A.

### 1B. Design system & app shell
- [ ] **P1-05** Tailwind v4 tokens + base styles + fonts (`packages/ui/fonts`, `tokens.css`).
  - AC: Token classes render as specified. Visual regression snapshot of the token reference page matches design intent.
  - DoD: Universal, B.
- [ ] **P1-06** App shell: top nav (sticky, design-spec), sidebar, toast region, error boundary, i18n provider (`next-intl`, `vi` + `en`).
  - AC: Language switch works live. Focus ring visible. 375px mobile layout OK.
  - DoD: Universal, B, A11y.
- [ ] **P1-07** Admin CP shell (`/admin`) with role-guarded routes and side nav for upcoming sub-pages.
  - AC: Non-admin user sees 404 on `/admin`. Admin sees empty pages that render without error.
  - DoD: Universal, B, D.

### 1C. Voice profile enrollment
- [ ] **P1-08** MinIO presigned PUT upload flow for `uploads/` bucket with size + MIME cap.
  - AC: Browser uploads a 20 MB m4a directly to MinIO; server validates size ≤ 100 MB, MIME in allow-list. Object TTL 24 h if not consumed.
  - DoD: Universal, A, Security.
- [ ] **P1-09** Worker `ingest.enroll` pipeline (ffmpeg resample → VAD trim → loudness normalize → quality score).
  - AC: Given a noisy 60 s m4a, produces a 24 kHz mono WAV with quality score 0–100; score breaks down (SNR, pitch variance, clipping, noise floor); stored under `voice-samples/<profileId>/v<n>.wav`.
  - DoD: Universal, C.
- [ ] **P1-10** `VoiceProfile` + `VoiceSample` CRUD (create profile, add sample, list, set active version, delete (owner), lock/unlock (admin)).
  - AC: All mutations audit-logged. Locked profile can be deleted only by admin. Versioning: adding a new sample bumps `VoiceSample.version` scoped to profile.
  - DoD: Universal, A.
- [ ] **P1-11** Enrollment UI — guided mode (3 prompts, in-browser recorder with MediaRecorder API, waveform visual, quality feedback inline).
  - AC: User records 3 clips, system rejects < 5 s clips, accepts 5–60 s clips, shows per-clip score + aggregate. Uses design-token waveform colors (accent for active).
  - DoD: Universal, B, A11y.
- [ ] **P1-12** Enrollment UI — upload mode (drag-drop, multiple files, per-file progress, post-upload score).
  - AC: Supports mp3, m4a, wav, flac. Rejects > 100 MB with friendly error. Score visible within 15 s of upload finishing.
  - DoD: Universal, B.
- [ ] **P1-13** Consent capture on first sample (signed text, IP, UA, timestamp stored in `consent` JSON).
  - AC: Cannot save first sample without explicit consent tick. Consent visible in profile detail page.
  - DoD: Universal, A, Security.

### 1D. Single-speaker generation
- [ ] **P1-14** `XTTSProvider` implementation + contract test + model auto-download on first use.
  - AC: Passes the shared provider contract test. Synth time for 60 s English ≤ 30 s on M4 16 GB (recorded in `BENCHMARKS.md`).
  - DoD: Universal, C.
- [ ] **P1-15** Sentence chunker (language-aware; `underthesea` for VI, simple regex for EN) + crossfade stitcher (pydub 80 ms).
  - AC: Chunks a 5-minute script into ≤ 50 segments; stitched output has no audible seams in spot-check; total duration within 2% of sum of segment durations.
  - DoD: Universal, C.
- [ ] **P1-16** `render.generation` pipeline (PRESENTATION kind): chunk → synth → stitch → encode MP3 320k + WAV 24-bit → upload to MinIO → update Generation row.
  - AC: End-to-end for a 5-minute script succeeds. Output MP3 and WAV playable. `Generation.durationMs` within 2% of true duration.
  - DoD: Universal, C.
- [ ] **P1-17** Generation UI (script text editor, profile picker, provider read-only, preview first 15 s, submit full render, SSE progress).
  - AC: Progress bar updates within 1 s of worker event. Download buttons enabled when status=DONE. 60-min script rejected in v1 (max 60 min enforced server-side).
  - DoD: Universal, B.
- [ ] **P1-18** Per-user monthly quota enforcement (minutes used increments on render DONE; hard-block if over).
  - AC: USER with `quotaMinutes=10` who has used 9 minutes cannot submit a 5-min render — gets a friendly "over quota" message. Admin can raise quota and user can proceed.
  - DoD: Universal, A.

### 1E. Admin CP — core
- [ ] **P1-19** `/admin/users`: list, invite, change role, set quota, deactivate/reactivate.
  - AC: All actions audit-logged. Invite email sent via Resend. Deactivated user is logged out within 1 request.
  - DoD: Universal, D.
- [ ] **P1-20** `/admin/providers`: list, edit config, set default, toggle enabled. API keys encrypted via `libsodium` sealed-box, masked in UI.
  - AC: Saving a new ElevenLabs key stores ciphertext; displayed as `••••xxxx`. Worker can decrypt on job pickup.
  - DoD: Universal, D, Security.
- [ ] **P1-21** `/admin/audit`: filterable table (by actor, action, date range), CSV export.
  - AC: 10 000 rows paginate without visible lag. CSV export streams.
  - DoD: Universal, D.
- [ ] **P1-22** `/admin/settings`: retention days, default quota, accent hex, max generation minutes.
  - AC: Changing retention days triggers a MinIO lifecycle rule update within 5 min (cron job).
  - DoD: Universal, D.

### 1F. Phase 1 gate
- [ ] **P1-23** E2E happy-path Playwright test (admin invites user → user enrolls → user renders 30 s → downloads MP3).
  - AC: Passes in CI reliably (3 consecutive green runs).
  - DoD: Universal, Testing.
- [ ] **P1-24** Phase 1 demo + retro + docs refresh.
  - AC: Demo recording saved. Retro notes in `docs/RETROS.md`. `PRD.md`/`ARCHITECTURE.md` updated to reflect reality.
  - DoD: F.

---

## Phase 2 — Podcast & Cloud Providers (Week 3)

Goal: two-speaker podcast from timed script OR from uploaded audio. ElevenLabs + Gemini TTS online.

- [ ] **P2-01** Timed-script parser (`[MM:SS A] text` format) + validator (balanced speakers, non-overlapping, within max length).
  - AC: Rejects malformed scripts with a precise error pointing to the offending line. Passes unit tests with 20 malformed inputs.
  - DoD: Universal.
- [ ] **P2-02** Podcast render pipeline (`kind=PODCAST`): per-speaker synth via their profile, stitch with 80 ms crossfade, preserve silence between turns, write ID3 chapter markers per turn.
  - AC: Two-voice output sounds distinct; chapter markers visible in VLC/QuickTime; `Generation.chapters` populated.
  - DoD: Universal, C.
- [ ] **P2-03** Podcast UI (script editor, A/B profile pickers, preview both speakers side-by-side, submit full render).
  - AC: Works for same-profile-both-speakers edge case (with a warning). Responsive.
  - DoD: Universal, B.
- [ ] **P2-04** `ElevenLabsProvider` (clone_voice via `/voices/add`, synthesize via `/text-to-speech/{voice_id}/stream`) + VCR cassette tests.
  - AC: Contract test green. Cost estimate recorded into `Generation.costCents` on success.
  - DoD: Universal, C, Security.
- [ ] **P2-05** `GeminiTTSProvider` (via google-genai) + contract tests.
  - AC: Contract test green. Language support declared accurately.
  - DoD: Universal, C.
- [ ] **P2-06** ASR + diarization pipeline (`asr.diarize` job): faster-whisper large-v3 + pyannote 3.x → timed script.
  - AC: A 10-minute 2-speaker podcast yields timeline with ≥ 90% word accuracy (English, clean audio) and ≥ 95% turn-boundary accuracy.
  - DoD: Universal, C.
- [ ] **P2-07** Re-voice UI: upload audio → review timeline editor (fix text, merge/split turns, reassign speaker) → assign profiles → submit.
  - AC: Editor keyboard-accessible. Undo/redo on edits. Supports up to 60-min source.
  - DoD: Universal, B, A11y.
- [ ] **P2-08** Pacing-lock via Gemini (optional flag): rewrites each segment to fit ±5% of original duration.
  - AC: When enabled, output duration per segment within ±5% of source. When disabled, output can differ freely.
  - DoD: Universal, C.
- [ ] **P2-09** Per-generation provider override in UI (admin policy permitting).
  - AC: USER can pick any enabled provider allowed by admin policy; admin can restrict providers per role.
  - DoD: Universal, B, D.
- [ ] **P2-10** Phase 2 E2E (admin uploads 2-person podcast → diarizes → assigns → renders → downloads with chapters).
  - AC: Playwright test green 3 consecutive runs.
  - DoD: Testing.

---

## Phase 3 — Polish & Hardening (Week 4)

- [ ] **P3-01** Gemini script drafting ("Draft with Gemini" on presentation UI — topic + minutes + tone → script).
  - AC: Returns a script whose synth duration lands within ±10% of requested minutes.
  - DoD: Universal, B, C.
- [ ] **P3-02** Quality score UX: remediation hints ("increase mic gain", "reduce background noise") with localized copy.
  - AC: At least 5 distinct hints trigger on appropriate conditions.
  - DoD: Universal, B.
- [ ] **P3-03** Org-shared voice library view + admin toggle per profile.
  - AC: Non-owner USER sees shared profiles read-only and can use them in generation.
  - DoD: Universal, A, B.
- [ ] **P3-04** Retention cron job: delete `renders/*` older than `retention.renderDays`, write AuditLog summary.
  - AC: Dry-run mode logs without deleting. Real run deletes; storage page reflects. Covered by integration test against MinIO.
  - DoD: Universal, E, D.
- [ ] **P3-05** Monthly quota reset cron + usage email summary.
  - AC: Runs 00:05 UTC on day 1. Resets `usedMinutes`. Sends each active user a summary email.
  - DoD: Universal, E.
- [ ] **P3-06** Sentry + Prometheus + Grafana dashboards (queue depth, render durations, error rate, bundle size).
  - AC: Dashboards exist with 3 panels each. Sentry captures a deliberately-thrown test error.
  - DoD: Universal, E.
- [ ] **P3-07** Clamav file scan on every upload.
  - AC: EICAR test file is rejected. Clean files pass. Scan latency under 3 s for 20 MB.
  - DoD: Universal, Security.
- [ ] **P3-08** Abuse controls: watermark metadata in every output (`ID3 TXXX:watermark=<genId>`), rate limit renders.
  - AC: Metadata present in output MP3 and WAV. Rate limit 10/min/user enforced and tested.
  - DoD: Universal, A, Security.
- [ ] **P3-09** Backup job: daily `pg_dump` + MinIO `mc mirror` to external disk or S3; encrypted.
  - AC: Full restore rehearsal succeeds on a clean host within 30 min.
  - DoD: Universal, E.
- [ ] **P3-10** Accessibility audit pass — Lighthouse + axe on all public + app pages.
  - AC: Zero critical/serious axe violations. Lighthouse a11y ≥ 95 on every page.
  - DoD: B, A11y.
- [ ] **P3-11** i18n completion — every string translated, VI reviewed by native speaker on team.
  - AC: `en` and `vi` message catalogs parity verified by script. No `[MISSING]` placeholders.
  - DoD: Universal, B.
- [ ] **P3-12** Phase 3 E2E regression suite run + performance benchmark run + release notes.
  - AC: All E2Es green. Benchmarks within ±15% of Phase 1 baseline. Release notes in `docs/RELEASES.md`.
  - DoD: Testing.

---

## Phase 4 — Scale & Extensions (Post-launch)

Not scheduled; each promoted as needed.

- [ ] **P4-01** Linux+GPU worker deployment guide + Compose overlay for CUDA.
- [ ] **P4-02** `F5Provider` implementation + A/B vs XTTS on VI quality.
- [ ] **P4-03** Public share links (time-limited, revocable) — gated behind `feature.publicShareLinks`.
- [ ] **P4-04** Slack/Teams webhook on generation complete.
- [ ] **P4-05** REST API + API keys for other YouNet internal tools to call the generator.
- [ ] **P4-06** Workspace isolation (multi-tenant) — for future external client access.
- [ ] **P4-07** VibeVoice-1.5B provider (when GPU host exists).
- [ ] **P4-08** Emotion/style conditioning where provider supports it.

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
