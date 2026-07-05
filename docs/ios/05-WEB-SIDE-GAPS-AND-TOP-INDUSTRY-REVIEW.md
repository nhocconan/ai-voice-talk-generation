# Web-Side Gaps & Top-Industry Review

**Status:** Draft v1.0 (handoff spec) · **Owner:** Eng/Product · **Last updated:** 2026-07-05

An honest audit of the **current web product** against what a world-class voice-cloning / AIGC SaaS ships, framed by what a native iOS app needs. Priorities: **P0** (blocks a credible mobile launch or is a legal/compliance must), **P1** (needed for a competitive, retentive product), **P2** (polish / scale). Each item states *why it matters*, *what comparable products do* (ElevenLabs, Descript, Play.ht, Resemble.ai, HeyGen, Speechify), and a *concrete recommendation* grounded in this codebase.

Comparable-product statements describe general industry norms as of this writing; treat specific claims as directional, not a live audit of any competitor.

---

## P0 — Blockers & legal must-haves

### P0-1 Mobile token auth infrastructure
**Gap.** Auth is NextAuth Credentials with a **JWT-in-cookie** session (`apps/web/src/server/auth/config.ts`). There is no JSON login/refresh endpoint a native app can use; the only Bearer path (`vk_` API keys) is mintable **only** from the web UI and gates only `POST /api/v1/generate`.
**Why it matters.** Without a token endpoint the iOS app literally cannot sign in. This is the single hard blocker; nothing else in the app is reachable.
**What comparable products do.** Every serious SaaS with a mobile client exposes an OAuth2/JWT token endpoint (short-lived access + rotating refresh) distinct from browser cookies.
**Recommendation.** Build `/api/v1/auth/{login,refresh,logout,change-password,me}` + `MobileRefreshToken` + Bearer middleware exactly as specified in `01-ACCOUNT-AND-AUTH.md §3`. Reuse the existing bcrypt check and `checkFixedWindowLimit("auth", …)` limiter. Effort: M.

### P0-2 Versioned REST API parity + OpenAPI
**Gap.** The app-facing API is **tRPC** (`server/routers/*`) — an internal, unstable, TS-only protocol. Only a sliver is exposed as REST (`POST /api/v1/generate`, profile export, SSE, download), and those mix auth models (Bearer vs session cookie).
**Why it matters.** A native app cannot safely consume tRPC; drift will silently break the app on every refactor. Mixed auth means SSE/download/export don't work with a mobile token.
**What comparable products do.** Publish a stable, versioned REST (or GraphQL) API with an OpenAPI spec and SDKs; the web UI may use a private RPC, but a documented public contract backs integrations and mobile.
**Recommendation.** Add the PROPOSED `/api/v1/*` facade in `02-API-CONTRACT.md` (thin handlers over existing service logic), standardize the error envelope (`02-… §3`), and **extend SSE/download/export to accept the Bearer token**. Ship the OpenAPI 3.1 spec (`02-… §10`) in CI. Effort: M–L.

### P0-3 Consent & voice-likeness legal/anti-abuse hardening (legal P0)
**Gap.** Consent today = a checkbox + free-text stored in `VoiceProfile.consent` JSON at creation (`voiceProfile.create`), plus a `voiceProfile.create` audit row and an ID3 `TXXX:watermark=<genId>` tag on outputs (`../TASKS.md` P3-08). That's a reasonable start but thin for a voice-cloning product, especially one going to a phone where anyone can record anyone.
**Why it matters.** Voice cloning is the highest-abuse-risk feature in the product (impersonation, fraud, non-consensual likeness). It's also an App Store rejection and legal-liability vector. This is a **legal P0**, independent of mobile.
**What comparable products do.** ElevenLabs/Resemble require **verified consent** for high-fidelity/"professional" cloning (often a spoken consent recording matching a challenge phrase), maintain a **per-clone consent audit trail**, apply **inaudible audio watermarking** (e.g. AudioSeal/Perth-style, not just a metadata tag a re-encode strips), publish a **deepfake/impersonation policy**, and run **voice-likeness / moderation** checks.
**Recommendation.**
- Strengthen consent into a first-class, immutable, per-clone audit record (who, when, IP/UA, statement text, and — for leadership voices — an optional spoken-consent clip). Consider a dedicated `Consent` table over a JSON blob.
- Replace/augment the ID3 metadata watermark with a **signal-domain watermark** that survives re-encode (research task; `../PRD.md` Q3 already flags this as open).
- Publish an explicit **impersonation/deepfake acceptable-use policy** surfaced in-app at consent time.
- Keep the existing invite-only + audit-log + profile-lock controls (`../ARCHITECTURE.md §7`) — they're good; extend the audit trail to cover consent and every render's `profileIds`. Effort: M (policy/audit) + L (robust watermark).

