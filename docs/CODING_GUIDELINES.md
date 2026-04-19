# Coding Guidelines — YouNet Voice Studio

These rules are enforced by CI. PRs that violate them fail. When a rule needs an exception, add an inline comment explaining **why** and link a ticket.

## 1. Universal Principles

1. **No speculative generality.** Build what the task requires; no abstraction-for-three-similar-things-that-might-exist-later.
2. **Surgical changes.** Touch only what the task requires. Don't reformat, rename, or refactor adjacent code.
3. **Types are the spec.** Compiler + schema validate intent. Comments explain *why*, never *what*.
4. **Fail loud at boundaries, trust internals.** Validate user input, external APIs, and queue payloads. Don't validate what your own code just produced.
5. **No commented-out code.** Delete it; git has history.
6. **Feature flags only when there's a real rollout concern.** Default-on flags rot.
7. **Every public function has tests** (see `TESTING_STRATEGY.md`).

## 2. TypeScript (Next.js `apps/web`)

### 2.1 Config
- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- `"target": "ES2023"`, `"moduleResolution": "bundler"`.
- Path alias `@/*` → `./src/*`; `@contracts/*` → shared package.

### 2.2 File layout
```
src/
  app/                # Next.js App Router
    (marketing)/...
    (app)/...         # authed
    (admin)/admin/...
    api/
  server/
    routers/          # tRPC routers (one file per domain)
    services/         # Business logic (pure, no Next.js imports)
    db/               # Prisma client singleton + queries
    queue/            # BullMQ producers
    auth/             # Auth.js config
  lib/                # Browser/isomorphic utilities
  components/
    ui/               # shadcn primitives
    features/         # Domain-feature components
  styles/
```

### 2.3 Naming
- React components: `PascalCase.tsx`.
- Hooks: `useCamelCase.ts`.
- Route segments: `lower-kebab`.
- Zod schemas: `thingSchema` / `ThingInput`.
- Server actions: suffix `Action` (e.g., `inviteUserAction`).

### 2.4 Rules
- **No `any`.** Use `unknown` + narrow.
- **No `as` casts** except to widen `unknown`. Narrow via Zod/`instanceof`.
- **No default exports** (easier refactors, consistent imports). Exception: Next.js pages/layouts (framework requires default).
- **RSC by default.** Add `"use client"` only when the component uses browser APIs or hooks.
- **Never fetch data in client components.** Pass from server or use tRPC client via hook.
- **Never import `server/` from client code.** ESLint boundary rule enforces this.
- **Zod for every tRPC input.** No unchecked mutations.
- **Errors as values for expected failures** (`Result<T>` type), exceptions for programmer errors only.
- **Prefer `const` + arrow functions** for module-level code; `function` for top-level declarations when hoisting matters.

### 2.5 React
- No `useEffect` for data fetching (use RSC or tRPC).
- No prop drilling beyond two levels — lift to a context or colocate.
- Keys are stable IDs, never array indices for dynamic lists.
- `Suspense` + `ErrorBoundary` at route boundaries, not inside leaf components.

### 2.6 Database (Prisma)
- All queries live in `src/server/db/` — route handlers and tRPC call these, not Prisma directly.
- Use transactions (`prisma.$transaction`) when two writes must succeed together.
- Never `SELECT *` equivalent — specify `select` to limit columns for hot paths.
- Always index columns used in `where` / `orderBy` at p95 traffic.

### 2.7 Forbidden
- Direct `fetch()` to our own API routes — use tRPC.
- `dangerouslySetInnerHTML` without a sanitizer (DOMPurify).
- Global mutable state outside of React context / server singletons.
- `console.log` in committed code (use `pino` logger).

## 3. Python (Worker `apps/worker`)

### 3.1 Config
- Python 3.11, `uv` for deps, `pyproject.toml` is canonical.
- `ruff` with rules: `E,F,W,I,N,UP,B,A,C4,SIM,TRY,RUF`. Line length 100.
- `mypy --strict` across the package. No `# type: ignore` without a reason comment.

### 3.2 File layout
```
src/worker/
  __init__.py
  main.py                      # FastAPI app + consumer boot
  config.py                    # pydantic Settings from env
  queue.py                     # Redis Streams consumer
  logging.py                   # structlog setup
  providers/
    base.py                    # TTSProvider protocol
    xtts.py
    f5.py
    elevenlabs.py
    gemini.py
    registry.py                # provider factory from ProviderConfig
  pipelines/
    ingest.py                  # enrollment normalize + score
    asr.py                     # faster-whisper + pyannote
    render.py                  # chunker + synth + stitch + encode
  audio/
    io.py                      # ffmpeg wrappers
    loudness.py
    quality.py
    stitch.py
  llm/
    gemini.py                  # script drafting, pacing
  services/
    storage.py                 # MinIO via presigned URLs
    crypto.py                  # PyNaCl sealed-box
  tests/
```

