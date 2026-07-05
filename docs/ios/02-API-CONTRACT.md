# API Contract — iOS

**Status:** Draft v1.0 (handoff spec) · **Owner:** Backend/Mobile · **Last updated:** 2026-07-05

The complete REST surface the iOS app needs. Each endpoint is marked **EXISTS** (in the current codebase) or **PROPOSED** (the web team must build it). Field names, types, enums, limits, and status codes for EXISTS endpoints are quoted from real code; do not change them without changing the server.

---

## 1. Why a REST facade (not tRPC) for mobile

The web app talks to the server over **tRPC 11** (`apps/web/src/server/routers/*`). tRPC is a TypeScript-to-TypeScript RPC: its wire format (batched `?input=…` query params, procedure-path URLs, superjson-ish encoding) is an internal contract with no stability guarantee and no first-party Swift client. Consuming it from Swift means hand-modeling an undocumented, changeable protocol.

**Recommendation:** the web team exposes a **stable, versioned REST facade under `/api/v1/*`** that wraps the same service functions the tRPC procedures already call. Most PROPOSED endpoints below are thin REST handlers over logic that already exists in the routers — they mostly re-expose `voiceProfile.*` and `generation.*`. This gives mobile (and any future third-party integrator) a documented, versioned contract, and lets the web app keep using tRPC unchanged.

## 2. Conventions

- Base URL: `https://<host>/api/v1`. The `/v1` is the version pin; breaking changes go to `/v2`.
- Auth: `Authorization: Bearer <accessToken>` (see `01-…`). The one exception is the existing `POST /api/v1/generate`, which accepts `Bearer vk_…` API keys today; the mobile access token middleware should accept **both** so nothing breaks.
- Content type: `application/json` for request/response bodies, except binary upload PUTs (to presigned storage URLs) and file downloads.
- Timestamps: ISO-8601 UTC strings.
- IDs: CUID strings.
- All mutating calls are rate-limited server-side (see per-endpoint notes). The app must handle `429` with `Retry-After`.

## 3. Error envelope

EXISTS endpoints today return `{ "error": "<message>" }` (see `api/v1/generate/route.ts`). **PROPOSED (recommended):** standardize all `/api/v1/*` errors on a structured envelope so the app can branch on a stable `code` rather than parsing prose:

```json
{ "error": { "code": "QUOTA_EXCEEDED", "message": "Monthly quota exceeded (58/60 min used)", "retryAfter": null } }
```

