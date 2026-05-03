# Deployment Guide — YouNet Voice Studio

This project now has two serious local-provider lanes:

- `VieNeu-TTS`: primary Mac-first Vietnamese cloning path.
- `VoxCPM2`: advanced-quality lane, best on CUDA and best-effort on Mac.

`XTTS-v2`, `F5-TTS`, `ElevenLabs`, `Gemini TTS`, `Xiaomi MiMo TTS`, and `xAI Grok TTS` remain supported as fallbacks. `VibeVoice` stays research-only.

## 1. Supported deployment lanes

| Lane | Host | Provider target | Notes |
|---|---|---|---|
| Mac pilot | Mac Mini M4 16GB / MBP M1 Pro 16GB | VieNeu-TTS | Recommended for the current MVP |
| Mac quality R&D | Same | VoxCPM2 | Experimental; benchmark before making it default |
| Linux+GPU scale | Ubuntu 22.04 + NVIDIA | VoxCPM2, XTTS-v2, F5-TTS | Recommended once throughput or fidelity requirements grow |

## 2. Common bootstrap

### 2.1 Host prerequisites

| Component | Minimum | Recommended |
|---|---|---|
| Node.js | 22 LTS | 22 LTS |
| pnpm | 9.x | 9.x |
| Python | 3.11 | 3.11 |
| uv | latest | latest |
| Docker | 24.x | latest |
| Docker Compose | v2.20+ | latest |
| RAM | 16 GB | 16+ GB |
| Disk | 50 GB | 200 GB SSD |

### 2.2 Bootstrap commands

```bash
cp .env.example .env
./infra/scripts/gen-secrets.sh .env

pnpm install
cd apps/worker && uv sync && cd ../..

docker compose up -d postgres redis minio minio-init prometheus grafana

pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Equivalent shortcut:

```bash
./scripts/install-services.sh
```

Run the app stack:

```bash
pnpm dev
pnpm worker:dev
```

Important: on Apple Silicon, keep the worker on the host OS. Do not try to run `TORCH_DEVICE=mps` inside a Linux Docker container.

## 3. Mac deployment: VieNeu-TTS primary lane

### 3.1 Reference links

- GitHub: https://github.com/pnnbao97/VieNeu-TTS
- Docs: https://docs.vieneu.io
- Model: https://huggingface.co/pnnbao-ump/VieNeu-TTS

### 3.2 Install runtime

```bash
cd apps/worker
uv sync --extra vieneu
cd ../..
```

### 3.3 Required `.env` settings

```bash
TORCH_DEVICE=mps
WORKER_URL=http://localhost:8001
MODEL_CACHE_DIR=./models
```

### 3.4 Step-by-step provider configuration

1. Start the web app and worker.
2. Open `http://localhost:3000/admin/providers`.
3. Expand the `VieNeu-TTS` card. The card already contains the same docs links and setup steps shown here.
4. Click `Save config` with these values:

| Field | Value for Mac local mode |
|---|---|
| `model` | `pnnbao-ump/VieNeu-TTS` |
| `mode` | `local` |
| `apiBase` | leave blank |
| `referenceText` | optional; use only when your sample requires exact prompt text |
| `device` | `mps` |
| `maxChunkChars` | `320` |

5. Click `Test`.
6. If the test passes, click `Enable`.
7. If you want VieNeu to be the default generation path, click `Set Default`.
8. Enroll one Vietnamese profile with a clean `3-10s` clip and run a 15-second preview before production use.

### 3.5 Remote VieNeu server mode

Use this only when you already operate a separate VieNeu API server.

1. Follow the VieNeu docs above to bring up the remote server outside this repo.
2. In `/admin/providers`, keep the same `model` and switch:

| Field | Value for remote mode |
|---|---|
| `mode` | `remote` |
| `apiBase` | `http://<your-vieneu-host>:<port>` |
| `device` | optional metadata only |
| `maxChunkChars` | `320` |

3. Save config, click `Test`, then enable the provider.

