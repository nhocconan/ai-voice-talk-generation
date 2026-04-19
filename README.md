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
2. Create local secrets:
   ```bash
   ./infra/scripts/gen-secrets.sh .env
   ```
3. Bring up infra:
   ```bash
   docker compose up -d
   ```
   If your machine already uses `5432`, `6379`, `9000`, `9001`, `80`, or `443`, override the host ports in `.env` first.
4. Apply database schema and seed the default admin:
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```
5. Run the web app:
   ```bash
   pnpm dev
   ```
6. In another terminal, run the worker:
   ```bash
   pnpm worker:dev
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
