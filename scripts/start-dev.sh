#!/usr/bin/env bash
# start-dev.sh — Bring up the full YouNet Voice Studio development stack.
#
# Usage:
#   ./scripts/start-dev.sh           # start everything
#   ./scripts/start-dev.sh --infra   # start infra only (no web/worker)
#   ./scripts/start-dev.sh --no-worker  # start infra + web, skip worker

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "▸ $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠  $*"; }
die()  { echo "✗  $*" >&2; exit 1; }

# ── Flags ────────────────────────────────────────────────────────────────────

INFRA_ONLY=false
NO_WORKER=false
for arg in "$@"; do
  case $arg in
    --infra)      INFRA_ONLY=true ;;
    --no-worker)  NO_WORKER=true ;;
    *) warn "Unknown flag: $arg" ;;
  esac
done

# ── Prerequisites ─────────────────────────────────────────────────────────────

command -v docker  >/dev/null 2>&1 || die "docker not found"
command -v pnpm    >/dev/null 2>&1 || die "pnpm not found"

# ── 1. Check .env file ────────────────────────────────────────────────────────

ENV_FILE="apps/web/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env.local not found — copying from .env.example"
  cp .env.example "$ENV_FILE"
  warn "Edit $ENV_FILE and set AUTH_SECRET / SERVER_SECRET before continuing."
  warn "Run:  ./infra/scripts/gen-secrets.sh  to generate secrets."
fi

# Source host port overrides if present
HOST_POSTGRES_PORT=${HOST_POSTGRES_PORT:-5432}
HOST_REDIS_PORT=${HOST_REDIS_PORT:-6379}
HOST_MINIO_PORT=${HOST_MINIO_PORT:-9000}
HOST_MINIO_CONSOLE_PORT=${HOST_MINIO_CONSOLE_PORT:-9001}

