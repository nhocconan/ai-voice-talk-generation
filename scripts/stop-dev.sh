#!/usr/bin/env bash
# stop-dev.sh — Gracefully stop the YouNet Voice Studio development stack.
#
# Usage:
#   ./scripts/stop-dev.sh           # stop web + worker, leave infra running
#   ./scripts/stop-dev.sh --all     # stop web + worker + Docker infra
#   ./scripts/stop-dev.sh --infra   # stop infra only

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log()  { echo "▸ $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠  $*"; }

STOP_INFRA=false
INFRA_ONLY=false
for arg in "$@"; do
  case $arg in
    --all)    STOP_INFRA=true ;;
    --infra)  INFRA_ONLY=true; STOP_INFRA=true ;;
    *) warn "Unknown flag: $arg" ;;
  esac
done

LOG_DIR="$ROOT/.logs"

# ── Stop web server ───────────────────────────────────────────────────────────

stop_pid_file() {
  local pidfile="$1" label="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      log "Stopping $label (PID $pid)…"
      kill "$pid" 2>/dev/null || true
      # Wait up to 5s for clean exit
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 "$pid" 2>/dev/null || true
      ok "$label stopped"
    else
      warn "$label PID $pid not running"
    fi
    rm -f "$pidfile"
  else
    warn "No PID file for $label"
  fi
}

if [[ "$INFRA_ONLY" != "true" ]]; then
  stop_pid_file "$LOG_DIR/web.pid" "Next.js web server"
  stop_pid_file "$LOG_DIR/worker.pid" "Python worker"

  # Also kill any stray next dev / uvicorn processes in case pid files are stale
  pkill -f "next dev" 2>/dev/null && ok "Killed stray next dev process" || true
  pkill -f "worker.main" 2>/dev/null && ok "Killed stray worker process" || true
fi

# ── Stop Docker infrastructure ────────────────────────────────────────────────

if [[ "$STOP_INFRA" == "true" ]]; then
  log "Stopping Docker Compose services…"
  docker compose down
  ok "Infrastructure stopped"
else
  echo ""
  echo "  Infrastructure containers still running."
  echo "  Stop them with:  ./scripts/stop-dev.sh --all"
fi

echo ""
ok "Done."