## 4. Mac or GPU deployment: VoxCPM2 quality lane

### 4.1 Reference links

- GitHub: https://github.com/OpenBMB/VoxCPM
- Docs: https://voxcpm.readthedocs.io
- Model: https://huggingface.co/openbmb/VoxCPM2

### 4.2 Install runtime

```bash
cd apps/worker
uv sync --extra voxcpm
cd ../..
```

### 4.3 Step-by-step provider configuration

1. Open `http://localhost:3000/admin/providers`.
2. Expand the `VoxCPM2` card.
3. Save config with a starting point that matches your host:

| Field | Mac pilot | Linux+GPU |
|---|---|---|
| `model` | `openbmb/VoxCPM2` | `openbmb/VoxCPM2` |
| `device` | `mps` | `cuda` |
| `cfgValue` | `2` | `2` |
| `inferenceTimesteps` | `10` | `10` |
| `loadDenoiser` | `false` | `false` |
| `usePromptClone` | `false` | `false` |
| `promptText` | blank unless you are testing prompt clone mode | blank unless needed |
| `maxChunkChars` | `260` | `260` |

4. Click `Test`.
5. Enable it only after the test passes and a real 20-30 minute sample render completes within your acceptable SLA.
6. On Mac, keep it as an opt-in comparison lane unless benchmarks are stable enough to promote it.

## 5. Linux+GPU deployment

### 5.1 Install NVIDIA Container Toolkit

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Verify with:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

### 5.2 Bring up the GPU overlay

The GPU overlay already builds the worker with `--extra voxcpm`.

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml build web worker
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

After the stack is up:

1. Open `/admin/providers`.
2. Configure `VoxCPM2` with `device=cuda`.
3. Optionally keep `XTTS-v2` or `F5-TTS` enabled as fallback local providers.
4. Run `Test` on each enabled provider before setting the default.

## 6. Environment variables

The full sample lives in `.env.example`. The most important entries are:

```bash
# Core app
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://voice:voice_pass@localhost:5432/voice_studio
REDIS_URL=redis://localhost:6379
AUTH_SECRET=<32+ chars>
SERVER_SECRET=<32+ chars>
WORKER_URL=http://localhost:8001

# Storage
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=voice-studio

# Worker
TORCH_DEVICE=mps
WORKER_CONCURRENCY=1
MODEL_CACHE_DIR=./models
PROMETHEUS_PORT=9090
HF_TOKEN=
GOOGLE_API_KEY=
ELEVENLABS_API_KEY=
XIAOMI_API_KEY=        # MiMo (api.xiaomimimo.com / token-plan-sgp.xiaomimimo.com)
XAI_API_KEY=           # xAI Grok (api.x.ai)
OTEL_EXPORTER_OTLP_ENDPOINT=

# Optional services
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@younetgroup.com
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
```

## 6.1 Cloud TTS providers (no local model required)

These providers run entirely in the cloud — the worker only proxies HTTP. No `uv sync` extras, no GPU, and they work in both dev and prod.

### Xiaomi MiMo TTS

- Console: https://platform.xiaomimimo.com/#/console/api-keys
- Docs: https://platform.xiaomimimo.com/#/docs/usage-guide/speech-synthesis-v2.5
- Models used: `mimo-v2.5-tts` (built-in voices) and `mimo-v2.5-tts-voiceclone` (audio-sample cloning)
- Base URL — auto-routed by key prefix:
  - `sk-…` keys → `https://api.xiaomimimo.com/v1` (pay-as-you-go)
  - `tp-…` keys → `https://token-plan-sgp.xiaomimimo.com/v1` (Token Plan)
  - Override via the **Base URL** field on the provider card if needed.

Setup:

