# AGENTS.md — Voice Studio

Agent-facing project rules. Merge with behavioral guidelines below.

## Project hard rules (read before shipping code)

1. **Production lint gate (ANTI_PATTERNS §1).** Docker prod build runs `next build`, which **fails on ESLint errors**. `next dev` will not save you.
   - After any change under `apps/web/src/**/*.{ts,tsx}`, run before claiming done:
     `pnpm audit:prod-lint` (or `pnpm --filter web exec eslint src --max-warnings 0`).
   - Prefer `??` for null/undefined defaults. If empty string must become missing, use explicit `=== ""` (or trim + empty) checks — do **not** use `|| undefined` when the strict rule flags it.
   - Do not add redundant `as T` when the type is already `T`.
   - Never “fix” prod build by turning off ESLint during builds.
   - Full list + examples: `docs/ANTI_PATTERNS.md`.
2. **Verify before “done”.** Nontrivial web changes: at least `pnpm audit:prod-lint` + typecheck on touched packages. Prefer `pnpm verify` before asking anyone to pull/build prod.
3. **Surgical diffs only.** Touch only what the task requires. Project coding standards: `docs/CODING_GUIDELINES.md`. Definition of done: `docs/DEFINITION_OF_DONE.md`.

---

# Behavioral guidelines (Karpathy-style)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
