#!/usr/bin/env bash
# Anti-pattern §1 — Production next build ESLint is a hard gate.
# Mirrors the ESLint surface that fails Docker `pnpm --filter web build`
# (next build lints app source under apps/web/src).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "audit §1: ESLint apps/web/src (production next-build gate)"
echo "  rule: docs/ANTI_PATTERNS.md §1"
echo "  fix:  prefer ?? for nullish; use explicit === \"\" checks for empty→missing;"
echo "        drop redundant \`as T\`; do not disable rules to ship"

pnpm --filter web exec eslint src --max-warnings 0

echo "audit §1: OK"
