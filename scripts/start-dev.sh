#!/usr/bin/env bash
# start-dev.sh — Bring up the full Voice Studio development stack.
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

# ── Port helpers ──────────────────────────────────────────────────────────────
# Bug this section fixes: the old script treated OUR own compose listeners as
# conflicts, jumped to a single alternate (9010), and failed when that alternate
# was held by a sibling project (e.g. yng-voice-talk-presentation on 9010).

PROJECT_NAME="$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')"

is_port_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

# True when some container whose name starts with this compose project (or a
# known legacy alias for the same app) publishes the host port.
is_our_compose_port() {
  local port="$1"
  local names
  names="$(docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null || true)"
  [[ -z "$names" ]] && return 1
  # Match project-prefixed containers binding :port->
  echo "$names" | awk -v p=":$port->" -v proj="$PROJECT_NAME" '
    index($0, p) && (index($1, proj) || index($1, "voice-talk-presentation") || index($1, "yng-voice")) {
      found=1
    }
    END { exit found ? 0 : 1 }
  '
}

# Prefer default. If busy by foreign process, walk a candidate list. Reuse ports
# already published by our own compose project instead of remapping.
pick_port() {
  local label="$1"
  shift
  local preferred="$1"
  local candidate
  for candidate in "$@"; do
    if ! is_port_listening "$candidate"; then
      if [[ "$candidate" != "$preferred" ]]; then
        warn "Port $preferred busy for $label — using free port $candidate"
      fi
      echo "$candidate"
      return 0
    fi
    if is_our_compose_port "$candidate"; then
      if [[ "$candidate" != "$preferred" ]]; then
        warn "Port $candidate already used by our infra for $label — reusing"
      else
        log "Port $candidate already held by our $label container — reusing"
      fi
      echo "$candidate"
      return 0
    fi
  done
  die "No free host port for $label (tried: $*). Stop the conflicting process or set HOST_*_PORT."
}

# ── Local port block (3810+) ──────────────────────────────────────────────────
# Fixed range so this stack never fights other apps on 3000/5432/6379/9000/8001.
#
#   3810  Next.js web
#   3811  Python worker
#   3812  Postgres
#   3813  Redis
#   3814  MinIO API
#   3815  MinIO console
#
# Override any single port via env (WEB_PORT, WORKER_PORT, HOST_*_PORT).
# If a preferred port is taken by a foreign process, we walk +10 offsets.

WEB_PORT="${WEB_PORT:-3810}"
WORKER_PORT="${WORKER_PORT:-3811}"
HOST_POSTGRES_PORT="${HOST_POSTGRES_PORT:-3812}"
HOST_REDIS_PORT="${HOST_REDIS_PORT:-3813}"
HOST_MINIO_PORT="${HOST_MINIO_PORT:-3814}"
HOST_MINIO_CONSOLE_PORT="${HOST_MINIO_CONSOLE_PORT:-3815}"

WEB_PORT="$(pick_port web "$WEB_PORT" "$WEB_PORT" $((WEB_PORT + 10)) $((WEB_PORT + 20)) $((WEB_PORT + 30)))"
WORKER_PORT="$(pick_port worker "$WORKER_PORT" "$WORKER_PORT" $((WORKER_PORT + 10)) $((WORKER_PORT + 20)) $((WORKER_PORT + 30)))"
HOST_POSTGRES_PORT="$(pick_port postgres "$HOST_POSTGRES_PORT" "$HOST_POSTGRES_PORT" $((HOST_POSTGRES_PORT + 10)) $((HOST_POSTGRES_PORT + 20)) $((HOST_POSTGRES_PORT + 30)))"
HOST_REDIS_PORT="$(pick_port redis "$HOST_REDIS_PORT" "$HOST_REDIS_PORT" $((HOST_REDIS_PORT + 10)) $((HOST_REDIS_PORT + 20)) $((HOST_REDIS_PORT + 30)))"
HOST_MINIO_PORT="$(pick_port minio-api "$HOST_MINIO_PORT" "$HOST_MINIO_PORT" $((HOST_MINIO_PORT + 10)) $((HOST_MINIO_PORT + 20)) $((HOST_MINIO_PORT + 30)))"
HOST_MINIO_CONSOLE_PORT="$(pick_port minio-console "$HOST_MINIO_CONSOLE_PORT" "$HOST_MINIO_CONSOLE_PORT" $((HOST_MINIO_CONSOLE_PORT + 10)) $((HOST_MINIO_CONSOLE_PORT + 20)) $((HOST_MINIO_CONSOLE_PORT + 30)))"

