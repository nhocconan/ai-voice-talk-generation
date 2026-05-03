#!/usr/bin/env bash
# uninstall-services.sh — stop local infra and optionally delete local data.
#
# Usage:
#   ./scripts/uninstall-services.sh
#   ./scripts/uninstall-services.sh --purge-data

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log()  { echo "▸ $*"; }
ok()   { echo "✓ $*"; }
die()  { echo "✗  $*" >&2; exit 1; }

PURGE_DATA=false

for arg in "$@"; do
  case "$arg" in
    --purge-data) PURGE_DATA=true ;;
    *) die "Unknown flag: $arg" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker not found"

log "Stopping local infra services"
docker compose down

if [[ "$PURGE_DATA" == "true" ]]; then
  log "Removing Docker volumes and local infra data"
  docker compose down -v --remove-orphans || true
  rm -rf infra/volumes/postgres infra/volumes/redis infra/volumes/minio infra/volumes/prometheus infra/volumes/grafana infra/volumes/caddy
fi

ok "Local services removed"
