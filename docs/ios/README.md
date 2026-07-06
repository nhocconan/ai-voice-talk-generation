# Voice Studio iOS — Handoff Specification

**Status:** Draft v1.0 (handoff spec) · **Owner:** Mobile/Product · **Last updated:** 2026-07-05

> **Tóm tắt tiếng Việt.** Đây là bộ tài liệu bàn giao (handoff) để một kỹ sư khác có thể xây ứng dụng iOS gốc cho Voice Studio mà không cần đọc mã nguồn web. **Nguyên tắc cốt lõi:** app iOS đăng nhập bằng **đúng tài khoản (email + mật khẩu) như web**; vì mọi voice profile đều thuộc về `ownerId` (User), hồ sơ giọng tạo/huấn luyện trên điện thoại sẽ tự động dùng được trên web và ngược lại. Đọc theo thứ tự 00 → 06. Lưu ý: web **phải bổ sung lớp xác thực token cho mobile và một REST facade có phiên bản** trước — iOS bị chặn cho tới khi phần đó xong (xem doc 05 và EPIC W trong doc 06).

---

## Start here

If you are the engineer picking this up:

1. Read **[00-OVERVIEW](00-OVERVIEW.md)** for scope and the MVP/Phase-2 split.
2. Internalize the **shared-account principle** in **[01-ACCOUNT-AND-AUTH](01-ACCOUNT-AND-AUTH.md)** — it drives the whole design.
3. The iOS app is **blocked on web-side work**. Before writing app screens, the web team must ship the mobile auth token flow and the REST facade. See **[05](05-WEB-SIDE-GAPS-AND-TOP-INDUSTRY-REVIEW.md)** (P0 items) and **EPIC W** in **[06](06-TASK-BREAKDOWN.md)**.
4. Everything the iOS client calls is pinned to exact contracts in **[02-API-CONTRACT](02-API-CONTRACT.md)** (with an OpenAPI 3.1 sketch). Endpoints are marked **EXISTS** or **PROPOSED**.

## The account-sharing principle (read this first)

The iOS app authenticates as the **same `User`** as the web app (same email + password credentials). Voice profiles, samples, and generations are keyed by `ownerId`. Therefore a profile enrolled on iOS appears on web — and web profiles are usable on iOS — with **no sync layer**: they are literally the same rows. The only new infrastructure this requires is a mobile-friendly way to obtain and refresh a bearer token for that user (web today only has a cookie/JWT browser session plus a single API-key endpoint). This is specified in doc 01 and is the #1 web-side prerequisite.

## Document index

| Doc | Title | What it covers |
|-----|-------|----------------|
| [00-OVERVIEW.md](00-OVERVIEW.md) | Product Overview | Vision, target users, platforms/min-iOS, MVP vs Phase-2, non-goals. |
| [01-ACCOUNT-AND-AUTH.md](01-ACCOUNT-AND-AUTH.md) | Account & Authentication | Shared-account model; why the web session can't be reused; **proposed** mobile token auth (password-grant + refresh, with rotation/revoke), Sign in with Apple path, Keychain/biometric security. |
| [02-API-CONTRACT.md](02-API-CONTRACT.md) | API Contract | Full REST surface the app needs — request/response/errors/examples for **existing** and **proposed** endpoints, plus an OpenAPI 3.1 sketch. Why a versioned REST facade instead of tRPC. |
| [03-VOICE-PROFILE-AND-CLONING.md](03-VOICE-PROFILE-AND-CLONING.md) | Voice Profiles & Cloning | Enrollment/clone UX and data flow, recording guidance, **consent capture (legal must-have)**, quality scoring surfaced to users, versions/active version, sharing/lock/delete, iOS→web usability. |
| [04-TECHNICAL-ARCHITECTURE.md](04-TECHNICAL-ARCHITECTURE.md) | iOS Technical Architecture | SwiftUI stack & targets, module structure, networking layer + auth interceptor/refresh, AVFoundation capture/encoding, presigned uploads, job progress (SSE + polling fallback + APNs), playback, offline, a11y, i18n. |
| [05-WEB-SIDE-GAPS-AND-TOP-INDUSTRY-REVIEW.md](05-WEB-SIDE-GAPS-AND-TOP-INDUSTRY-REVIEW.md) | Web-Side Gaps & Top-Industry Review | Prioritized (P0/P1/P2) audit of the current web product vs top-industry voice-cloning SaaS: what must be added/fixed to support a world-class mobile experience and pass App Store review. |
| [06-TASK-BREAKDOWN.md](06-TASK-BREAKDOWN.md) | Task Breakdown | Sequenced, buildable backlog (EPICs W/I/A/P/C/G/N/X) with IDs, dependencies, acceptance criteria, sizes, and an MVP→Beta→GA critical path. |

## How these fit the existing repo docs

These sit alongside the product-wide docs in `docs/` — see [`../PRD.md`](../PRD.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../TECH_STACK.md`](../TECH_STACK.md), and [`../TASKS.md`](../TASKS.md). The iOS docs reuse their conventions (status header, tables, mermaid diagrams) and reference the real web contracts rather than restating them.

## Changelog
- 2026-07-05: v1.0 initial handoff set (00–06 + this index).