if [[ "$HOST_MINIO_PORT" == "$HOST_MINIO_CONSOLE_PORT" ]]; then
  HOST_MINIO_CONSOLE_PORT="$(pick_port minio-console "$((HOST_MINIO_PORT + 1))" "$((HOST_MINIO_PORT + 1))" $((HOST_MINIO_PORT + 11)) $((HOST_MINIO_PORT + 21)))"
fi

export WEB_PORT WORKER_PORT HOST_POSTGRES_PORT HOST_REDIS_PORT HOST_MINIO_PORT HOST_MINIO_CONSOLE_PORT
ok "Port block → web:$WEB_PORT worker:$WORKER_PORT postgres:$HOST_POSTGRES_PORT redis:$HOST_REDIS_PORT minio:$HOST_MINIO_PORT console:$HOST_MINIO_CONSOLE_PORT"

# ── 2. Docker Compose infra ───────────────────────────────────────────────────

# If this project's containers are bound to the old 5432/6379/9000 block (or any
# other ports), recreate them on the 3810+ map. compose up alone won't rebind.
current_pg="$(docker compose port postgres 5432 2>/dev/null | awk -F: 'NF{print $NF; exit}' || true)"
if [[ -n "${current_pg:-}" && "$current_pg" != "$HOST_POSTGRES_PORT" ]]; then
  warn "Infra currently on postgres host :$current_pg — recreating on :$HOST_POSTGRES_PORT block"
  docker compose down --remove-orphans >/dev/null 2>&1 || true
fi

# Drop half-created containers left by a previous failed bind (status=Created).
stale="$(docker compose ps -a --format '{{.Name}} {{.Status}}' 2>/dev/null | awk '/Created|Exited/ {print $1}' || true)"
if [[ -n "${stale:-}" ]]; then
  warn "Removing stale compose containers from a previous failed start…"
  # shellcheck disable=SC2086
  docker rm -f $stale >/dev/null 2>&1 || true
fi

start_infra() {
  log "Starting infrastructure containers…"
  docker compose up -d postgres redis minio
}

if ! start_infra; then
  warn "docker compose up failed — diagnosing port binds and retrying once…"
  docker compose ps -a || true
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  HOST_POSTGRES_PORT="$(pick_port postgres 3812 3812 3822 3832 3842)"
  HOST_REDIS_PORT="$(pick_port redis 3813 3813 3823 3833 3843)"
  HOST_MINIO_PORT="$(pick_port minio-api 3814 3814 3824 3834 3844)"
  HOST_MINIO_CONSOLE_PORT="$(pick_port minio-console 3815 3815 3825 3835 3845)"
  export HOST_POSTGRES_PORT HOST_REDIS_PORT HOST_MINIO_PORT HOST_MINIO_CONSOLE_PORT
  warn "Retry ports → postgres:$HOST_POSTGRES_PORT redis:$HOST_REDIS_PORT minio:$HOST_MINIO_PORT console:$HOST_MINIO_CONSOLE_PORT"
  start_infra || die "Infrastructure failed to start after retry. Check: docker ps; lsof -iTCP -sTCP:LISTEN"
fi

log "Waiting for healthy state…"

wait_healthy() {
  local svc="$1" max=90 i=0
  while ! docker compose ps "$svc" 2>/dev/null | grep -q "healthy"; do
    # Fail fast if container exited
    if docker compose ps "$svc" 2>/dev/null | grep -Eqi "Exit|exited|dead"; then
      docker compose logs --tail=40 "$svc" || true
      die "$svc exited — see logs above"
    fi
    sleep 2; ((i+=2))
    [[ $i -ge $max ]] && {
      docker compose logs --tail=40 "$svc" || true
      die "$svc did not become healthy in ${max}s"
    }
  done
  ok "$svc healthy"
}

