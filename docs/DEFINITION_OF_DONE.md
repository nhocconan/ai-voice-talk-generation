# Definition of Done (DoD)

A task is **not done** until every applicable item below is true and verified. "It works on my machine" is not done.

## Universal DoD — every task

Every task, regardless of type, must satisfy:

- [ ] **D1. Code matches the task description.** No scope creep; no skipped acceptance criteria.
- [ ] **D2. Types compile with zero errors.** (`tsc --noEmit` for TS; `mypy --strict` for Python.)
- [ ] **D3. Lint is clean.** (`pnpm lint` for web; `ruff check` + `mypy` for worker.)
- [ ] **D4. Tests pass locally AND in CI.** Unit tests for new logic, integration test if it crosses a boundary (DB, queue, provider).
- [ ] **D4a. Required GitHub Actions checks are green on the branch or PR before merge.** A local pass is not enough if CI is still red.
- [ ] **D5. Coverage not regressed.** Project floor: 70% lines on changed files. New code ≥ 80%.
- [ ] **D6. Manual smoke test completed** on the feature's happy path + one edge case. Steps listed in PR body.
- [ ] **D7. Docs updated in the same PR.** PRD, ARCHITECTURE, TECH_STACK, CODING_GUIDELINES — whichever is affected. If nothing is affected, say so in the PR.
- [ ] **D8. No new security, performance, or a11y regressions** (see sub-checklists below).
- [ ] **D9. Peer reviewed and approved.** Reviewer checked the code, ran it locally when UI-affecting, and signed off.
- [ ] **D10. Task marked ☑️ in `docs/TASKS.md`** with PR link and date, in the same PR that delivers it.

## Task-type–specific DoD

### A) Backend (tRPC router / service / DB migration)
- [ ] Zod schemas on all inputs. Outputs typed.
- [ ] Authorization rule: documented in code comment above the procedure, enforced by middleware.
- [ ] DB migration applied to `main` via Prisma; rollback path noted in PR.
- [ ] Audit-log entry written for any user-visible state change (invite, role change, generation, provider edit).
- [ ] Error path returns a known error code, not a stack trace.
- [ ] If adds a new env var: `.env.example` updated and `TECH_STACK.md` env section updated.

### B) Frontend (component / page / flow)
- [ ] Responsive at 375px, 768px, 1280px, 1920px.
- [ ] Keyboard navigable; visible focus ring.
- [ ] Contrast checked against WCAG AA.
- [ ] Loading, empty, error states implemented — not just happy path.
- [ ] Copy routed through `next-intl` with both `vi` and `en` messages.
- [ ] Uses design tokens from `DESIGN_TOKENS.md`. No inline hex.
- [ ] Lighthouse perf ≥ 85 on the affected page (unless pre-existing lower baseline).
- [ ] Screenshot of the final state attached to the PR.

### C) Worker / inference pipeline
- [ ] Runs locally on Mac M-series (MPS) without errors.
- [ ] Benchmark recorded: duration to synthesize a 60-second neutral English script, stored in `docs/BENCHMARKS.md`.
- [ ] Provider passes the shared provider contract test suite (`pytest tests/providers/contract_test.py -k <provider>`).
- [ ] Cleans up temp files on success AND failure.
- [ ] Exposes Prometheus metrics for the new pipeline stage.
- [ ] Structured log events at start, end, error — with `generation_id` / `profile_id` in context.
- [ ] Memory: model cache documented; no leak over 10 consecutive jobs in the memory-leak test.

### D) Admin CP feature
- [ ] All mutations gated by role check (SUPER_ADMIN / ADMIN).
- [ ] Audit-log entry on every write.
- [ ] Sensitive fields (API keys, password hashes) never returned to client — even to admins (masked last-4 only).
- [ ] Confirm dialog on destructive actions (delete user, purge storage).
- [ ] Works with a seeded dataset of ≥ 50 users / 100 generations without visible lag.

### E) Infra / CI / deployment
- [ ] Runs locally via `docker compose up` with no manual steps beyond `.env` copy.
- [ ] CI job green on a fresh clone.
- [ ] GitHub workflow definitions do not fight repo package managers or tool versions.
- [ ] Rollback procedure documented.
- [ ] Backup job still works (if applicable).
- [ ] Secrets not committed; verified with `gitleaks` or equivalent in CI.

### F) Documentation-only task
- [ ] Spell/grammar reviewed.
- [ ] Internal links verified.
- [ ] `docs/README.md` index updated if new doc added.
- [ ] Changelog section updated at bottom of doc with date.

## Security checklist (apply to every PR)

- [ ] No secrets in code or tests.
- [ ] Input from untrusted sources validated with Zod / pydantic.
- [ ] New dependency license checked.
- [ ] No new endpoints bypass auth middleware.
- [ ] File uploads: MIME sniffed, size-capped, path-safe storage keys (no user-controlled paths).

## Performance checklist

- [ ] New server actions: no blocking work > 50 ms.
- [ ] New DB query: checked against explain plan if on a hot path; index added if needed.
- [ ] Web bundle growth ≤ 10 KB gzipped per route (flag anything above).
- [ ] Worker: no blocking I/O inside an async function without `to_thread`.

## Accessibility checklist

- [ ] Interactive elements have accessible names.
- [ ] Forms have labels and error messages linked via `aria-describedby`.
- [ ] Toast/alert regions have `role="status"` or `role="alert"`.
- [ ] Keyboard focus order matches visual order.
- [ ] No reliance on color alone to convey meaning.

## "Not Done" — common traps

These are **not** valid reasons to mark a task done:

- "Tests are flaky, I rerun and they pass." → Fix the flake or skip with an issue.
- "Will add docs in a follow-up." → Same PR or not done.
- "Works for English, will do Vietnamese later." → Not done for v1 scope (VI is primary).
- "Passes lint with a pragma disable I added." → Remove the pragma or justify with ticket.
- "Reviewer didn't look at UI but approved." → Re-request review with explicit UI pointers.

## Signing off

The author marks their own DoD checklist in the PR description. The reviewer verifies and signs off. The final ☑️ in `docs/TASKS.md` goes in with the merge commit — not before.

## Changelog
- 2026-04-19: v1.0 initial DoD.
- 2026-04-20: Added mandatory green GitHub Actions checks and workflow/toolchain consistency checks before merge.