# Auto-detect port conflicts and use alternates
check_port() {
  lsof -i ":$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

if check_port "$HOST_POSTGRES_PORT"; then
  warn "Port $HOST_POSTGRES_PORT in use — trying 5433 for Postgres"
  HOST_POSTGRES_PORT=5433
fi
if check_port "$HOST_REDIS_PORT"; then
  warn "Port $HOST_REDIS_PORT in use — trying 6380 for Redis"
  HOST_REDIS_PORT=6380
fi
if check_port "$HOST_MINIO_PORT"; then
  warn "Port $HOST_MINIO_PORT in use — trying 9010 for MinIO"
  HOST_MINIO_PORT=9010
  HOST_MINIO_CONSOLE_PORT=9011
fi

export HOST_POSTGRES_PORT HOST_REDIS_PORT HOST_MINIO_PORT HOST_MINIO_CONSOLE_PORT

# ── 2. Docker Compose infra ───────────────────────────────────────────────────

log "Starting infrastructure containers…"
docker compose up -d postgres redis minio
log "Waiting for healthy state…"

wait_healthy() {
  local svc="$1" max=60 i=0
  while ! docker compose ps "$svc" 2>/dev/null | grep -q "healthy"; do
    sleep 2; ((i+=2))
    [[ $i -ge $max ]] && die "$svc did not become healthy in ${max}s"
  done
  ok "$svc healthy"
}

wait_healthy postgres
wait_healthy redis

# MinIO health is slower — just wait for the port
for _ in $(seq 1 15); do
  curl -sf "http://localhost:${HOST_MINIO_PORT}/minio/health/live" >/dev/null 2>&1 && break || sleep 2
done
ok "minio reachable"

# ── 3. Update .env.local with actual ports ────────────────────────────────────

DB_URL="postgresql://voice:voice_pass@localhost:${HOST_POSTGRES_PORT}/voice_studio"
REDIS_URL="redis://localhost:${HOST_REDIS_PORT}"

# Patch .env.local in-place (portable sed)
sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" "$ENV_FILE"
sed -i.bak "s|REDIS_URL=.*|REDIS_URL=${REDIS_URL}|" "$ENV_FILE"
sed -i.bak "s|MINIO_PORT=.*|MINIO_PORT=${HOST_MINIO_PORT}|" "$ENV_FILE"
rm -f "${ENV_FILE}.bak"
ok "Updated $ENV_FILE with current ports"

# Worker .env
WORKER_ENV="apps/worker/.env"
if [[ -f "$WORKER_ENV" ]]; then
  sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=${DB_URL}|" "$WORKER_ENV"
  sed -i.bak "s|REDIS_URL=.*|REDIS_URL=${REDIS_URL}|" "$WORKER_ENV"
  rm -f "${WORKER_ENV}.bak"
fi

# ── 4. Migrate + seed ─────────────────────────────────────────────────────────

log "Running Prisma migrations…"
DATABASE_URL="$DB_URL" pnpm --filter @yng-voice/web exec prisma migrate deploy 2>&1 | grep -E "Applied|already|Nothing|pending" || true

# Seed always — `prisma db seed` is idempotent (uses upsert) and picks up newly
# added ProviderConfig rows (e.g. XIAOMI_TTS, XAI_TTS) on existing databases.
log "Seeding database (idempotent)…"
DATABASE_URL="$DB_URL" pnpm db:seed 2>&1 | tail -3
ok "Seed complete (default admin: admin@younetgroup.com / YouNet@2026 on first run)"

[[ "$INFRA_ONLY" == "true" ]] && { ok "Infrastructure ready."; exit 0; }

# ── 5. Node dependencies ──────────────────────────────────────────────────────

log "Installing Node dependencies…"
pnpm install --frozen-lockfile 2>&1 | tail -3

# ── 6. Next.js dev server ─────────────────────────────────────────────────────

WEB_PORT=${WEB_PORT:-3000}
if check_port "$WEB_PORT"; then
  WEB_PORT=3001
  warn "Port 3000 in use — using port $WEB_PORT for web"
fi

LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

log "Starting Next.js dev server on http://localhost:${WEB_PORT}…"
(cd apps/web && PORT=$WEB_PORT pnpm dev > "$LOG_DIR/web.log" 2>&1) &
WEB_PID=$!
echo "$WEB_PID" > "$LOG_DIR/web.pid"

# Wait for web server
for _ in $(seq 1 30); do
  curl -sf "http://localhost:${WEB_PORT}/api/healthz" >/dev/null 2>&1 && break || sleep 2
done
ok "Next.js ready at http://localhost:${WEB_PORT}"

# ── 7. Python worker ──────────────────────────────────────────────────────────

if [[ "$NO_WORKER" != "true" ]] && command -v uv >/dev/null 2>&1; then
  log "Starting Python worker…"
  # Forward provider API keys + tokens from the root .env into the worker process.
  # These are optional fallbacks; encrypted DB-stored keys take precedence.
  ROOT_ENV="$ROOT/.env"
  if [[ -f "$ROOT_ENV" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ROOT_ENV"
    set +a
  fi
  (
    cd apps/worker
    # Pass env vars to worker — DB/Redis/MinIO from probed ports above; provider
    # keys (HF, Google, ElevenLabs, Xiaomi, xAI) from the sourced root .env.
    DATABASE_URL="$DB_URL" \
    REDIS_URL="$REDIS_URL" \
    MINIO_ENDPOINT="localhost" \
    MINIO_PORT="${HOST_MINIO_PORT}" \
    MINIO_ACCESS_KEY="minioadmin" \
    MINIO_SECRET_KEY="minioadmin" \
    HF_TOKEN="${HF_TOKEN:-}" \
    GOOGLE_API_KEY="${GOOGLE_API_KEY:-}" \
    ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-}" \
    XIAOMI_API_KEY="${XIAOMI_API_KEY:-}" \
    XAI_API_KEY="${XAI_API_KEY:-}" \
    SERVER_SECRET="${SERVER_SECRET:-}" \
    TORCH_DEVICE="${TORCH_DEVICE:-mps}" \
    uv run python -m worker.main > "$LOG_DIR/worker.log" 2>&1
  ) &
  WORKER_PID=$!
  echo "$WORKER_PID" > "$LOG_DIR/worker.pid"
  sleep 3
  if kill -0 "$WORKER_PID" 2>/dev/null; then
    ok "Worker started (PID $WORKER_PID) — http://localhost:8001/healthz"
  else
    warn "Worker failed to start — check $LOG_DIR/worker.log"
  fi
elif [[ "$NO_WORKER" != "true" ]]; then
  warn "uv not found — skipping worker. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "┌────────────────────────────────────────────────────────┐"
echo "│  YouNet Voice Studio — Development Stack               │"
echo "├────────────────────────────────────────────────────────┤"
printf "│  %-20s  %-33s│\n" "Web app" "http://localhost:${WEB_PORT}"
printf "│  %-20s  %-33s│\n" "MinIO Console" "http://localhost:${HOST_MINIO_CONSOLE_PORT}"
printf "│  %-20s  %-33s│\n" "Logs" ".logs/"
echo "├────────────────────────────────────────────────────────┤"
echo "│  Stop with:  ./scripts/stop-dev.sh                     │"
echo "└────────────────────────────────────────────────────────┘"