wait_healthy postgres
wait_healthy redis

# MinIO health is slower — wait for the live endpoint on the chosen host port.
minio_ok=false
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:${HOST_MINIO_PORT}/minio/health/live" >/dev/null 2>&1; then
    minio_ok=true
    break
  fi
  sleep 2
done
if [[ "$minio_ok" != "true" ]]; then
  docker compose logs --tail=40 minio || true
  die "minio not reachable on localhost:${HOST_MINIO_PORT}"
fi
ok "minio reachable on :${HOST_MINIO_PORT}"

# ── 3. Update .env.local with actual ports ────────────────────────────────────

DB_URL="postgresql://voice:voice_pass@localhost:${HOST_POSTGRES_PORT}/voice_studio"
REDIS_URL="redis://localhost:${HOST_REDIS_PORT}"

# Patch / upsert key=value in an env file (portable, no GNU sed needed).
upsert_env() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

upsert_env "$ENV_FILE" "DATABASE_URL" "$DB_URL"
upsert_env "$ENV_FILE" "REDIS_URL" "$REDIS_URL"
upsert_env "$ENV_FILE" "MINIO_ENDPOINT" "localhost"
upsert_env "$ENV_FILE" "MINIO_PORT" "$HOST_MINIO_PORT"
upsert_env "$ENV_FILE" "NEXT_PUBLIC_APP_URL" "http://localhost:${WEB_PORT}"
upsert_env "$ENV_FILE" "WORKER_URL" "http://localhost:${WORKER_PORT}"
upsert_env "$ENV_FILE" "HOST_POSTGRES_PORT" "$HOST_POSTGRES_PORT"
upsert_env "$ENV_FILE" "HOST_REDIS_PORT" "$HOST_REDIS_PORT"
upsert_env "$ENV_FILE" "HOST_MINIO_PORT" "$HOST_MINIO_PORT"
upsert_env "$ENV_FILE" "HOST_MINIO_CONSOLE_PORT" "$HOST_MINIO_CONSOLE_PORT"
rm -f "${ENV_FILE}.bak"
ok "Updated $ENV_FILE with 3810+ port block"

# Always write worker .env so pydantic Settings (env_file=".env") cannot fall
# back to hard-coded 6379/9000 after we moved local ports to the 3810+ block.
WORKER_ENV="apps/worker/.env"
touch "$WORKER_ENV"
upsert_env "$WORKER_ENV" "DATABASE_URL" "$DB_URL"
upsert_env "$WORKER_ENV" "REDIS_URL" "$REDIS_URL"
upsert_env "$WORKER_ENV" "MINIO_ENDPOINT" "localhost"
upsert_env "$WORKER_ENV" "MINIO_PORT" "$HOST_MINIO_PORT"
upsert_env "$WORKER_ENV" "MINIO_ACCESS_KEY" "minioadmin"
upsert_env "$WORKER_ENV" "MINIO_SECRET_KEY" "minioadmin"
upsert_env "$WORKER_ENV" "MINIO_BUCKET" "voice-studio"
upsert_env "$WORKER_ENV" "WORKER_PORT" "$WORKER_PORT"
upsert_env "$WORKER_ENV" "TORCH_DEVICE" "${TORCH_DEVICE:-mps}"
rm -f "${WORKER_ENV}.bak"
ok "Updated $WORKER_ENV with 3810+ port block"

# ── 4. Migrate + seed ─────────────────────────────────────────────────────────

log "Running Prisma migrations…"
DATABASE_URL="$DB_URL" pnpm --filter @yng-voice/web exec prisma migrate deploy 2>&1 | grep -E "Applied|already|Nothing|pending|Error" || true

# Seed always — `prisma db seed` is idempotent (uses upsert) and picks up newly
# added ProviderConfig rows (e.g. XIAOMI_TTS, XAI_TTS) on existing databases.
log "Seeding database (idempotent)…"
DATABASE_URL="$DB_URL" pnpm db:seed 2>&1 | tail -5
ok "Seed complete (default admin: admin@demo.demo / Demo1234 on first run)"

