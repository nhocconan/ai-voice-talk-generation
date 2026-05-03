#!/usr/bin/env bash
# install-services.sh — bootstrap local dependencies, provider extras, and infra.
#
# Usage:
#   ./scripts/install-services.sh
#   ./scripts/install-services.sh --restart
#   ./scripts/install-services.sh --skip-node-install
#   ./scripts/install-services.sh --skip-worker-sync

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log()  { echo "▸ $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠  $*"; }
die()  { echo "✗  $*" >&2; exit 1; }

RESTART_DOCKER=false
SKIP_NODE_INSTALL=false
SKIP_WORKER_SYNC=false

for arg in "$@"; do
  case "$arg" in
    --restart) RESTART_DOCKER=true ;;
    --skip-node-install) SKIP_NODE_INSTALL=true ;;
    --skip-worker-sync) SKIP_WORKER_SYNC=true ;;
    *) die "Unknown flag: $arg" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker not found"
command -v pnpm >/dev/null 2>&1 || die "pnpm not found"
command -v uv >/dev/null 2>&1 || die "uv not found"

if [[ ! -f ".env" ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

if grep -q "REPLACE_ME_run_gen_secrets_sh" .env; then
  log "Generating AUTH_SECRET and SERVER_SECRET"
  ./infra/scripts/gen-secrets.sh .env
fi

set -a
source .env
set +a

if [[ "$SKIP_NODE_INSTALL" != "true" ]]; then
  log "Installing Node dependencies"
  pnpm install --frozen-lockfile
fi

if [[ "$SKIP_WORKER_SYNC" != "true" ]]; then
  log "Syncing worker dependencies with VieNeu and VoxCPM2 extras"
  (
    cd apps/worker
    uv sync --extra vieneu --extra voxcpm
  )
fi

if [[ "$RESTART_DOCKER" == "true" ]]; then
  log "Restarting Docker services"
  docker compose down
fi

log "Starting local infra services"
docker compose up -d postgres redis minio minio-init prometheus grafana

log "Generating Prisma client"
pnpm db:generate

log "Applying database migrations"
pnpm db:migrate

log "Seeding database"
pnpm db:seed

ok "Local services installed"
echo "  Web/worker are not started by this script."
echo "  Start them with:"
echo "    pnpm dev"
echo "    pnpm worker:dev"
