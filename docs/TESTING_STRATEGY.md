# Testing Strategy

## 1. Test pyramid

```
          /\         End-to-End (Playwright)     —  ~30 tests, core flows
         /──\
        /────\       Integration (Vitest + Testcontainers, pytest + docker)
       /──────\                                   — ~150 tests
      /────────\
     /──────────\    Unit (Vitest / pytest)       — thousands
    /────────────\
   /──────────────\  Static (tsc, mypy, ruff, eslint) — always first
```

Most bugs get caught cheapest at the static / unit layer. Invest there first.

## 2. What to test at each layer

### Static
- `tsc --noEmit`, `mypy --strict`, `ruff check`, `eslint`. Run on every save locally via editor; mandatory in CI.

### Unit (fast, isolated, no I/O)
- Pure functions (scoring, chunking, duration math, loudness target).
- Zod / pydantic schemas — parse valid + rejection cases.
- React components: render, key interactions (user-event).
- Reducers / hooks.

### Integration (with real or in-process deps)
- **Web:** tRPC procedures against a real Postgres (Testcontainers) + in-memory Redis.
- **Worker:** pipeline stages with real ffmpeg, real MinIO (local docker), real whisper/TTS on tiny models for speed.
- **Provider contracts:** every `TTSProvider` implementation runs the shared contract suite.

### E2E (browser, real stack)
- Core user flows only:
  1. Admin signs in, invites a user, user accepts, sets password.
  2. User enrolls a voice (upload path) and sees a quality score.
  3. User generates a 30-second presentation and downloads MP3.
  4. User uploads a 2-person podcast, reviews diarization, renders with 2 profiles.
  5. Super Admin edits default provider, changes retention, verifies audit log entry.

## 3. Tooling

| Layer | Web | Worker |
|---|---|---|
| Unit | Vitest | pytest |
| Property | fast-check (as needed) | hypothesis |
| Mocking | `vi.mock`, `msw` for HTTP | `pytest-mock`, `respx` for HTTPX |
| Integration | Vitest + `@testcontainers/postgresql` + ioredis-mock | pytest + docker compose fixtures |
| E2E | Playwright | — |
| Coverage | Vitest V8 reporter | `coverage.py` |
| Snapshot (limited) | Vitest (UI only for stable molecules) | — |

## 4. Coverage targets

- Project floor: **70% lines on changed files.**
- New code in this PR: **≥ 80% lines, ≥ 70% branches.**
- 100% on security-sensitive modules: auth, crypto, RBAC middleware, presigned URL signing.
- Coverage is a guardrail, not a goal. A passing test that proves behavior beats two that only touch lines.

## 5. What NOT to test

- Framework behavior (don't test Next.js or Prisma themselves).
- Auto-generated files.
- Trivial getters/setters.
- Third-party lib internals — mock the boundary.

## 6. Test hygiene

- **One logical assertion per test.** Multiple `expect`s fine if they describe one invariant.
- **Arrange-Act-Assert** structure visible. Blank lines between sections.
- **No hidden state** — each test sets up its own fixtures.
- **Deterministic.** Seed randomness. Freeze time (`vi.setSystemTime`, `freezegun`). Avoid `sleep`.
- **Fast.** Unit < 50 ms each. Integration < 2 s each. E2E < 30 s each. Flag slow tests.
- **Readable names.** `invitedUserCanAcceptWithValidTokenBelowSevenDays` beats `test1`.

## 7. Provider contract test

Every provider implementation (`XTTSProvider`, `F5Provider`, `ElevenLabsProvider`, `GeminiTTSProvider`) must pass the shared contract test:

```
tests/providers/contract_test.py:
  - test_prepare_voice_returns_handle
  - test_synthesize_returns_audio_of_expected_duration_within_10pct
  - test_synthesize_respects_language
  - test_synthesize_fails_cleanly_on_unsupported_language
  - test_close_releases_resources
```

Run with `pytest tests/providers/contract_test.py -k xtts` etc. A new provider PR must add itself to this matrix. Cloud providers run against a **VCR cassette** (recorded fixture) in CI; a weekly scheduled workflow re-records against live APIs.

## 8. Performance tests (Phase 3+)

- **Render latency benchmark:** `scripts/bench/render.py` renders a fixed 60-second script with each active provider; stores results to `docs/BENCHMARKS.md`. Run on release candidates.
- **Queue load test:** k6 script pushes 100 render jobs; asserts P95 completion time on a reference host.

## 9. Quality of voice output (human-in-loop)

Voice quality can't be fully automated. We rely on:

- **Blind MOS ratings** (internal staff, 5-point scale) collected via a dedicated `/admin/quality` page. Target ≥ 4.0 average.
- **Identity similarity:** `resemblyzer` cosine between reference sample and output embedding. Target ≥ 0.82 for same speaker. Run as part of the provider benchmark suite.

## 10. CI pipeline

```yaml
# .github/workflows/ci.yml  (sketch)
jobs:
  lint-types:
    - pnpm install
    - pnpm -r lint
    - pnpm -r typecheck
    - uv sync (worker)
    - ruff check && mypy

  web-unit:
    - pnpm --filter web test

  web-integration:
    services: postgres, redis, minio
    - pnpm --filter web test:integration

  worker-unit:
    - uv run pytest -m 'not integration'

  worker-integration:
    services: redis, minio
    - uv run pytest -m integration

  e2e:
    needs: [web-integration, worker-integration]
    - pnpm build
    - pnpm playwright install
    - pnpm e2e

  coverage-gate:
    needs: [web-unit, worker-unit]
    - verify 70% / 80% thresholds
```

All jobs block merge. Average CI time target: ≤ 12 min.

## 11. Local dev loop

- `pnpm dev` — web hot reload.
- `pnpm worker:dev` — worker hot reload.
- `pnpm test` — watch mode unit tests.
- `pnpm e2e:headed` — debug E2E visually.
- `pnpm verify` — runs lint + typecheck + unit in one command. **Run this before requesting review.**

## 12. Flaky tests policy

- A test that fails twice in 20 consecutive CI runs is **quarantined** (moved to a `@flaky` group excluded from required checks).
- Quarantine creates an issue. Must be fixed or deleted within 5 business days.
- Never retry a failing test more than twice in CI.

## Changelog
- 2026-04-19: v1.0 initial strategy.