[[ "$INFRA_ONLY" == "true" ]] && { ok "Infrastructure ready."; exit 0; }

# ── 5. Node dependencies ──────────────────────────────────────────────────────

log "Installing Node dependencies…"
pnpm install --frozen-lockfile 2>&1 | tail -5

# ── 6. Next.js dev server ─────────────────────────────────────────────────────

LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

# Stop previous web/worker from this project so restarts are clean.
if [[ -f "$LOG_DIR/web.pid" ]]; then
  old_pid="$(cat "$LOG_DIR/web.pid" 2>/dev/null || true)"
  if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" 2>/dev/null; then
    log "Stopping previous Next.js (PID $old_pid)…"
    kill "$old_pid" 2>/dev/null || true
    sleep 1
    kill -9 "$old_pid" 2>/dev/null || true
  fi
  rm -f "$LOG_DIR/web.pid"
fi
if [[ -f "$LOG_DIR/worker.pid" ]]; then
  old_pid="$(cat "$LOG_DIR/worker.pid" 2>/dev/null || true)"
  if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" 2>/dev/null; then
    log "Stopping previous worker (PID $old_pid)…"
    kill "$old_pid" 2>/dev/null || true
    sleep 1
    kill -9 "$old_pid" 2>/dev/null || true
  fi
  rm -f "$LOG_DIR/worker.pid"
fi

# Re-check web port after killing previous process (may free 3810).
if is_port_listening "$WEB_PORT" && ! is_our_compose_port "$WEB_PORT"; then
  WEB_PORT="$(pick_port web "$WEB_PORT" "$WEB_PORT" $((WEB_PORT + 10)) $((WEB_PORT + 20)) $((WEB_PORT + 30)))"
  upsert_env "$ENV_FILE" "NEXT_PUBLIC_APP_URL" "http://localhost:${WEB_PORT}"
  rm -f "${ENV_FILE}.bak"
fi

log "Starting Next.js dev server on http://localhost:${WEB_PORT}…"
(cd apps/web && PORT=$WEB_PORT pnpm dev > "$LOG_DIR/web.log" 2>&1) &
WEB_PID=$!
echo "$WEB_PID" > "$LOG_DIR/web.pid"

# Wait for web server
web_ok=false
for _ in $(seq 1 45); do
  if curl -sf "http://localhost:${WEB_PORT}/api/healthz" >/dev/null 2>&1; then
    web_ok=true
    break
  fi
  # Bail if process died
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    tail -40 "$LOG_DIR/web.log" || true
    die "Next.js process exited — see $LOG_DIR/web.log"
  fi
  sleep 2
done
if [[ "$web_ok" != "true" ]]; then
  tail -40 "$LOG_DIR/web.log" || true
  die "Next.js did not become ready on :${WEB_PORT}"
fi
ok "Next.js ready at http://localhost:${WEB_PORT}"

# ── 7. Python worker ──────────────────────────────────────────────────────────