1. Put the key in `.env` as `XIAOMI_API_KEY=…` (fallback) **or** paste it into Admin → Providers → Xiaomi MiMo TTS (recommended — it's stored encrypted in the DB).
2. Click **Test & Save**. The web app round-trips a 2-word synthesis through the API.
3. Pick a built-in voice (`Chloe`, `Mia`, `Milo`, `Dean`, `冰糖`, `茉莉`, `苏打`, `白桦`) for non-cloned profiles.
4. **Enable** the provider. Voice clones re-send the reference clip on every synthesis call (no separate enroll step).

### xAI Grok TTS

- Console: https://console.x.ai
- TTS docs: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
- Custom voices: https://docs.x.ai/developers/model-capabilities/audio/custom-voices  *(Enterprise plan required)*
- Base URL: `https://api.x.ai/v1`

Setup:

1. Put the key in `.env` as `XAI_API_KEY=…` **or** paste it into Admin → Providers → xAI Grok TTS.
2. Click **Test & Save** — pings `GET /v1/tts/voices`.
3. Pick a default built-in voice (`eve`, `ara`, `leo`, `rex`, `sal`).
4. Enable the provider. The first time a cloned profile is rendered, the worker uploads the reference clip to `POST /v1/custom-voices` and reuses the returned `voice_id` for subsequent renders.

## 7. Health checks

| Check | Expected result |
|---|---|
| `GET http://localhost:3000/api/healthz` | `200` |
| `GET http://localhost:8001/healthz` | `200` |
| `GET http://localhost:9000/minio/health/live` | `200` |
| `/admin/system-health` | PostgreSQL, Redis, MinIO, Worker all `UP` |
| `/admin/providers` -> `Test` button | Each enabled provider reports success |

## 7.1 Upgrades (`docker compose down` → `up`)

Whenever a release adds a Prisma enum value, a column, or a new seed row (for example, the May 2026 release that added `XIAOMI_TTS` and `XAI_TTS`), a DB migration plus a seed re-run is required. The web container does **not** run migrations on startup.

Recommended flow on a deployed host:

```bash
# 1. Pull and rebuild
git pull
docker compose -f docker-compose.yml -f docker-compose.gpu.yml build web worker

# 2. Recreate containers (env_file: .env is reloaded automatically — add new keys to .env first)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml down
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d

# 3. Migrate + seed (idempotent — uses upserts)
docker compose exec web pnpm --filter @yng-voice/web exec prisma migrate deploy
docker compose exec web pnpm --filter @yng-voice/web exec tsx prisma/seed.ts
```

Or, if you run web/worker outside Docker on the host (Mac pilot):

```bash
git pull
pnpm install
pnpm db:migrate
pnpm db:seed
./scripts/stop-dev.sh && ./scripts/start-dev.sh
```

`./scripts/start-dev.sh` runs `prisma migrate deploy` and `pnpm db:seed` on every start, so a re-run alone is enough on a dev host.

After the seed, the new providers appear (disabled by default) in **Admin → Providers**. Paste the relevant API key, click **Test & Save**, then enable.

## 8. Backup and restore

Nightly jobs:

```cron
0 2 * * * root cd /opt/voice-studio && pnpm exec tsx infra/scripts/retention-purge.ts >> /var/log/voice-retention.log 2>&1
5 0 1 * * * root cd /opt/voice-studio && pnpm exec tsx infra/scripts/quota-reset.ts >> /var/log/voice-quota.log 2>&1
0 3 * * * root bash /opt/voice-studio/infra/scripts/backup.sh >> /var/log/voice-backup.log 2>&1
```

Restore:

```bash
age --decrypt --identity ~/.age/key.txt backup-YYYYMMDD.tar.gz.age -o backup.tar.gz
tar -xzf backup.tar.gz
pg_restore --clean --no-owner -d "$DATABASE_URL" backup/postgres.dump
mc alias set restore-dst http://minio:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mirror backup/minio/ restore-dst/voice-studio/
```

To stop the local infra stack without removing data:

```bash
./scripts/uninstall-services.sh
```

To stop and delete local volumes too:

```bash
./scripts/uninstall-services.sh --purge-data
```

## Changelog
- 2026-04-20: Rewrote deployment guidance around VieNeu-TTS and VoxCPM2, added provider links, and documented the exact admin configuration flow.
