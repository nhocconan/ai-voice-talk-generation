# Product Requirements Document — YouNet Voice Studio

**Status:** Draft v1.1 · **Owner:** Product/Engineering · **Last updated:** 2026-04-20

## 1. Problem & Vision

YouNet leadership produces internal presentations, podcasts, and announcements in Vietnamese and English. Producing voiced content today requires either hiring voice actors, scheduling the leader personally, or using generic TTS that doesn't sound like them. NotebookLM-style AI podcasts are useful but speak in generic English voices — unsuitable for YouNet-branded content.

**Vision.** Let any authorized YouNet staff enroll a leader's voice once, then generate presentation-length or podcast-length audio in that voice — in Vietnamese or English — from a script, a topic, or an existing podcast they want re-voiced.

## 2. Target Users & Personas

| Persona | Role | Primary need |
|---|---|---|
| **Executive Assistant (EA)** | Prepares content on behalf of leaders | Fast, reliable generation; confidence in quality before publishing |
| **Marketing/Comms staff** | Produces podcasts, announcements | Re-voicing NotebookLM outputs into leadership voices; multi-speaker support |
| **Leader (voice owner)** | Voice being cloned | Control over their voice profile; approval over what ships |
| **Super Admin** | IT/platform owner | Full control over users, providers, quotas, retention |

## 3. Goals & Non-Goals

### Goals (v1)
- Enroll a voice profile from 30–60s of reference audio (guided or upload), with multi-sample versioning.
- Generate single-speaker presentations up to 60 minutes, Vietnamese or English.
- Generate two-speaker podcasts from a timed script OR by re-voicing an uploaded podcast.
- Support pluggable TTS providers: local-first (`VieNeu-TTS`, `VoxCPM2`, `XTTS-v2`, `F5-TTS`) + cloud (`ElevenLabs`, `Gemini TTS`). Super Admin configures active provider.
- Invite-only authentication. Default super admin seeded: `admin@younetgroup.com` / `YouNet@2026`.
- Full Admin Control Panel with CRUD over users, providers, voice library, generations, storage, retention, audit log.
- Output MP3 + WAV with ID3 chapter markers for podcasts.
- Brand: apply `DESIGN.md` (ElevenLabs-style) with a single YouNet accent color.

### Non-Goals (v1, revisit later)
- Real-time streaming voice (only batch generation).
- Live voice conversion / dubbing of video.
- Public self-signup or external-client multi-tenancy.
- Mobile-native apps (responsive web is sufficient).
- Emotion/style conditioning beyond neutral presentation/conversational tones.
- Background-music mixing or full audio post-production.

## 4. Success Metrics

| Metric | Target (90 days post-launch) |
|---|---|
| Monthly active internal users | ≥ 30 |
| Generations per week | ≥ 50 |
| Avg clone-quality MOS (internal blind rating, 1–5) | ≥ 4.0 |
| Successful end-to-end generation rate | ≥ 98% |
| P95 render time for 5-minute presentation | ≤ 3 minutes |
| Super Admin overhead per week | ≤ 2 hours |

## 5. Key User Flows

### 5.1 Enrollment (Voice Profile Creation)
1. User clicks **New Voice Profile** → names it, picks language, picks sample mode.
2. **Guided mode:** 3–5 prompts appear (diverse phoneme coverage). User records each in-browser. System validates SNR, duration, silence ratio per clip.
3. **Upload mode:** User drags in one or more mp3/m4a/wav files. System auto-normalizes (24kHz mono WAV, loudness normalize, VAD trim, resample).
4. System computes a **Quality Score** (0–100) based on SNR, duration, pitch variance, clipping, noise floor. Displays to user with remediation hints.
5. Profile saved as **v1**. Adding more samples creates **v2**, **v3** — user chooses active version.

### 5.2 Presentation Generation (Single Speaker)
1. User picks a profile.
2. Input script: type, paste, or click **Draft with Gemini** (enter topic + target minutes + tone).
3. Preview first 15 seconds (fast synth).
4. If happy, submit full render → job queued.
5. Progress bar (queue position, estimated time). Push updates via SSE.
6. On completion: player, download MP3/WAV, share link (expires per retention policy).

### 5.3 Podcast Generation (Two Speakers, Script Path)
1. User picks podcast mode, assigns Profile A and Profile B.
2. Paste timed script. Format:
   ```
   [00:00 A] Welcome to the show…
   [00:18 B] Thanks for having me…
   ```
3. System validates: balanced tags, no overlaps, total duration sane.
4. Preview → full render. Stitcher crossfades 80 ms between segments. Adds ID3 chapter markers at each speaker-turn boundary (opt-in).

### 5.4 Re-Voicing an Existing Podcast (Audio Path)
1. User uploads mp3/m4a reference (e.g., NotebookLM export).
2. System runs **faster-whisper** (ASR) + **pyannote** (diarization) → produces timeline: `[{start, end, speaker: A|B, text}, …]`.
3. User reviews the timeline in an editor: fix misrecognized words, merge/split turns, reassign speaker labels.
4. User assigns Profile A → Speaker A, Profile B → Speaker B (or same profile to both).
5. Optional: enable **pacing lock** — Gemini adjusts phrasing so each segment fits within ±5% of the original duration.
6. Render. Output preserves original timing.