if [[ "$NO_WORKER" != "true" ]] && command -v uv >/dev/null 2>&1; then
  log "Starting Python worker…"
  # Pull optional provider keys from root .env WITHOUT clobbering the local
  # 3810+ port block (never `set -a; source` — that overwrote REDIS_URL→6379).
  ROOT_ENV="$ROOT/.env"
  if [[ -f "$ROOT_ENV" ]]; then
    HF_TOKEN="${HF_TOKEN:-$(grep -E '^HF_TOKEN=' "$ROOT_ENV" 2>/dev/null | head -1 | cut -d= -f2-)}"
    GOOGLE_API_KEY="${GOOGLE_API_KEY:-$(grep -E '^GOOGLE_API_KEY=' "$ROOT_ENV" 2>/dev/null | head -1 | cut -d= -f2-)}"
    ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-$(grep -E '^ELEVENLABS_API_KEY=' "$ROOT_ENV" 2>/dev/null | head -1 | cut -d= -f2-)}"
    XIAOMI_API_KEY="${XIAOMI_API_KEY:-$(grep -E '^XIAOMI_API_KEY=' "$ROOT_ENV" 2>/dev/null | head -1 | cut -d= -f2-)}"
    XAI_API_KEY="${XAI_API_KEY:-$(grep -E '^XAI_API_KEY=' "$ROOT_ENV" 2>/dev/null | head -1 | cut -d= -f2-)}"
    SERVER_SECRET="${SERVER_SECRET:-$(grep -E '^SERVER_SECRET=' "$ROOT_ENV" 2>/dev/null | head -1 | cut -d= -f2-)}"
    TORCH_DEVICE="${TORCH_DEVICE:-$(grep -E '^TORCH_DEVICE=' "$ROOT_ENV" 2>/dev/null | head -1 | cut -d= -f2-)}"
  fi
  # Freeze the 3810+ block into locals so nothing below can rewrite them.
  local_db_url="$DB_URL"
  local_redis_url="$REDIS_URL"
  local_minio_port="$HOST_MINIO_PORT"
  local_worker_port="$WORKER_PORT"
  if is_port_listening "$local_worker_port" && ! is_our_compose_port "$local_worker_port"; then
    local_worker_port="$(pick_port worker "$local_worker_port" "$local_worker_port" $((local_worker_port + 10)) $((local_worker_port + 20)) $((local_worker_port + 30)))"
    WORKER_PORT="$local_worker_port"
    upsert_env "$ENV_FILE" "WORKER_URL" "http://localhost:${WORKER_PORT}"
    upsert_env "$WORKER_ENV" "WORKER_PORT" "$WORKER_PORT"
    rm -f "${ENV_FILE}.bak" "${WORKER_ENV}.bak"
  fi
  (
    cd apps/worker
    # Explicit env only — never inherit a stale REDIS_URL=6379 from the shell.
    env -i \
      PATH="$PATH" \
      HOME="$HOME" \
      USER="${USER:-}" \
      LANG="${LANG:-en_US.UTF-8}" \
      DATABASE_URL="$local_db_url" \
      REDIS_URL="$local_redis_url" \
      MINIO_ENDPOINT="localhost" \
      MINIO_PORT="$local_minio_port" \
      MINIO_ACCESS_KEY="minioadmin" \
      MINIO_SECRET_KEY="minioadmin" \
      MINIO_BUCKET="voice-studio" \
      WORKER_PORT="$local_worker_port" \
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
    ok "Worker started (PID $WORKER_PID) — http://localhost:${local_worker_port}/healthz  redis=${local_redis_url}"
  else
    warn "Worker failed to start — check $LOG_DIR/worker.log"
    tail -30 "$LOG_DIR/worker.log" || true
  fi
elif [[ "$NO_WORKER" != "true" ]]; then
  warn "uv not found — skipping worker. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "┌────────────────────────────────────────────────────────┐"
echo "│  Voice Studio — Development Stack                      │"
echo "├────────────────────────────────────────────────────────┤"
printf "│  %-20s  %-33s│\n" "Web app" "http://localhost:${WEB_PORT}"
printf "│  %-20s  %-33s│\n" "Worker" "http://localhost:${WORKER_PORT}"
printf "│  %-20s  %-33s│\n" "Postgres" "localhost:${HOST_POSTGRES_PORT}"
printf "│  %-20s  %-33s│\n" "Redis" "localhost:${HOST_REDIS_PORT}"
printf "│  %-20s  %-33s│\n" "MinIO API" "localhost:${HOST_MINIO_PORT}"
printf "│  %-20s  %-33s│\n" "MinIO Console" "http://localhost:${HOST_MINIO_CONSOLE_PORT}"
printf "│  %-20s  %-33s│\n" "Logs" ".logs/"
echo "├────────────────────────────────────────────────────────┤"
echo "│  Port block 3810+ (override via WEB_PORT / HOST_*_PORT)│"
echo "│  Stop with:  ./scripts/stop-dev.sh                     │"
echo "└────────────────────────────────────────────────────────┘"
