# YouNet Voice Studio — Administrator Manual

This guide covers the day-to-day tasks of running a Voice Studio deployment. It assumes the reader has `ADMIN` or `SUPER_ADMIN` rights.

## 1. First-run setup

### 1.1 Start infrastructure

```bash
docker compose up -d postgres redis minio minio-init prometheus grafana
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Then start the two app processes in separate terminals:

```bash
pnpm dev
```

```bash
pnpm worker:dev
```

Apple Silicon note: keep the worker on the host OS when using `TORCH_DEVICE=mps`. Do not run the inference worker inside a Linux Docker container for the Mac path.

### 1.2 Verify install via System Health

Navigate to **`/admin/system-health`**. Every required service should report `UP`:

| Service | Purpose | If DOWN |
|---|---|---|
| PostgreSQL | Metadata, users, jobs | Check `DATABASE_URL`, then restart `postgres` |
| Redis | Job queue, rate limits, SSE | Check `REDIS_URL`, then restart `redis` |
| MinIO | Object storage | Check `MINIO_*`, then restart `minio` |
| Python worker | TTS/ASR engine | Run `pnpm worker:dev` or inspect worker logs |
| TTS providers | At least one enabled and healthy | Open `/admin/providers` and click `Test` |

Optional services (`Resend`, `Gemini`) can be `DISABLED`; the app degrades gracefully.

## 2. Managing TTS providers

Path: **`/admin/providers`**

Each provider card has:

- **Status badges** — enabled / default / API-key state
- **Test** — runs a live provider check against the current saved config
- **Enable / Disable** — toggles user availability
- **Set Default** — fallback provider when a user does not override the provider at generation time
- **Add / Replace Key** — stores API keys encrypted at rest
- **Setup + config** — expands docs links, setup steps, editable runtime fields, and capability notes

### 2.1 Recommended provider per scenario

| Need | Recommended provider | Why |
|---|---|---|
| Local-first on Mac | VieNeu-TTS | Best current fit for Vietnamese cloning on Apple Silicon |
| Higher-quality comparison lane | VoxCPM2 | Stronger long-term fidelity path, especially on CUDA |
| Compatibility fallback | XTTS-v2 or F5-TTS | Keep available when local experiments fail |
| Commercial fallback cloning | ElevenLabs | Useful when local quality or throughput is not enough |
| Generic cloud fallback | Gemini TTS | Cheap fallback when custom voice is not required |
| Bilingual ZH/EN/VI cloning, free during beta | Xiaomi MiMo TTS | Audio-sample cloning, director-style prompts, no GPU |
| Multilingual (20 langs) cloud cloning | xAI Grok TTS | Custom voices via /custom-voices (Enterprise), 20-language coverage |
| Research only | VibeVoice | Visible in the app, but the worker integration is still a stub |

### 2.2 VieNeu-TTS on Mac: step-by-step

Reference links:

- GitHub: https://github.com/pnnbao97/VieNeu-TTS
- Docs: https://docs.vieneu.io
- Model: https://huggingface.co/pnnbao-ump/VieNeu-TTS

Operator steps:

1. On the host, run `cd apps/worker && uv sync --extra vieneu`.
2. Set `TORCH_DEVICE=mps` in `.env`.
3. Start the web app and worker.
4. Open `/admin/providers` and expand the `VieNeu-TTS` card.
5. Click `Save config` with:
   - `model=pnnbao-ump/VieNeu-TTS`
   - `mode=local`
   - `device=mps`
   - `apiBase=` blank
   - `referenceText=` blank unless your samples need explicit prompt text
   - `maxChunkChars=320`
6. Click `Test`.
7. If the test passes, click `Enable`.
8. Click `Set Default` only after a real Vietnamese sample profile and a 15-second preview both sound acceptable.

### 2.3 VieNeu-TTS remote mode

Use this only when an external VieNeu server already exists.

1. Bring up the external server using the VieNeu docs above.
2. In `/admin/providers`, keep the same `model`.
3. Set `mode=remote`.
4. Set `apiBase=http://<your-vieneu-host>:<port>`.
5. Save config, click `Test`, then enable the provider.

### 2.4 VoxCPM2: step-by-step

Reference links:

- GitHub: https://github.com/OpenBMB/VoxCPM
- Docs: https://voxcpm.readthedocs.io
- Model: https://huggingface.co/openbmb/VoxCPM2

Operator steps:

1. Install the runtime with `cd apps/worker && uv sync --extra voxcpm`.
2. Open `/admin/providers` and expand the `VoxCPM2` card.
3. Use this baseline config:
   - `model=openbmb/VoxCPM2`
   - `device=mps` on Mac, `cuda` on Linux GPU
   - `cfgValue=2`
   - `inferenceTimesteps=10`
   - `loadDenoiser=false`
   - `usePromptClone=false`
   - `promptText=` blank unless you are testing prompt-clone mode
   - `maxChunkChars=260`
