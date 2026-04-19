# Workflow — From Task to Merged

This document describes the **task lifecycle**. Its purpose: no task gets marked done until it's safe to merge without breaking the system.

## 1. States

Each task in `TASKS.md` moves through these states (checkbox indicator in brackets):

| State | Indicator | Meaning |
|---|---|---|
| Backlog | `[ ]` | Not started. |
| In Progress | `[~]` | Branch exists, author working. |
| In Review | `[?]` | PR open, awaiting review. |
| Blocked | `[!]` | Waiting on dependency / decision. Note reason inline. |
| Done | `[x]` | Merged to `main`, DoD verified. |

## 2. Lifecycle

### Step 1 — Pick
- Only pick a task when previous phase's blockers are cleared.
- Update `TASKS.md`: change `[ ]` → `[~]`, add your name, date started.
- Commit and push that update as the first commit on your branch.

### Step 2 — Branch
- Branch from latest `main`.
- Name: `feat/<task-id>-<slug>`, `fix/<task-id>-<slug>`, etc.
- Example: `feat/P1-04-voice-profile-model`.

### Step 3 — Build
- Read the task's **acceptance criteria** in `TASKS.md` before writing code.
- Read the relevant DoD (Universal + task-type specific).
- Follow `CODING_GUIDELINES.md`.
- Commit early, commit small. Every commit passes lint and typecheck.

### Step 4 — Self-verify (before opening PR)
Run locally, in this order:
1. `pnpm verify` — lint + typecheck + unit tests.
2. `pnpm test:integration` (or worker equivalent).
3. Manual smoke on the flow you changed.
4. If UI: open in browser at 375px + 1280px, keyboard-only walkthrough.
5. Check your diff one more time. Remove stray `console.log`, commented code, unused imports.

If any step fails, fix before opening PR. **Do not ask reviewers to catch things you could have caught.**

### Step 5 — Open PR
- Fill out the PR template (see `CODING_GUIDELINES.md §4.3`).
- Update `TASKS.md`: `[~]` → `[?]`, link the PR.
- Tag one reviewer. Add screenshots for UI.
- If the PR is > 400 lines of changed code (excluding lock files, generated), split it or justify.

### Step 6 — Test gate
- CI must be green. If red, fix before re-requesting review.
- Coverage gate must pass (see `TESTING_STRATEGY.md §4`).

### Step 7 — Review
Reviewer runs this checklist:

- [ ] Diff matches task scope (nothing extra).
- [ ] Code readable; names match domain.
- [ ] Tests actually test behavior, not implementation.
- [ ] DoD checklist in PR is truthful — spot-check 2 items.
- [ ] If UI: pulled the branch, ran locally, clicked through.
- [ ] Docs updated where behavior changed.
- [ ] No security regressions (secrets, auth bypass, input validation).

If reviewer requests changes:
- Author addresses inline. No "fixup" squash — each change is a real commit until final squash at merge.
- Re-request review. Reviewer sees the delta, not the whole PR again.

### Step 8 — Merge
- **Squash-and-merge** into `main`. Subject follows Conventional Commits. Body references task id.
- Reviewer (or author with approval) merges.

### Step 9 — Mark done
- In the **merge commit or a follow-up commit on `main`**, update `TASKS.md`:
  - Change `[?]` → `[x]`.
  - Append `· merged <YYYY-MM-DD> · <PR link>`.
- This is part of Definition of Done (`D10`). A task is not done until this is on `main`.

### Step 10 — Watch
- For the next 24 hours, the author monitors: Sentry errors, queue metrics, user reports (Telegram / Slack channel).
- If a regression surfaces, revert first, fix second. "Roll forward with a hotfix" only if the fix is trivial and obvious.

## 3. Blocked tasks

If a task is blocked:
- Update `TASKS.md`: `[~]` → `[!]`, add one-line reason inline: e.g. `[!] waiting on Gemini API approval (2026-04-21)`.
- Create or link the blocking task. Work on something else.
- When unblocked, move back to `[~]` and carry on.

## 4. Emergency changes (hotfix)

When production is broken:
1. Branch from `main`: `hotfix/<slug>`.
2. Smallest possible fix. No refactor.
3. Tests added proving the fix.
4. Fast-track review — any qualified reviewer.
5. Merge, deploy, monitor.
6. Follow up with a full post-mortem task added to `TASKS.md` under "Phase 0 — Operational".

## 5. Task granularity guidance

A good task:
- Has clear, testable acceptance criteria.
- Fits in ≤ 2 days of work (roughly ≤ 400 lines of diff).
- Is independently mergeable without breaking `main`.

If a task seems bigger, split it **before** starting. A 5-day PR is a review nightmare and tends to rot.

## 6. Running list of in-flight rules

- One task `[~]` per person at a time. Finish or block before picking the next.
- No `[?]` older than 5 business days without explicit nudge in standup.
- Friday-before-weekend deploys only for hotfixes.

## 7. Roles

| Role | Responsibility |
|---|---|
| Author | Writes code, tests, docs; self-verifies; fills PR template; updates TASKS. |
| Reviewer | Runs the review checklist; blocks merge if DoD unmet. |
| Super Admin | Owns schema migrations, provider configs, security reviews. |
| Release captain (rotates) | Final merge + post-merge watch for the day's PRs. |

## 8. What to do when unsure

- If acceptance criteria are ambiguous → ask in the task thread before coding. Don't guess.
- If a rule blocks you and you think it shouldn't → propose a PR to `docs/` first; don't ship the exception silently.
- If you broke `main` → revert immediately. Apology optional; revert mandatory.

## Changelog
- 2026-04-19: v1.0 initial workflow.
