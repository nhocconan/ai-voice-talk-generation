# Voice Studio iOS — Product Overview

**Status:** Draft v1.0 (handoff spec) · **Owner:** Mobile/Product · **Last updated:** 2026-07-05

> **Tóm tắt tiếng Việt.** Tài liệu này đặc tả ứng dụng iOS gốc (native, SwiftUI) cho Voice Studio — sản phẩm nhân bản giọng nói và tạo audio/podcast bằng AI hiện đang chạy trên web. Nguyên tắc cốt lõi: **app iOS đăng nhập bằng đúng tài khoản người dùng (email + mật khẩu) như web**, nên hồ sơ giọng (voice profile) tạo/huấn luyện trên điện thoại sẽ tự động xuất hiện trên web và ngược lại — vì mọi hồ sơ đều thuộc về `ownerId` (User). App tập trung vào ba việc: nhân bản giọng từ một đoạn ghi âm ngắn, soạn/tạo bài nói và podcast, rồi nghe/tải kết quả. Web cần bổ sung một lớp xác thực token cho mobile và một facade REST có phiên bản (versioned) trước khi iOS có thể xây xong.

---

## 1. Vision

Voice Studio lets authorized staff enroll a person's voice once, then generate presentation-length or podcast-length audio in that voice — in Vietnamese or English — from a script, a topic, or an existing recording they want re-voiced. The web app already ships this. The iOS app brings the two highest-value moments to the phone:

1. **Capture** — record a clean reference clip anywhere (a quiet room, a phone booth) and enroll/clone a voice on the spot, with real-time quality feedback.
2. **Consume** — draft a script, kick off a generation, watch progress, and listen to / share the result on the go.

The phone is the best microphone most users have on them, and the best place to *listen*. Those are the two jobs the native app must nail.

## 2. Central design principle — one account, one voice library

The iOS app is **not** a separate product with its own accounts. It authenticates as the **same `User`** (same email + password credentials) as the web app. Because every `VoiceProfile` is keyed off `ownerId` (a `User.id`), the effect is automatic:

- A profile enrolled on iOS appears in the web voice library immediately (same `ownerId`).
- A profile trained on web is usable from iOS immediately.
- Org-shared profiles (`isOrgShared = true`) and quota (`User.quotaMinutes` / `usedMinutes`) behave identically across surfaces.

This is stated first because it drives every downstream decision in `01-ACCOUNT-AND-AUTH.md` and `02-API-CONTRACT.md`. There is **no data migration, no sync engine, no separate mobile database of record** — Postgres remains the single source of truth, reached through the same server.

## 3. Target users & personas

These mirror the web personas in `../PRD.md §2`; the mobile-specific need is added.

| Persona | Role | Mobile-specific need |
|---|---|---|
| **Executive Assistant (EA)** | Prepares content for leaders | Enroll a leader's voice during a face-to-face moment; kick off / check renders between meetings |
| **Marketing/Comms staff** | Produces podcasts, announcements | Review and share finished audio away from a desk; quick re-drafts |
| **Leader (voice owner)** | Voice being cloned | Give consent and record their own reference clip on their own device; approve output |
| **Super Admin** | Platform owner | Not a mobile persona in MVP — admin CP stays web-only |

## 4. Platforms & minimum OS version

| Decision | Choice | Justification |
|---|---|---|
| Language / UI | Swift 6, SwiftUI | First-party, fastest path to a native audio + list app; strong concurrency for async networking |
| Minimum iOS | **iOS 17.0** | As of this spec (mid-2026) iOS 17 is two majors back; it gives SwiftUI `Observable`, `ContentUnavailableView`, `.scrollTargetLayout`, modern `AVAudioApplication` permission APIs, and Swift Concurrency without back-deploy shims, while still covering the near-entirety of the active-device base. Going to iOS 18 buys little the app needs; staying on 16 costs real API ergonomics. |
| Devices | iPhone (primary), iPad (compatible) | Phone is the capture + listen device. iPad is a size-class adaptation, not a separate design in MVP. |
| Orientation | Portrait primary | Content is list/record/player oriented |
| Distribution | Internal / MDM first, App Store optional | Product is invite-only internal today (see `../PRD.md §3` non-goals). App Store readiness is speced anyway in `05-…` because Apple requires account-deletion and privacy labels even for internal-flavored public apps. |

