# YouNet Voice Studio

Internal voice-cloning studio for YouNet leadership audio. The repo is a `pnpm` monorepo with:

- `apps/web`: Next.js 15 app, Auth.js, tRPC, Prisma
- `apps/worker`: Python inference worker, FastAPI, TTS/ASR pipelines
- `packages/contracts`: shared contracts
- `packages/ui`: shared UI primitives

## Quick Start

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Sync the Python worker:
   ```bash
   cd apps/worker
   uv sync
   cd ../..
   ```
3. Create local secrets:
   ```bash
   cp .env.example .env
   ./infra/scripts/gen-secrets.sh .env
   ```
4. Bring up infra:
   ```bash
   docker compose up -d postgres redis minio minio-init prometheus grafana
   ```
   If your machine already uses `5432`, `6379`, `9000`, `9001`, `80`, or `443`, override the host ports in `.env` first.
5. Apply database schema and seed the default admin:
   ```bash
   pnpm db:generate
   pnpm db:migrate
   pnpm db:seed
   ```
6. Run the web app:
   ```bash
   pnpm dev
   ```
7. In another terminal, run the worker:
   ```bash
   pnpm worker:dev
   ```

One-command local bootstrap is also available:

```bash
./scripts/install-services.sh
```

## Provider Setup

The seed keeps `XTTS-v2` enabled by default for compatibility, but the current recommended provider lanes are:

- `VieNeu-TTS` for Mac-first Vietnamese local cloning
- `VoxCPM2` for higher-quality comparison and future GPU promotion
- `Xiaomi MiMo TTS` and `xAI Grok TTS` as cloud cloning fallbacks (no GPU required)
- `ElevenLabs` and `Gemini TTS` as commercial cloud fallbacks

Install the optional worker runtimes you need:

```bash
cd apps/worker
uv sync --extra vieneu
uv sync --extra voxcpm
cd ../..
```

Cloud providers (`Xiaomi`, `xAI`, `ElevenLabs`, `Gemini`) need no extras — only an API key. Either add it to `.env`:

```bash
XIAOMI_API_KEY=tp-…   # Token Plan key — auto-routes to token-plan-sgp.xiaomimimo.com
                      # sk-… keys auto-route to api.xiaomimimo.com
XAI_API_KEY=xai-…
```

…or paste the key into Admin → Providers (recommended — stored encrypted in the DB).

Then open `http://localhost:3000/admin/providers`. Each provider card now includes:

- official docs links
- step-by-step setup notes
- editable runtime config
- a live `Test` action before enable/default changes

Detailed operator docs live in:

- `docs/VOICE_PROVIDER_EVALUATION.md`
- `docs/DEPLOYMENT.md`
- `docs/ADMIN_MANUAL.md`

To stop or remove local services:

```bash
./scripts/uninstall-services.sh
```

Default super admin after seeding:

- Email: `admin@younetgroup.com`
- Password: `YouNet@2026`

The first login forces a password change.

## Local URLs

- App: `http://localhost:3000`
- Caddy: `http://localhost`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

## Verification

Run the repository verification suite:

```bash
pnpm verify
python3 -m compileall apps/worker/src/worker
```

## Notes

- `AGENTS.md` is a symlink to `CLAUDE.md` so instruction changes stay in sync.
- Copy changes to product/architecture docs into `docs/` in the same commit that changes behavior.
