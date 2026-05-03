# Release Notes — YouNet Voice Studio

## v0.3.0 — Phase 3: Polish & Hardening (2026-04-19)

### New features
- **Gemini script drafting** (P3-01): "Draft with Gemini" button on the presentation generator — enter topic, language, and tone to auto-generate a script via Gemini 2.0 Flash.
- **Quality score hints** (P3-02): Voice enrollment QualityBadge now surfaces 5+ actionable remediation hints (mic gain, clipping, noise floor, duration, pitch variance) keyed to audio metrics.
- **Org-shared voice library** (P3-03): Admins can toggle any profile as org-shared from `/admin/library`; non-owner users see shared profiles read-only and can use them in generation.
- **Retention cron** (P3-04): `infra/scripts/retention-purge.ts` deletes `renders/` objects older than `retention.renderDays` setting; dry-run mode logs without deleting; result written to AuditLog.
- **Monthly quota reset cron** (P3-05): `infra/scripts/quota-reset.ts` resets `usedMinutes` for all active users on day 1 of each month and sends per-user summary emails via Resend.
- **ClamAV file scan** (P3-07): All uploaded voice samples are scanned via ClamAV clamd before the ingest job is enqueued; infected files are deleted and the upload is rejected with a clear error.
- **Abuse controls** (P3-08): Every generated MP3 receives an `ID3 TXXX:watermark=<genId>` tag for traceability. Render endpoint enforces 10 renders/minute/user via Redis sliding window.
- **Backup job** (P3-09): `infra/scripts/backup.sh` — daily `pg_dump + mc mirror` to a local directory; optional `age` encryption when `BACKUP_ENCRYPT_KEY` is set.
- **Accessibility audit** (P3-10): Playwright/axe E2E spec checks all public and app pages for critical/serious WCAG 2.1 AA violations.
- **i18n parity** (P3-11): `infra/scripts/check-i18n-parity.ts` verifies en/vi catalogs have identical key sets (168 keys, currently in parity). Wired into `pnpm verify`.

### Infrastructure
- `docker-compose.yml` adds `clamav` service (clamav/clamav:stable) on port 3310.
- `apps/web/src/server/services/clamav.ts` — ClamAV INSTREAM TCP scanner (fails open if clamd is unreachable in dev).
- `apps/web/src/server/services/storage.ts` — `getObjectBuffer()` helper for server-side object reads.

### Security
- All three render mutations now enforce a Redis fixed-window rate limit (10/min/user).
- ClamAV EICAR test file will be rejected at `submitSample`; clean files proceed normally.
- ID3 watermark is written to every MP3 output for chain-of-custody tracing.

---

## v0.2.0 — Phase 2: Podcast & Cloud Providers (2026-04-19)

- Timed-script parser (`[MM:SS A] text` format)
- Podcast render pipeline with ID3 chapter markers (mutagen)
- ElevenLabs and Gemini TTS providers
- ASR + diarization pipeline (faster-whisper + pyannote)
- Re-voice UI with timeline editor
- Pacing-lock via Gemini (`±5%` duration fit)
- Per-generation provider override

---

## v0.1.0 — Phase 1: Foundation (2026-04-19)

- Invite-only auth with forced password change
- Voice enrollment: in-browser recorder, drag-drop upload, quality scoring
- Single-speaker presentation generation (XTTS v2)
- Admin CP: users, providers, audit log, settings
- Redis Streams job queue
- MinIO presigned upload flow
- SSE progress streaming