## 5. Scope — MVP vs Phase 2

### MVP (must ship first)

| Capability | Notes |
|---|---|
| Sign in with existing email/password | Requires the **new mobile token endpoint** (see `01-…`). Blocks everything else. |
| Forced password change handling | Seeded/reset accounts carry `forcePasswordChange`; app must honor it. |
| Voice profile list | Owned + org-shared profiles, with per-sample quality score. |
| Voice enrollment / clone | Create profile → record or pick a reference clip → on-device pre-checks → consent capture → presigned upload → ingest → surface quality score → set active version. |
| Presentation generation | Pick profile, type/paste or **draft with LLM**, optional 15s preview, submit, watch progress, play, download/share. |
| Job progress | SSE where the network allows, **polling fallback** for flaky mobile networks. |
| Playback | In-app player for MP3 output. |
| Quota surfacing | Show `usedMinutes / quotaMinutes` and block gracefully when over. |

### Phase 2 (after MVP is stable)

| Capability | Notes |
|---|---|
| Two-speaker podcast (timed script) | Reuses `createPodcast`. More complex editor UI. |
| Re-voice uploaded audio | Upload → ASR/diarize → timeline edit → assign profiles. Heavy editor; better second. |
| Audiogram output (Mode A) | Square MP4 with waveform; playback of `outputVideoKey`. |
| APNs push on job completion | Requires web-side push token registration + worker hook (see `05-…`). |
| Sign in with Apple | Requires a web-side identity bridge; Credentials-only today blocks pure SIWA (see `01-…`). |
| Biometric app lock | Face ID / Touch ID gate on launch. |
| Offline library caching | Cache finished audio for offline listening. |

## 6. Non-goals (MVP)

- **Video re-voice (Mode B) authoring on device.** Large-file (up to 1 GB) uploads and diarized timeline mapping are a desktop-class task. Playback of a completed video re-voice output is acceptable; authoring it is out.
- **Admin Control Panel on mobile.** User/provider/quota/audit management stays web-only. No `/admin` surface in the app.
- **Real-time / streaming voice conversion.** Same non-goal as web (`../PRD.md §3`). Batch only.
- **Public self-signup.** Invite-only remains. The app never creates accounts; it only authenticates existing ones.
- **Provider configuration.** Users pick from *enabled* providers the server exposes; they never see API keys or config forms.
- **A separate mobile identity.** Explicitly out — see §2.

## 7. Success metrics (mobile)

| Metric | Target (90 days post-launch) |
|---|---|
| Of active users, % who complete ≥1 action on mobile | ≥ 40% |
| Median time from "New Profile" to "sample ingested" on iOS | ≤ 3 min |
| Crash-free sessions | ≥ 99.5% |
| Generation started on mobile → downloaded/played on mobile | ≥ 90% |
| App Store / internal rating | ≥ 4.3 |

## 8. Document map

Read in this order. All contracts cited are grounded in the current web codebase; anything the web team must still build is labeled **PROPOSED**.

| Doc | What it covers |
|---|---|
| `01-ACCOUNT-AND-AUTH.md` | Shared-account model, the PROPOSED mobile token endpoints, Sign in with Apple, Keychain/biometrics |
| `02-API-CONTRACT.md` | Every endpoint iOS needs — existing + PROPOSED — with JSON and an OpenAPI 3.1 sketch |
| `03-VOICE-PROFILE-AND-CLONING.md` | Enrollment/clone UX, consent, quality scoring, versions, lifecycle diagrams |
| `04-TECHNICAL-ARCHITECTURE.md` | SwiftUI app architecture, networking, audio, uploads, progress, persistence |
| `05-WEB-SIDE-GAPS-AND-TOP-INDUSTRY-REVIEW.md` | Prioritized audit of what web must add for a world-class mobile product |
| `06-TASK-BREAKDOWN.md` | Sequenced, buildable backlog (EPICs → tasks → AC → size) with milestones |

## Changelog
- 2026-07-05: v1.0 initial iOS handoff overview.