### 5.5 Admin Flows
See [ARCHITECTURE.md](./ARCHITECTURE.md#admin-cp) for surface list. Invite user → seeds Invite row → emails link → user sets password → auto-assigned USER role → admin grants quota.

## 6. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Invite-only auth with email/password; Auth.js v5; password reset via email | Must |
| FR-2 | Role model: SUPER_ADMIN, ADMIN, USER | Must |
| FR-3 | Per-user monthly generation-minute quota, enforced server-side | Must |
| FR-4 | Voice profile with multiple reference samples (versioned) | Must |
| FR-5 | Quality scoring on enrollment | Must |
| FR-6 | Single-speaker render, scripts up to 60 min | Must |
| FR-7 | Two-speaker podcast render from timed script | Must |
| FR-8 | ASR + diarization of uploaded audio | Must |
| FR-9 | Re-voice preserving original timing (±5%) | Must |
| FR-10 | TTS provider adapters: VieNeu-TTS, VoxCPM2, XTTS-v2, F5-TTS, ElevenLabs, Gemini TTS | Must |
| FR-11 | Super Admin configures active provider + per-role overrides + API keys (encrypted at rest) | Must |
| FR-12 | Admin CP: users, providers, profiles, generations, storage, retention, audit log, settings | Must |
| FR-13 | MP3 + WAV output; ID3 chapter markers for podcasts | Must |
| FR-14 | Gemini: script drafting, transcript→timed script, length/pacing | Must |
| FR-15 | Audit log: immutable, covers every admin action + every generation | Must |
| FR-16 | Retention: auto-delete outputs after N days (admin-configurable, default 90) | Must |
| FR-17 | Responsive web UI; design per `DESIGN.md` + YouNet accent | Must |
| FR-18 | Vietnamese and English UI copy | Should |
| FR-19 | Org-shared voice library (admin-marked profiles visible to all) | Should |
| FR-20 | Profile lock (leadership profiles can't be deleted by owner alone) | Should |
| FR-21 | Public share links for generations (time-limited, revocable) | Could |
| FR-22 | Slack/Teams webhook on generation complete | Could |

## 7. Non-Functional Requirements

- **Security.** All data at rest encrypted (disk-level). Provider API keys encrypted application-level with `libsodium` sealed-box. HTTPS enforced. CSRF + SameSite=Lax cookies. Rate limiting on auth + generate endpoints.
- **Privacy.** Reference audio never leaves YouNet infrastructure unless cloud provider is active for that generation. Super Admin sees consent status per user.
- **Reliability.** 99% uptime target. Graceful queue recovery on worker restart. Idempotent job execution.
- **Performance.** P95 5-min render ≤ 3 min on Linux+GPU (when available) or ≤ 10 min on Mac M4. 15-second preview ≤ 8 seconds.
- **Scalability.** Handle 500 generations/day at peak. Horizontal scale of inference workers.
- **Accessibility.** WCAG 2.1 AA. Keyboard-only operation. Focus rings preserved.
- **i18n.** All strings via `next-intl`; no hardcoded copy.
- **Observability.** Structured JSON logs, OpenTelemetry traces on critical paths (enroll, render, admin mutations), Sentry for errors, basic Prometheus metrics for queue depth and render durations.

## 8. Constraints

- Dev hardware: Mac Mini M4 16GB / MBP M1 Pro 16GB (no CUDA). Prod may later add Linux+GPU.
- Budget: prefer OSS; cloud providers pay-per-use with admin kill-switch.
- Languages: Vietnamese (primary), English. Chinese later. No other SEA in v1.
- Max render length: 60 min per generation.

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| VieNeu-TTS local quality varies by runtime mode | M | H | Keep `XTTS-v2` + `F5-TTS` as local fallbacks and `ElevenLabs` as paid fallback |
| VoxCPM2 Apple-Silicon performance insufficient | M | M | Treat `VoxCPM2` as opt-in quality lane on Mac; promote to main path only after benchmark pass |
| Apple-Silicon inference too slow for 60-min outputs | M | M | Chunk + queue; surface ETA; fall back to cloud provider if exceeds threshold |
| Voice-cloning abuse (deepfakes) | M | H | Invite-only, audit log, profile lock, consent on enrollment, watermark audio metadata |
| Provider API cost overrun | M | M | Per-user quota, provider kill-switch, cost dashboard in Admin CP |
| Diarization errors on noisy input | H | M | Always allow manual correction; confidence highlighting |
| Data loss on Mac dev storage | H | M | Daily rsync backup of MinIO + Postgres to external disk in Phase 1; cloud backup in Phase 2 |

## 10. Release Phases

See [TASKS.md](./TASKS.md) for the phased task breakdown with acceptance criteria. High-level:

- **Phase 1 — Foundation** (weeks 1–2): Auth, Admin CP shell, VieNeu-TTS single-speaker path, design system.
- **Phase 2 — Podcast** (week 3): Two-speaker, ASR+diarization, ElevenLabs + Gemini TTS adapters, chapter markers.
- **Phase 3 — Polish** (week 4): Gemini script drafting, pacing, quotas, audit, retention, quality score UX.
- **Phase 4 — Scale** (post-launch): Linux+GPU worker, VoxCPM2 promotion path, org-shared library, API for other YouNet tools.

## 11. Open Questions

Track new questions here; close with a decision + PR link.

| # | Question | Owner | Status |
|---|---|---|---|
| Q1 | SMTP provider for invites? | Admin | Open — default Resend |
| Q2 | Backup destination beyond local disk? | Admin | Open |
| Q3 | Watermark strategy (Perth / inaudible)? | Security | Open — research in Phase 3 |

## Changelog
- 2026-04-19: v1.0 initial draft.
- 2026-04-20: Refreshed the provider strategy around VieNeu-TTS as the main Mac-first lane and VoxCPM2 as the advanced-quality lane.