Stable codes the app branches on: `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `PASSWORD_CHANGE_REQUIRED`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `VALIDATION`, `NOT_FOUND`, `FORBIDDEN`, `PROFILE_NOT_READY`, `NO_PROVIDER`, `PROVIDER_UNAVAILABLE`, `NOT_READY`, `INTERNAL`. Existing `{error:string}` responses should be adapted to this shape when the REST facade is built.

## 4. Endpoint index

| # | Method & path | Auth | Status | Purpose |
|---|---|---|---|---|
| Auth | `POST /api/v1/auth/login` | none | **PROPOSED** | Exchange credentials for tokens (`01-…`) |
| | `POST /api/v1/auth/refresh` | refresh | **PROPOSED** | Rotate tokens |
| | `POST /api/v1/auth/logout` | access | **PROPOSED** | Revoke refresh |
| | `POST /api/v1/auth/change-password` | access | **PROPOSED** | Change password / clear `fpc` |
| | `GET /api/v1/auth/me` | access | **PROPOSED** | Current user + quota |
| Profiles | `GET /api/v1/voice-profiles` | access | **PROPOSED** | List owned + org-shared |
| | `GET /api/v1/voice-profiles/{id}` | access | **PROPOSED** | Profile detail + samples |
| | `POST /api/v1/voice-profiles` | access | **PROPOSED** | Create profile (name, lang, consent) |
| | `DELETE /api/v1/voice-profiles/{id}` | access | **PROPOSED** | Delete (owner; locked→admin) |
| | `POST /api/v1/voice-profiles/{id}/upload-url` | access | **PROPOSED** | Presigned PUT for a sample |
| | `POST /api/v1/voice-profiles/{id}/samples` | access | **PROPOSED** | Enqueue ingest of uploaded sample |
| | `POST /api/v1/voice-profiles/{id}/active-version` | access | **PROPOSED** | Set active version |
| | `GET /api/v1/voice-profiles/{id}/samples/{v}/download-url` | access | **PROPOSED** | Presigned GET for a sample |
| | `GET /api/v1/voice-profiles/{id}/export` | session cookie | **EXISTS** | ZIP export of a profile |
| Providers | `GET /api/v1/providers` | access | **PROPOSED** | Enabled TTS providers |
| | `GET /api/v1/llm-providers` | access | **PROPOSED** | Enabled LLM providers + models |
| Generation | `POST /api/v1/generate` | Bearer `vk_` (and access) | **EXISTS** | Enqueue a PRESENTATION render |
| | `POST /api/v1/generations/presentation` | access | **PROPOSED** | Presentation (full param set) |
| | `POST /api/v1/generations/podcast` | access | **PROPOSED** | Two-speaker podcast |
| | `POST /api/v1/draft-script` | access | **PROPOSED** | LLM script draft |
| | `POST /api/v1/preview` | access | **PROPOSED** | 15s preview render |
| | `GET /api/v1/generations` | access | **PROPOSED** | Paginated history |
| | `GET /api/v1/generations/{id}` | access | **PROPOSED** | Generation detail/status |
| | `GET /api/v1/generations/{id}/download-urls` | access | **PROPOSED** | Presigned output URLs |
| | `POST /api/v1/generations/{id}/cancel` | access | **PROPOSED** | Cancel a QUEUED job |
| Jobs | `GET /api/jobs/{id}/events` | session cookie | **EXISTS** | SSE progress stream |
| | `GET /api/v1/jobs/{id}/status` | access | **PROPOSED** | Polling fallback for progress |
| | `GET /api/download/{id}` | session cookie | **EXISTS** | Redirect to presigned MP3/WAV |

> **Auth-mismatch caveat.** `GET /api/jobs/{id}/events`, `GET /api/download/{id}`, and `GET /api/v1/voice-profiles/{id}/export` currently authenticate via the **NextAuth session cookie** (`await auth()`), **not** a bearer token. For mobile these must be extended to accept the Bearer access token (or, for SSE, a token query param — see §7). This is a required web-side change, tracked in `06-…`.

---

## 5. Auth endpoints

Specified in full in `01-ACCOUNT-AND-AUTH.md §3.3`. Not repeated here.

## 6. Voice profile endpoints

These re-expose `voiceProfile.ts` tRPC procedures over REST. Enums and limits are exact.

### `GET /api/v1/voice-profiles` — **PROPOSED** (wraps `voiceProfile.list`)

Returns profiles where `ownerId === user.id` OR `isOrgShared === true` (admins see all). Response `200`:

```json
{
  "profiles": [
    {
      "id": "clx…",
      "name": "CEO — Vietnamese",
      "lang": "vi",
      "isOrgShared": false,
      "isLocked": false,
      "activeVersion": 2,
      "owner": { "name": "Le Van A", "email": "a@demo.demo" },
      "samples": [
        { "version": 1, "durationMs": 41000, "qualityScore": 78, "createdAt": "2026-06-01T…" },
        { "version": 2, "durationMs": 52000, "qualityScore": 86, "createdAt": "2026-06-03T…" }
      ],
      "createdAt": "2026-06-01T…"
    }
  ]
}
```

### `GET /api/v1/voice-profiles/{id}` — **PROPOSED** (wraps `voiceProfile.get`)

Full profile incl. all `samples` (with `storageKey`, `qualityDetail`, `notes`) and `consent`. `403 FORBIDDEN` if not owner/org-shared/admin.

### `POST /api/v1/voice-profiles` — **PROPOSED** (wraps `voiceProfile.create`)

Request (validation from `create`):
```json
{ "name": "CEO — Vietnamese", "lang": "vi", "consentText": "<full consent statement, min 10 chars>" }
```
- `name`: 1–100 chars. `lang`: **one of `vi` | `en` | `multi`**. `consentText`: min 10 chars.
- Server stores `consent` JSON = `{ signedAt, text, userId, ip, userAgent }` (see `03-…` for the mandated `consentText`).

Response `201`: the created profile object. Audit: `voiceProfile.create`.

### `DELETE /api/v1/voice-profiles/{id}` — **PROPOSED** (wraps `voiceProfile.delete`)

Owner or admin only. `403` if `isLocked` and caller is not admin (message: "Profile is locked — contact admin to delete"). Response `204`.

### `POST /api/v1/voice-profiles/{id}/upload-url` — **PROPOSED** (wraps `voiceProfile.requestUploadUrl`)

Owner only. Request:
```json
{ "filename": "sample.m4a", "contentType": "audio/mp4", "contentLength": 812345 }
```
- `contentType` **must be in** `ALLOWED_AUDIO_MIMES`: `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/wav`, `audio/flac`, `audio/ogg`, `audio/webm`. Otherwise `400` "Unsupported file type".
- `contentLength` ≤ **104857600** (100 MB).

Response `200`:
```json
{ "uploadUrl": "https://minio…/voice-studio/uploads/<profileId>/<uuid>.m4a?X-Amz-…", "storageKey": "uploads/<profileId>/<uuid>.m4a" }
```

The app then does an **HTTP `PUT`** of the raw audio bytes to `uploadUrl` with header `Content-Type: <same contentType>`. The presigned PUT is valid **3600 s**. (Storage is MinIO/S3, path-style; see `apps/web/src/server/services/storage.ts`.)

### `POST /api/v1/voice-profiles/{id}/samples` — **PROPOSED** (wraps `voiceProfile.submitSample`)

Call after the PUT succeeds. Owner only. Request:
```json
{ "storageKey": "uploads/<profileId>/<uuid>.m4a", "notes": "quiet room, iPhone mic" }
```
Enqueues an ingest job at the next version (`max(existing)+1`). Response `200`: `{ "version": 3 }`. The worker then normalizes → VAD → scores → writes a `VoiceSample`. Poll `GET /api/v1/voice-profiles/{id}` until a sample with that `version` appears (see `03-…` for lifecycle).

### `POST /api/v1/voice-profiles/{id}/active-version` — **PROPOSED** (wraps `voiceProfile.setActiveVersion`)

Owner only. Request `{ "version": 3 }`. `404` if that version doesn't exist. Sets `activeVersion`. A profile is renderable only when a sample with `version === activeVersion` exists (`assertProfilesReady`).

### `GET /api/v1/voice-profiles/{id}/samples/{version}/download-url` — **PROPOSED** (wraps `voiceProfile.getSampleDownloadUrl`)

Owner or admin. Response `{ "url": "<presigned GET, 300s>" }`. For letting the user replay their own reference clip.

### `GET /api/v1/voice-profiles/{id}/export` — **EXISTS**

`apps/web/src/app/api/v1/voice-profiles/[id]/export/route.ts`. **Currently session-cookie auth** — must be extended to Bearer for mobile. Returns a `application/zip` (`Content-Disposition: attachment; filename="<name>-<id>.zip"`) containing `profile.json` (manifest: `schemaVersion:1`, `exportedAt`, `profile{name,lang,consent,activeVersion}`, `samples[]`) and `samples/v{n}.{ext}`. Owner or admin. Useful for a "share/back up this voice" action but not required for MVP.

## 7. Job progress — SSE and polling fallback

### `GET /api/jobs/{id}/events` — **EXISTS** (SSE)

`apps/web/src/app/api/jobs/[id]/events/route.ts`. Server-Sent Events. Subscribes to Redis channel `job:<id>:events`. Each event is a `data:` line with JSON:

```json
{ "ts": "2026-07-05T10:00:03Z", "phase": "CHUNK", "progress": 0.42, "message": "Rendering 21/50" }
```

- `phase` values include `CHUNK` (and others per pipeline); terminal phases are **`DONE`** and **`FAILED`**, at which point the server closes the stream.
- Hard timeout: the stream self-closes after **10 minutes**.
- **Currently session-cookie auth.** For mobile, extend to accept the access token — for `EventSource`-style consumers that cannot set headers, accept a short-lived token via `?access_token=<jwt>` query param (validate + immediately discard). Prefer a native `URLSession` streaming task that *can* set the `Authorization` header.

### `GET /api/v1/jobs/{id}/status` — **PROPOSED** (polling fallback)

Mobile networks (cellular, captive portals, backgrounding) frequently drop long-lived SSE connections. The app must have a polling fallback. This endpoint returns the **latest** progress snapshot (persist the last event per job in Redis, or derive from the `Generation` row):

Response `200`:
```json
{
  "generationId": "clx…",
  "status": "RUNNING",
  "phase": "CHUNK",
  "progress": 0.42,
  "message": "Rendering 21/50",
  "durationMs": null,
  "errorMessage": null,
  "updatedAt": "2026-07-05T10:00:03Z"
}
```

`status` is the `GenStatus` enum: `QUEUED` | `RUNNING` | `DONE` | `FAILED` | `CANCELLED`. The app polls this (e.g. every 3–5 s with backoff) whenever SSE is unavailable or after it drops. When `status === "DONE"`, call the download-urls endpoint.

## 8. Provider endpoints

### `GET /api/v1/providers` — **PROPOSED** (wraps `generation.listAvailableProviders`)

Returns **enabled TTS providers only** (LLM-only providers are excluded server-side). Response:
```json
{
  "providers": [
    { "id": "clx…", "name": "VIENEU_TTS", "isDefault": true },
    { "id": "cly…", "name": "ELEVENLABS", "isDefault": false }
  ],
  "defaultProviderId": "clx…"
}
```
`name` is the `ProviderName` enum. The app should show human labels from a bundled map (mirror `apps/web/src/lib/providers-meta.ts` `PROVIDER_META[name].name`). The app **never** sees API keys or config secrets. If the user doesn't pick, the server uses the default (`isDefault && enabled`).

### `GET /api/v1/llm-providers` — **PROPOSED** (wraps `generation.listLlmProviders`)

Enabled LLM providers that have ≥1 enabled LLM model — for the "draft script" model picker. Response:
```json
{
  "providers": [
    { "id": "clz…", "name": "GEMINI_LLM", "isDefault": true,
      "models": [ { "id": "clm…", "modelId": "gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "isDefault": true } ] }
  ]
}
```
LLM `ProviderName`s: `GEMINI_LLM`, `GROQ`, `XAI_LLM`, `GROK_OAUTH`, `OLLAMA`.

## 9. Generation endpoints

### `POST /api/v1/generate` — **EXISTS**

`apps/web/src/app/api/v1/generate/route.ts`. The one endpoint that already speaks Bearer. Accepts `Authorization: Bearer vk_<key>`. Rate limit **10/min/user** (`api_v1`).

Request:
```json
{ "profileId": "clx…", "script": "<10–500000 chars>", "estimatedMinutes": 3.0, "providerId": "clx…" }
```
- `script`: 10–500,000 chars. `estimatedMinutes`: 0.1–720. `providerId`: optional (falls back to default enabled provider).
- Checks: quota (`usedMinutes + estimatedMinutes > quotaMinutes` → `403`), provider available (`400`), profile accessible & has an active-version sample (`400` "Voice profile is still processing").

Response `201`: `{ "generationId": "clx…" }`. Errors: `400 | 401 | 403 | 429` with `{ "error": "<message>" }`.

> This endpoint is sufficient for a minimal "generate from script" MVP even before the fuller PROPOSED endpoints land — but it has **no audiogram flag, no preview, and returns no progress**. Prefer the PROPOSED presentation endpoint for the real app.

### `POST /api/v1/generations/presentation` — **PROPOSED** (wraps `generation.createPresentation`)

Request:
```json
{
  "profileId": "clx…",
  "script": "<min 10 chars>",
  "estimatedMinutes": 3.0,
  "providerId": "clx…",
  "audiogram": false,
  "audiogramTitle": "Q3 Town Hall"
}
```
- `estimatedMinutes`: 0.1–**720** (`INPUT_GENERATION_MINUTES_CAP = 12*60`); additionally blocked if it exceeds the admin `generation.maxMinutes` setting (default 60) → `400`.
- `audiogramTitle`: ≤ 120 chars, optional.
- Enforced in order: render rate limit (10/min), quota, generation-length limit, profile-ready. Response `200`: `{ "generationId": "clx…" }`. Output always includes MP3 + WAV; chapters off for presentations.

### `POST /api/v1/generations/podcast` — **PROPOSED** (wraps `generation.createPodcast`) — *Phase 2*

Request:
```json
{
  "speakers": [
    { "label": "A", "profileId": "clx…", "segments": [ { "startMs": 0, "endMs": 18000, "text": "Welcome…" } ] },
    { "label": "B", "profileId": "cly…", "segments": [ { "startMs": 18000, "endMs": 36000, "text": "Thanks…" } ] }
  ],
  "estimatedMinutes": 6.0,
  "pacingLock": false,
  "providerId": "clx…",
  "audiogram": false,
  "audiogramTitle": null
}
```
- `speakers`: 1–2 items. `label`: **`A` | `B`**. Each segment `{ startMs≥0, endMs≥0, text }`. Output includes ID3 chapter markers (chapters on). Same rate/quota/ready checks.

Response `200`: `{ "generationId": "clx…" }`.

### `POST /api/v1/draft-script` — **PROPOSED** (wraps `generation.draftScript`)

Request:
```json
{ "topic": "<3–500 chars>", "minutes": 3, "tone": "professional", "lang": "vi", "providerId": "clz…", "model": "gemini-2.5-flash" }
```
- `minutes`: 0.5–30. `tone`: **`professional` | `conversational` | `educational` | `storytelling`** (default `professional`). `lang`: **`vi` | `en`** (default `vi`). `providerId`/`model` optional (falls back to default LLM provider, then env Gemini).

Response `200`: `{ "script": "<drafted text>" }`. Errors: `412 PRECONDITION_FAILED` if no LLM provider configured and no env Gemini key; `500` on provider error.

### `POST /api/v1/preview` — **PROPOSED** (wraps `generation.previewPresentation`)

Renders the first ~250 chars for a fast audition; **does not** create a `Generation` row. Request:
```json
{ "profileId": "clx…", "script": "<min 10 chars>", "providerId": "clx…" }
```
Response `200`: `{ "previewUrl": "<presigned GET, ~5 min>" }`. The app plays it inline; if the user likes it, they submit the full render. Profile must be ready.

### `GET /api/v1/generations` — **PROPOSED** (wraps `generation.list`)

Query: `?page=1&pageSize=20` (`pageSize` ≤ 50). Response:
```json
{
  "items": [
    {
      "id": "clx…", "kind": "PRESENTATION", "status": "DONE",
      "provider": { "name": "VIENEU_TTS" },
      "durationMs": 182000, "audiogram": false,
      "speakers": [ { "label": "A", "profile": { "name": "CEO — Vietnamese" } } ],
      "createdAt": "2026-07-05T…", "finishedAt": "2026-07-05T…"
    }
  ],
  "total": 42, "page": 1, "pageSize": 20
}
```
`kind` ∈ `GenKind` (`PRESENTATION`, `PODCAST`, `REVOICE`, `VIDEO_REVOICE`, `AUDIOGRAM`). Non-admins see only their own.

### `GET /api/v1/generations/{id}` — **PROPOSED** (wraps `generation.get`)

Full generation incl. `provider`, `speakers[].profile`, `chapters`, `errorMessage`, `outputMp3Key`/`outputWavKey`/`outputVideoKey` presence. Owner or admin. Used by the detail screen and as a status source.

### `GET /api/v1/generations/{id}/download-urls` — **PROPOSED** (wraps `generation.getDownloadUrls`)

Owner only. `400 NOT_READY` if `status !== DONE`. Response:
```json
{ "mp3Url": "<presigned 3600s|null>", "wavUrl": "<…|null>", "videoUrl": "<…|null>" }
```
`videoUrl` is non-null for audiogram / video-revoice outputs. Presigned GET URLs live **3600 s**.

### `POST /api/v1/generations/{id}/cancel` — **PROPOSED** (wraps `generation.cancel`)

Owner only. Only allowed while `status === QUEUED` (else `400`). Sets `CANCELLED`. Response `204`.

### `GET /api/download/{id}` — **EXISTS**

`apps/web/src/app/api/download/[id]/route.ts`. Session-cookie auth today. `302` redirect to a presigned GET (300 s) for the MP3 (falls back to WAV). Convenient for a "share sheet → save file" path, but the app should generally prefer `download-urls` so it controls the fetch. Must accept Bearer for mobile.

## 10. OpenAPI 3.1 sketch (core endpoints)

Machine-readable sketch covering the core mobile journey. It intentionally omits podcast/revoice (Phase 2) for brevity; extend as those land. `PROPOSED` operations are so tagged.

```yaml
openapi: 3.1.0
info:
  title: Voice Studio Mobile API
  version: "1.0.0"
  description: REST facade for the Voice Studio iOS app. Endpoints tagged (proposed) are not yet implemented.
servers:
  - url: https://voice.demo.example/api/v1
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  schemas:
    Error:
      type: object
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string }
            message: { type: string }
            retryAfter: { type: [integer, "null"] }
    User:
      type: object
      required: [id, email, name, role, forcePasswordChange, quotaMinutes, usedMinutes]
      properties:
        id: { type: string }
        email: { type: string, format: email }
        name: { type: string }
        role: { type: string, enum: [USER, ADMIN, SUPER_ADMIN] }
        forcePasswordChange: { type: boolean }
        quotaMinutes: { type: integer }
        usedMinutes: { type: integer }
    TokenPair:
      type: object
      required: [accessToken, accessExpiresIn, refreshToken, refreshExpiresIn, user]
      properties:
        accessToken: { type: string }
        accessExpiresIn: { type: integer, example: 900 }
        refreshToken: { type: string }
        refreshExpiresIn: { type: integer, example: 2592000 }
        user: { $ref: "#/components/schemas/User" }
    Sample:
      type: object
      properties:
        version: { type: integer }
        durationMs: { type: integer }
        qualityScore: { type: integer, minimum: 0, maximum: 100 }
        createdAt: { type: string, format: date-time }
    VoiceProfile:
      type: object
      properties:
        id: { type: string }
        name: { type: string }
        lang: { type: string, enum: [vi, en, multi] }
        isOrgShared: { type: boolean }
        isLocked: { type: boolean }
        activeVersion: { type: integer }
        samples: { type: array, items: { $ref: "#/components/schemas/Sample" } }
        createdAt: { type: string, format: date-time }
    Provider:
      type: object
      properties:
        id: { type: string }
        name: { type: string, enum: [VIENEU_TTS, VOXCPM2, XTTS_V2, F5_TTS, ELEVENLABS, GEMINI_TTS, VIBEVOICE, XIAOMI_TTS, XAI_TTS, KOKORO, INDEXTTS2] }
        isDefault: { type: boolean }
    Generation:
      type: object
      properties:
        id: { type: string }
        kind: { type: string, enum: [PRESENTATION, PODCAST, REVOICE, VIDEO_REVOICE, AUDIOGRAM] }
        status: { type: string, enum: [QUEUED, RUNNING, DONE, FAILED, CANCELLED] }
        durationMs: { type: [integer, "null"] }
        audiogram: { type: boolean }
        createdAt: { type: string, format: date-time }
        finishedAt: { type: [string, "null"], format: date-time }
paths:
  /auth/login:
    post:
      tags: [auth]
      summary: Login (proposed)
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password, deviceId]
              properties:
                email: { type: string, format: email }
                password: { type: string, minLength: 8 }
                deviceId: { type: string }
                deviceName: { type: string }
      responses:
        "200": { description: OK, content: { application/json: { schema: { $ref: "#/components/schemas/TokenPair" } } } }
        "401": { description: Invalid credentials, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
        "429": { description: Rate limited }
  /auth/refresh:
    post:
      tags: [auth]
      summary: Rotate tokens (proposed)
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refreshToken, deviceId]
              properties:
                refreshToken: { type: string }
                deviceId: { type: string }
      responses:
        "200": { description: OK, content: { application/json: { schema: { $ref: "#/components/schemas/TokenPair" } } } }
        "401": { description: Invalid/reused refresh }
  /auth/me:
    get:
      tags: [auth]
      summary: Current user (proposed)
      responses:
        "200": { description: OK, content: { application/json: { schema: { $ref: "#/components/schemas/User" } } } }
  /voice-profiles:
    get:
      tags: [profiles]
      summary: List profiles (proposed)
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  profiles: { type: array, items: { $ref: "#/components/schemas/VoiceProfile" } }
    post:
      tags: [profiles]
      summary: Create profile (proposed)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, lang, consentText]
              properties:
                name: { type: string, minLength: 1, maxLength: 100 }
                lang: { type: string, enum: [vi, en, multi] }
                consentText: { type: string, minLength: 10 }
      responses:
        "201": { description: Created, content: { application/json: { schema: { $ref: "#/components/schemas/VoiceProfile" } } } }
  /voice-profiles/{id}/upload-url:
    post:
      tags: [profiles]
      summary: Presigned PUT for a sample (proposed)
      parameters: [ { name: id, in: path, required: true, schema: { type: string } } ]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [filename, contentType, contentLength]
              properties:
                filename: { type: string }
                contentType: { type: string, enum: [audio/mpeg, audio/mp4, audio/x-m4a, audio/wav, audio/flac, audio/ogg, audio/webm] }
                contentLength: { type: integer, maximum: 104857600 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  uploadUrl: { type: string, format: uri }
                  storageKey: { type: string }
  /voice-profiles/{id}/samples:
    post:
      tags: [profiles]
      summary: Enqueue ingest (proposed)
      parameters: [ { name: id, in: path, required: true, schema: { type: string } } ]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [storageKey]
              properties:
                storageKey: { type: string }
                notes: { type: string }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, properties: { version: { type: integer } } }
  /voice-profiles/{id}/active-version:
    post:
      tags: [profiles]
      summary: Set active version (proposed)
      parameters: [ { name: id, in: path, required: true, schema: { type: string } } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, required: [version], properties: { version: { type: integer, minimum: 1 } } }
      responses:
        "204": { description: No Content }
  /providers:
    get:
      tags: [providers]
      summary: Enabled TTS providers (proposed)
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  providers: { type: array, items: { $ref: "#/components/schemas/Provider" } }
                  defaultProviderId: { type: string }
  /generations/presentation:
    post:
      tags: [generation]
      summary: Create a presentation render (proposed)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [profileId, script, estimatedMinutes]
              properties:
                profileId: { type: string }
                script: { type: string, minLength: 10 }
                estimatedMinutes: { type: number, minimum: 0.1, maximum: 720 }
                providerId: { type: string }
                audiogram: { type: boolean, default: false }
                audiogramTitle: { type: string, maxLength: 120 }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, properties: { generationId: { type: string } } }
        "403": { description: Quota exceeded / password change required, content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
        "429": { description: Rate limited }
  /draft-script:
    post:
      tags: [generation]
      summary: Draft a script via LLM (proposed)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [topic, minutes]
              properties:
                topic: { type: string, minLength: 3, maxLength: 500 }
                minutes: { type: number, minimum: 0.5, maximum: 30 }
                tone: { type: string, enum: [professional, conversational, educational, storytelling], default: professional }
                lang: { type: string, enum: [vi, en], default: vi }
                providerId: { type: string }
                model: { type: string }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: object, properties: { script: { type: string } } }
  /generations:
    get:
      tags: [generation]
      summary: List generations (proposed)
      parameters:
        - { name: page, in: query, schema: { type: integer, default: 1 } }
        - { name: pageSize, in: query, schema: { type: integer, default: 20, maximum: 50 } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  items: { type: array, items: { $ref: "#/components/schemas/Generation" } }
                  total: { type: integer }
                  page: { type: integer }
                  pageSize: { type: integer }
  /generations/{id}/download-urls:
    get:
      tags: [generation]
      summary: Presigned output URLs (proposed)
      parameters: [ { name: id, in: path, required: true, schema: { type: string } } ]
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  mp3Url: { type: [string, "null"] }
                  wavUrl: { type: [string, "null"] }
                  videoUrl: { type: [string, "null"] }
        "400": { description: Not ready }
  /jobs/{id}/status:
    get:
      tags: [jobs]
      summary: Progress polling fallback (proposed)
      parameters: [ { name: id, in: path, required: true, schema: { type: string } } ]
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  generationId: { type: string }
                  status: { type: string, enum: [QUEUED, RUNNING, DONE, FAILED, CANCELLED] }
                  phase: { type: [string, "null"] }
                  progress: { type: [number, "null"] }
                  message: { type: [string, "null"] }
                  errorMessage: { type: [string, "null"] }
                  updatedAt: { type: string, format: date-time }
```

## Changelog
- 2026-07-05: v1.0 initial API contract + OpenAPI sketch.