4. Save config and click `Test`.
5. On Mac, leave VoxCPM2 as a comparison lane until at least one full 20-30 minute render passes.
6. On Linux GPU, VoxCPM2 can become the default once benchmark and operator review pass.

### 2.5 Cloud provider keys

For `ElevenLabs`, `Gemini TTS`, `Xiaomi MiMo TTS`, and `xAI Grok TTS`:

1. Expand the provider card.
2. Paste the API key.
3. Click `Test & Save`.
4. Only enable the provider after the test passes.

#### 2.5.1 Xiaomi MiMo TTS

- Console: https://platform.xiaomimimo.com/#/console/api-keys
- Two deployments share the same API contract; the worker auto-routes by key prefix:
  - `sk-…` → `https://api.xiaomimimo.com/v1` (pay-as-you-go)
  - `tp-…` → `https://token-plan-sgp.xiaomimimo.com/v1` (Token Plan / subscription)
- Override the auto-routed URL by filling the `Base URL` field on the provider card.
- Built-in voices: `Chloe`, `Mia`, `Milo`, `Dean` (English), `冰糖`, `茉莉`, `苏打`, `白桦` (Chinese), or `mimo_default`. Pick one in the `Built-in Voice` dropdown — used when synthesising without a clone sample.
- Voice cloning: when a profile has a reference clip, the worker base64-encodes the sample and sends it inline as the `voice` parameter on the `mimo-v2.5-tts-voiceclone` model. There is no separate enroll step — Xiaomi treats the reference clip as the voice handle on every request. The 10 MB total payload limit applies to the encoded sample.
- The optional `Default Style Prompt` field is sent as the `user` message (natural-language style guidance, e.g. "warm professional narrator, slightly fast"). Leave blank to skip.

#### 2.5.2 xAI Grok TTS

- Console: https://console.x.ai
- Custom voices (`POST /v1/custom-voices`) require an **Enterprise** plan. Built-in voices work on any plan.
- Built-in voices: `eve`, `ara`, `leo`, `rex`, `sal`. Pick one in the `Default Built-in Voice` dropdown.
- Voice cloning is **one-shot**: the first time a user renders a profile through this provider, the worker uploads the reference clip to `/v1/custom-voices` and reuses the returned `voice_id` for all subsequent renders of that profile. xAI caps custom voices at 30 per team by default — clean up unused voices in the xAI Console if you hit the cap.
- Reference audio: 90+ seconds recommended (max 120 s), WAV or MP3, mono 24 kHz preferred.

### 2.6 Rotating or clearing a key

Replace the key the same way. The previous secret is overwritten. If you click `Clear Key`, the provider stays in the list but can no longer be tested or used until a new key is stored.

## 3. Inviting and managing users

Path: **`/admin/users`**

- **Invite user** — enter email + role. If Resend is configured, the invite link is emailed; otherwise the link is logged to the server console.
- **Change role** — `VIEWER`, `USER`, `ADMIN`, `SUPER_ADMIN`. Only a `SUPER_ADMIN` can promote another `SUPER_ADMIN`.
- **Disable / re-enable** — disabled users cannot log in but retain their data.
- **Reset password link** — sends a password-reset email or logs the link if email is not configured.

### 3.1 Quotas

Set monthly caps on the Users page. Metering is based on generated minutes. Users see remaining quota in the app header.

## 4. Voice library moderation

Path: **`/admin/library`**

- List every enrolled voice profile across all users.
- **Delete** — removes embeddings and source samples from MinIO. Existing generations remain intact.
- **Lock profile** — prevents owners from deleting leadership voices.
- **Org shared** — makes a profile visible across the workspace.

If a user uploads audio without consent, delete the profile and leave an audit-log note.

## 5. Monitoring generations

Path: **`/admin/generations`**

- Filter by user, status, and time range.
- Open a row to inspect provider, duration, error, and output artifacts.
- **Retry** — re-queues a failed job with the same inputs.
- **Cancel** — stops a queued or running job.

Health red flags:

| Symptom | Likely cause |
|---|---|
| Many `FAILED` jobs with provider errors | Provider runtime missing, API key expired, or provider config wrong |
| Jobs stuck in `QUEUED` | Worker is down or cannot reach Redis |
| Very long render times | Mac host is overloaded, or an experimental provider was set default too early |

## 6. System Health triage

Path: **`/admin/system-health`**

Click **Re-probe** to force a fresh check.

Common recovery moves:

- **Postgres DOWN** -> `docker compose restart postgres`; verify `DATABASE_URL`.
- **Redis DOWN** -> `docker compose restart redis`.
- **MinIO DOWN** -> `docker compose restart minio`; ensure `minio-init` ran at least once.
- **Worker DOWN** -> run `pnpm worker:dev`; inspect logs for missing model runtimes.
- **VieNeu-TTS test fails** -> confirm `uv sync --extra vieneu` completed on the host, `TORCH_DEVICE=mps`, and the saved config still uses `mode=local`.
- **VoxCPM2 test fails** -> confirm `uv sync --extra voxcpm` completed, lower expectations on Mac, and switch `device` to `cuda` only on a real NVIDIA host.
- **Resend DISABLED** -> set `RESEND_API_KEY` and restart the web app.
- **Gemini DISABLED** -> set `GOOGLE_API_KEY` in both the web app and worker environments.
- **Xiaomi MiMo missing/test 401** -> set `XIAOMI_API_KEY` in `.env` (or paste it in `/admin/providers`), and check the key prefix matches the deployment (`tp-…` for Token Plan, `sk-…` for pay-as-you-go). Override the Base URL field if you use a custom region.
- **xAI Grok missing/test 401** -> set `XAI_API_KEY` and verify the team has Enterprise access for `/custom-voices`. Built-in voices work on any plan.

## 7. Audit log

Path: **`/admin/audit`**

Every sensitive action is recorded: logins, role changes, provider updates, profile deletions, quota changes, password resets, and generation activity.

Use this page when investigating abuse, provider changes, or compliance questions.

## 8. Backups and retention

Nightly jobs:

- retention purge via `infra/scripts/retention-purge.ts`
- monthly quota reset via `infra/scripts/quota-reset.ts`
- backup via `infra/scripts/backup.sh`

Restore flow:

1. Stop the app.
2. Restore Postgres from the latest dump.
3. Mirror MinIO objects back into the `voice-studio` bucket.
4. Start the app and re-run `/admin/system-health`.

## 9. Observability

- **Prometheus** at `http://localhost:9090`
- **Grafana** at `http://localhost:3001`
- **OpenTelemetry** when `OTEL_EXPORTER_OTLP_ENDPOINT` is set
- **Sentry** when `SENTRY_DSN` is set and the Sentry package is installed

## 10. Troubleshooting quick reference

| Problem | Fix |
|---|---|
| User cannot log in | Check the user is not disabled; re-issue password reset |
| Generate page shows a service warning | Open `/admin/system-health` and inspect the red service |
| VieNeu-TTS missing in tests | Install the worker extra: `cd apps/worker && uv sync --extra vieneu` |
| VoxCPM2 missing in tests | Install the worker extra: `cd apps/worker && uv sync --extra voxcpm` |
| Worker OOM | Lower `TORCH_DEVICE` to `cpu`, reduce concurrency, or move the heavy provider to a GPU host |
| MinIO upload 403 | Re-run `docker compose up minio-init` |
| Gemini key rejected | Regenerate the key at https://aistudio.google.com/apikey |
| Xiaomi MiMo "Invalid API Key" | Wrong base URL for the key tier. `tp-…` keys must hit `token-plan-sgp.xiaomimimo.com`; `sk-…` keys hit `api.xiaomimimo.com`. The provider auto-routes — only the Base URL field overrides this. |
| xAI custom-voice 403 | Endpoint is gated to Enterprise teams. Use a built-in voice (`eve` etc.) or contact xAI to enable `/custom-voices`. |
| New providers missing in /admin/providers after upgrade | `pnpm db:migrate && pnpm db:seed` (or in Docker: `docker compose exec web pnpm db:migrate` then run the seed). The seed is idempotent — safe to re-run. |

## 11. Escalation

Critical incidents such as data loss or active abuse go to the on-call. Provider billing issues stay with the provider; this system does not proxy billing.

## Changelog
- 2026-05-03: Added Xiaomi MiMo TTS (built-in voices + audio-sample voice cloning, auto-routed by `sk-…` / `tp-…` key prefix) and xAI Grok TTS (built-in voices + `/custom-voices` cloning on Enterprise) to `/admin/providers`. New env vars: `XIAOMI_API_KEY`, `XAI_API_KEY`. Run `pnpm db:migrate && pnpm db:seed` after pulling.
- 2026-05-03: Removed ClamAV malware scanner (was fail-open in dev and not enabled in prod). Dropped `CLAMAV_HOST`, `CLAMAV_PORT`, `HOST_CLAMAV_PORT` env vars and the `clamav` docker service. Reclaim disk by deleting `infra/volumes/clamav` and pruning the `clamav/clamav` image (`docker rmi clamav/clamav:stable`).
- 2026-04-20: Updated the runbook for VieNeu-TTS and VoxCPM2, including provider links and the exact `/admin/providers` configuration flow.