### P0-4 App Store review compliance (if distributed publicly)
**Gap.** No mobile app exists yet, so none of Apple's mobile requirements are met.
**Why it matters.** Even an internal-flavored public app is rejected without these. See the `appstore-review-guard` skill for the full checklist.
**What comparable products do.** Ship the mandatory set: usage-description strings, privacy nutrition labels, **in-app account deletion**, and a privacy-policy URL.
**Recommendation (mobile + web support needed):**
- **In-app account deletion (Apple 5.1.1(v)).** Requires a PROPOSED `DELETE /api/v1/auth/account` (or an in-app deletion request flow) — the product is invite-only/admin-provisioned, so at minimum provide an in-app "request account deletion" that notifies an admin and a documented deletion SLA. Pure "email support" is not acceptable to Apple.
- `NSMicrophoneUsageDescription` (required — the app records), and only permissions actually used (no unused strings).
- Privacy nutrition labels declaring audio + account data collection and use.
- No debug/QA hooks in release; no metadata promising unshipped features. Effort: S (mobile) + S (web deletion endpoint).

### P0-5 GDPR/PDPD data-deletion & export completeness
**Gap.** Profile **export** exists (`GET /api/v1/voice-profiles/[id]/export` → ZIP with manifest + samples) and retention auto-purges renders (`../TASKS.md` P3-04). But there is **no user-level data deletion/export** endpoint — deletion is per-profile only.
**Why it matters.** Biometric-adjacent data (voiceprints) is sensitive under GDPR and Vietnam's PDPD. "Delete my voice and my data" must be honorable end-to-end, and ties directly to P0-4's in-app deletion.
**What comparable products do.** Self-serve data export + account/voice deletion with a defined retention/erasure window.
**Recommendation.** Add user-scoped deletion (cascade profiles, samples, generations, storage objects, tokens) and a user-level export. Reuse the existing per-profile export as a building block. Effort: M.

## P1 — Competitive & retention