### 3.3 Rules
- **All functions typed.** `def f(x: int) -> str:`. No untyped `def f(x):`.
- **`async def` all the way down** for I/O. Never call blocking I/O from async code — wrap in `asyncio.to_thread`.
- **pydantic models** for every queue payload, HTTP body, settings blob.
- **No bare `except:`.** Catch specific exceptions.
- **No `print`.** Use `structlog.get_logger()`.
- **No global state** except: `settings` (immutable), `logger`, model caches keyed by model ID. Caches are explicit, with documented TTL.
- **Model loading is lazy + cached** — load on first job, reuse across jobs in the same worker process.
- **File paths are `pathlib.Path`**, never raw strings.
- **Subprocess (ffmpeg)** via `asyncio.create_subprocess_exec` with argument list (never shell=True).

### 3.4 GPU/Device handling
- `torch.device` resolved from `settings.torch_device` at startup, passed explicitly to model loaders.
- Worker logs device at startup.
- If CUDA requested but not available → fail fast, don't silently fall back (prod expects GPU).

### 3.5 Forbidden
- `eval`, `exec`, `pickle.load` of untrusted data.
- HTTP calls via `requests` (blocking) — use `httpx.AsyncClient`.
- Swallowing exceptions to keep the worker "alive" — let it crash and let the consumer retry with backoff.

## 4. Git & PR Hygiene

### 4.1 Branches
- `main` is protected. Always green.
- Feature branches: `feat/<short-slug>`, fixes: `fix/<slug>`, chores: `chore/<slug>`.
- One logical change per PR. If you have to say "also", split it.

### 4.2 Commits
- Conventional Commits: `feat(scope): …`, `fix(scope): …`, `chore(scope): …`, `docs:`, `test:`, `refactor:`.
- Subject ≤ 72 chars, imperative.
- Body explains *why* when non-obvious. Link the task ID from `TASKS.md`.

### 4.3 PR description template (required)
```
## What
<1–3 bullets of what changed>

## Why
<link to TASKS.md task id, PRD section, or issue>

## How to test
<steps>

## Definition of Done checklist
- [ ] Tests added/updated and passing
- [ ] Types/lint green
- [ ] Docs updated in same PR (if behavior changed)
- [ ] Manual smoke done on relevant flow
- [ ] No new secrets / no licensing regressions
- [ ] Task marked ☑️ in docs/TASKS.md
```

### 4.4 Reviews
- At least one reviewer; for schema/infra changes, SUPER_ADMIN equivalent.
- Reviewer runs the app locally for UI-affecting PRs — don't rubber-stamp visual work.
- If review takes > 2 days, flag in standup.

## 5. Dependencies

- Before adding a new dep: check `TECH_STACK.md`. If it duplicates existing functionality, justify in PR.
- Check license (see `TECH_STACK.md §License Review`).
- Prefer mature, maintained packages (>1 yr old, >1k stars, last release <6 mo, unless niche).
- Pin exact versions in both `package.json` (no `^`) and `pyproject.toml`.
- Renovate bot opens upgrade PRs; upgrade policy in `TECH_STACK.md`.

## 6. Security Rules

- **Never log secrets, tokens, passwords, full API keys, or user reference audio paths.**
- Mask API keys in Admin CP UI (last 4 chars only).
- CSRF token on every mutating tRPC call (Auth.js handles it).
- All user-provided file uploads go through MIME sniffing + size cap + virus scan (clamav in Phase 3).
- SQL — only via Prisma. No raw queries without `$queryRaw` + explicit parameterization and a review.
- Output escaping — never build HTML strings; use React.

## 7. Performance Rules

- Web bundle budget: ≤ 180 KB gzipped per route (enforced by `@next/bundle-analyzer` in CI).
- No synchronous work > 50 ms in a server action — push to queue.
- Worker: measure model load vs. synth time; if load > 10× synth, fix caching.
- DB queries: no N+1. Use Prisma `include` with care; add dataloader if needed.

## 8. Accessibility Rules

- Every interactive element reachable by keyboard.
- Focus ring not removed (design system provides one).
- Form inputs have labels; decorative images `alt=""`.
- Color contrast ≥ 4.5:1 for body text; test with Lighthouse in CI.
- Toasts/alerts have ARIA live regions.

## 9. Internationalization Rules

- No hardcoded user-facing strings. Every string flows through `next-intl`.
- Message keys: `domain.component.purpose` (e.g., `enroll.recorder.startButton`).
- Vietnamese is the primary locale; English mirrors it. No language-specific branching in components.
- Dates: `Intl.DateTimeFormat` with user's locale. Times UTC on server, local on client.

## 10. Design-System Adherence

- Use tokens from `docs/DESIGN_TOKENS.md` (CSS variables / Tailwind config) — no raw hex values in components.
- New component variants go through design review before merge.
- `DESIGN.md` "Don't" rules are hard rules, not suggestions.

## 11. Documentation Rules

- Public functions/modules have a one-line docstring/JSDoc when purpose isn't obvious from the name.
- `README.md` in any package/app explains: what it is, how to run, how to test, key env vars.
- Architecture-level changes update `docs/ARCHITECTURE.md` in the same PR.

## Changelog
- 2026-04-19: v1.0 initial guidelines.
