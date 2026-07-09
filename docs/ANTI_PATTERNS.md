# Anti-patterns — Voice Studio

Numbered, citable rules for bugs that already happened (or will recur).  
A rule that lives only in someone's head is a suggestion. These are **class fixes**: write the rule, fix every site, and prefer mechanical enforcement.

**Index**

| Concern | Rule | Audit | Wired |
|---|---|---|---|
| Docker / production `next build` fails on ESLint | [§1](#1-production-next-build-eslint-is-a-hard-gate) | `scripts/audit/prod-web-lint.sh` | `pnpm audit:prod-lint`, `pnpm verify`, CI `lint` |

When you fix a new recurring bug: append a numbered `§N`, add/extend an audit under `scripts/audit/`, wire it into `pnpm verify` (and CI if not already covered), update this index. Baselines only move **down**.

---

## 1. Production `next build` ESLint is a hard gate

**Incident (2026-07-09):** production Docker image build (`infra/docker/web.Dockerfile` → `pnpm --filter web build` → `next build`) failed after code was pulled. Root cause was **ESLint errors treated as compile failures**, not runtime logic:

- `@typescript-eslint/prefer-nullish-coalescing` — `||` used where empty string / nullish handling mattered (`PresentationGenerator.tsx`)
- `@typescript-eslint/no-unnecessary-type-assertion` — redundant `as ProviderName` (`admin.ts`)

`next build` runs the project ESLint config (`eslint.config.mjs`, `strictTypeChecked`). Local `next dev` does **not** fail the same way. Shipping without `pnpm lint` / `pnpm audit:prod-lint` schedules the next prod outage.

### Forbidden (class)

1. Claiming a TS/TSX change is done without lint green on `apps/web/src`.
2. Using `value || undefined` / `value || fallback` when the left side can be `""` (or other falsy non-nullish) **and** you need empty → missing. That trips `prefer-nullish-coalescing` under our strict config, or silently changes semantics if you “fix” by swapping to `??`.
3. Adding `as SomeType` when the expression is **already** that type (`no-unnecessary-type-assertion`). Prisma enums and selected fields are usually already typed.
4. Disabling ESLint rules or `eslint.ignoreDuringBuilds` to green a Docker build. That hides the class; it does not fix it.

### Required instead

| Intent | Do this | Not this |
|---|---|---|
| Default only for `null` / `undefined` | `a ?? b` | `a \|\| b` (when ESLint flags it) |
| Treat empty string as missing | `a === "" ? undefined : a` or explicit trim + empty check | `a \|\| undefined` |
| Ternary “show if either error” | `errors.a ?? errors.b` when values are objects/undefined | `errors.a \|\| errors.b` if rule flags it |
| Narrow types | Zod / `instanceof` / control flow | redundant `as T` |

### Agent / author gate (non-negotiable)

After any change under `apps/web/src/**/*.{ts,tsx}`:

```bash
pnpm audit:prod-lint
# or at least:
pnpm --filter web exec eslint src --max-warnings 0
```

Before merge / before telling anyone to `docker compose` pull-and-build prod: `pnpm verify` (includes the same lint class).

### Mechanical enforcement

- **Audit:** `scripts/audit/prod-web-lint.sh` — exits non-zero on the same ESLint surface production `next build` hits for app source.
- **CI:** `.github/workflows/ci.yml` job `lint-types` runs `pnpm lint`.
- **DoD:** `DEFINITION_OF_DONE.md` D3 + D3a.
- **Agent rules:** `AGENTS.md` § Production lint gate.

### Changelog

- 2026-07-09: §1 added after production Docker build failure on prefer-nullish-coalescing + unnecessary type assertion.