### P1-1 APNs push notifications for job completion
**Gap.** Progress is SSE-only (`/api/jobs/[id]/events`), which dies when a phone backgrounds or changes networks. There is no push.
**Why it matters.** Renders can take minutes; users won't hold the app open. "We'll ping you when it's ready" is table stakes and the single biggest mobile-retention lever here.
**What comparable products do.** Push (and email) on generation complete/failed.
**Recommendation.** Add PROPOSED `POST /api/v1/devices` (register APNs token per user/device) and a worker hook that, on terminal job status, sends an APNs push (there's already a Slack/Teams webhook on completion — `../TASKS.md` P4-04 — to model on). Effort: M.

### P1-2 Ingest progress + failure surfacing
**Gap.** Enrollment ingest has **no progress channel** — only render jobs publish to `job:<id>:events`. The app must poll `GET /voice-profiles/{id}` and guess when ingest failed.
**Why it matters.** Enrollment is the first thing a mobile user does; a silent, unbounded wait is a bad first impression.
**Recommendation.** Publish ingest progress/terminal state to a job channel (and/or expose ingest status on the sample), plus an explicit failure state. Effort: S–M.

### P1-3 Quota/billing surfacing for mobile
**Gap.** Quota is enforced server-side (`enforceQuota`, `User.quotaMinutes/usedMinutes`) but not exposed as a clean mobile-readable resource beyond login/`/me`.
**Why it matters.** Users need to see remaining minutes *before* they draft a 30-minute script and get a `403`.
**What comparable products do.** Prominent usage meter + upgrade path.
**Recommendation.** Return quota in `/auth/me` (done in `01-…`); add a lightweight `GET /api/v1/usage` if per-period breakdown is wanted. Show a usage meter and pre-flight the estimate against remaining minutes client-side. Effort: S.

### P1-4 Polling-fallback status endpoint
**Gap.** No REST status endpoint; progress is SSE-only.
**Why it matters.** Mobile networks require a polling fallback (`04-… §7`). Without it, flaky connections leave the app stuck on "rendering…".
**Recommendation.** Build PROPOSED `GET /api/v1/jobs/{id}/status` (persist last event per job in Redis, or derive from the `Generation` row). Effort: S.

### P1-5 Content moderation on scripts
**Gap.** Scripts (`inputScript`) are synthesized with no moderation. Draft prompts (`topic`) hit LLMs with no policy layer.
**Why it matters.** Voice + arbitrary text = a fraud/harassment engine. Comparable products screen generation inputs.
**What comparable products do.** Prompt/text moderation (block violent, sexual-minor, targeted-harassment, impersonation content) before synthesis.
**Recommendation.** Add a moderation checkpoint on `script`/`topic` (a fast classifier or provider moderation API) in the render/draft path; log rejections to the audit trail. Effort: M.

### P1-6 Rate-limit & abuse hardening for a bearer-token world
**Gap.** Limits exist but are coarse: generate 10/min/user, auth 5/15min/IP, upload rate on some paths. A mobile token world widens the attack surface (token theft, scripted abuse).
**Why it matters.** More clients + long-lived credentials = more abuse potential.
**Recommendation.** Per-endpoint limits on all new `/api/v1/*` routes (reuse `checkFixedWindowLimit`), refresh-token reuse detection (`01-… §3.3`), device binding, and anomaly alerts (bursty renders, many profiles/day). Effort: M.

### P1-7 Observability for mobile clients
**Gap.** Server has Prometheus/Sentry/OTEL (`../ARCHITECTURE.md §8`), but nothing distinguishes mobile traffic or tracks mobile-specific health (token-refresh failures, upload success rate).
**Recommendation.** Tag `/api/v1/*` requests with a client header (`X-Client: ios/<version>`), add mobile dashboards (auth success, refresh churn, upload/render success by client), and adopt a mobile crash reporter (`04-… §12`). Effort: S–M.

## P2 — Polish & scale

### P2-1 i18n completeness parity on new surfaces
Web has VI+EN parity enforced in CI (`../TASKS.md` P3-11, `i18n:check`). Any new mobile-facing strings (error envelope messages, quality hints) must ship in both. Mirror the five remediation hints (`03-… §5`). Recommendation: keep a shared source of user-facing message keys. Effort: S.

### P2-2 Offline & poor-network resilience (server affordances)
Presigned URLs are short-lived (GET 300 s–3600 s, PUT 3600 s). For mobile that's usually fine, but "download for offline" needs the app to fetch fresh URLs on demand. Consider slightly longer output GET TTLs or a re-issue endpoint. Effort: S.

### P2-3 Sign in with Apple bridge
Optional (not required by Apple here — no other social logins; `01-… §5`). If desired, add the `AppleIdentity` link/login. Effort: M.

### P2-4 Resumable/large uploads for video re-voice on mobile
Video re-voice allows 1 GB uploads via a single presigned PUT — impractical on cellular. If mobile video authoring is ever in scope, add multipart/resumable uploads. Deferred with the feature. Effort: L.

### P2-5 Provider/model transparency to end users
The app shows provider `name` enums; a friendlier, localized catalog (mirroring `providers-meta.ts`) improves UX. Consider a `GET /api/v1/provider-meta` that returns display names/taglines so the app doesn't hardcode a copy. Effort: S.

---

## Priority summary

| ID | Item | Priority | Effort | Blocks MVP? |
|---|---|---|---|---|
| P0-1 | Mobile token auth | P0 | M | Yes |
| P0-2 | REST parity + OpenAPI + unify auth on SSE/download/export | P0 | M–L | Yes |
| P0-3 | Consent + watermark + anti-abuse (legal) | P0 | M–L | Legal gate |
| P0-4 | App Store compliance (incl. in-app account deletion) | P0 | S | If public |
| P0-5 | User-level GDPR/PDPD deletion & export | P0 | M | Legal gate |
| P1-1 | APNs push on completion | P1 | M | No |
| P1-2 | Ingest progress/failure | P1 | S–M | No |
| P1-3 | Quota surfacing | P1 | S | No |
| P1-4 | Polling status endpoint | P1 | S | Strongly recommended |
| P1-5 | Script/prompt moderation | P1 | M | No |
| P1-6 | Rate-limit/abuse hardening | P1 | M | No |
| P1-7 | Mobile observability | P1 | S–M | No |
| P2-1..5 | i18n, offline TTLs, SIWA, resumable uploads, provider meta | P2 | S–L | No |

**Top 5 P0s to schedule first:** P0-1 (token auth), P0-2 (REST + OpenAPI + unified bearer auth), P0-3 (consent/watermark/anti-abuse), P0-4 (App Store incl. account deletion), P0-5 (user-level deletion/export).

## Changelog
- 2026-07-05: v1.0 initial gaps & industry review.
