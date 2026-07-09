# Voice Provider Evaluation — April 2026

This document records the voice-cloning and long-form TTS options evaluated for Voice Studio up to `2026-04-20`.

## Scope

Target use case:

- `1–2` cloned voice profiles
- `7` generations per week
- `20–30` minutes per generation
- Vietnamese first, English second
- Best case: runs well on `Mac Mini M4 16GB` or `MacBook Pro M1 Pro 16GB`
- v1 goal: low ops, low recurring cost, simple admin setup

## Evaluation Criteria

Each option was scored on the same criteria:

- Vietnamese quality
- Voice cloning quality from short enrollment audio
- Long-form stability for `20–60` minute talk generation
- Reality of running on Apple Silicon
- Cost for low-volume internal usage
- License and deployment risk
- Fit with the current app architecture

## Options Considered

### 1. VibeVoice

Status: not recommended as a primary provider.

Why it was considered:

- Strong research demos for expressive long-form multi-speaker generation
- Public project page and Hugging Face model card still exist

Why it was rejected for primary use:

- Official repo removed TTS code and usage path
- Vietnamese is not a stable primary language target
- Production-readiness is weak relative to the rest of the stack
- Current worker integration is still only a research stub

Best use:

- Research comparison only

### 2. Gemini TTS

Status: useful fallback, not voice cloning.

What it does well:

- Cheap multilingual TTS
- Good fit for drafting, pacing, and preset-voice generation

Why it is not enough:

- No standard self-serve custom voice cloning path for user-uploaded reference clips in the Gemini TTS API flow used by this app

Best use:

- Preset-voice fallback
- Script drafting and pacing tools

### 3. ElevenLabs

Status: quality fallback, not the cheapest default.

What it does well:

- Strong commercial voice cloning
- Predictable hosted operations
- Good escape hatch when local providers are too slow or unstable

What holds it back:

- Recurring spend is meaningful once generation volume grows
- Less attractive than local-first for the current low-volume internal MVP

Best use:

- Paid fallback for high-value leadership voices

### 4. MiniMax Speech

Status: cheapest serious cloud-cloning option evaluated.

What it does well:

- Very strong cost profile for speech generation
- Cheap voice profile creation

Why it is not the current primary choice in this repo:

- Current app and operating model prefer local-first on Mac
- Extra cloud dependency and governance work was not the first priority for this phase

Best use:

- Future low-cost cloud option if local Mac throughput becomes unacceptable

### 5. Google Chirp 3 Instant Custom Voice

Status: technically relevant, operationally gated.

What it does well:

- Matches the product problem more directly than Gemini TTS because it supports custom voice creation
- Vietnamese support is promising

Why it is not the current default:

- Access and rollout are more constrained than the local-first plan

Best use:

- Future enterprise path if managed Google custom voice becomes preferable

### 6. XTTS v2

Status: legacy local fallback.

What it does well:

- Mature enough to keep as a compatibility provider
- Already integrated in the worker

Why it is no longer the lead local path:

- Not the best Mac-first Vietnamese recommendation anymore
- Local provider landscape moved on

Best use:

- Fallback provider

### 7. F5-TTS

Status: secondary local fallback.

What it does well:

- Still useful for Vietnamese-oriented local testing

Why it is not primary now:

- `VieNeu-TTS` is a better fit for the current Mac-first MVP direction
- `VoxCPM2` is a stronger future high-quality path

Best use:

- Secondary benchmark and fallback lane

### 8. VieNeu-TTS

Status: recommended local-first provider for this product.

Why it won:

- Vietnamese-first design
- Instant voice cloning from short reference audio
- Strong Apple Silicon story
- Supports fully local or hybrid remote-server operation
- Marginal generation cost is effectively zero once the host is provisioned

Risks:

- Need to verify the exact model/runtime chosen by admin
- Long-form quality still depends on chunking, reference quality, and runtime mode

Best use:

- Primary local provider on Mac Mini / MacBook Pro

### 9. VoxCPM2

Status: recommended advanced-quality provider.

Why it made the shortlist:

- Strong multilingual support including Vietnamese
- Controllable cloning and style prompting
- Better long-term migration path to Linux GPU serving

Risks:

- Official fast path is still CUDA-oriented
- Apple Silicon usage needs explicit testing before making it the main default
- Heavier runtime than VieNeu-TTS

Best use:

- High-quality lane
- Future GPU production provider
- A/B comparison against VieNeu-TTS for leadership voices

### 10. Voicebox

Status: useful shell idea, not a core provider decision.

Why it matters:

- Good inspiration for desktop UX and editing workflows

Why it is not part of the provider matrix:

- It is an app shell, not the primary Vietnamese voice provider itself

## Decision Summary

### Primary choices

- `VieNeu-TTS` becomes the main local-first provider for Mac-based deployments.
- `VoxCPM2` is added as the advanced-quality provider for future GPU scale-up and selective high-fidelity use.

### Secondary choices

- `XTTS v2` and `F5-TTS` stay in the matrix as compatibility and benchmark options.
- `ElevenLabs` and `Gemini TTS` stay as cloud fallbacks.

### Demoted choices

- `VibeVoice` stays documented for research history only.

## Cost View For The Current Usage

Assumed usage:

- `7` generations per week
- `20–30` minutes per generation
- about `606–909` generated minutes per month

### Local-first

- `VieNeu-TTS`: near-zero marginal audio cost after the host is running
- `VoxCPM2`: near-zero marginal audio cost after the host is running, but heavier runtime cost and more operator time

### Cloud fallback

- `ElevenLabs`: higher recurring spend, but simple operations and strong quality
- `Gemini TTS`: cheap speech generation, but not user voice cloning
- `MiniMax Speech`: cheapest serious cloud-cloning path found during research, but not yet integrated in this repo

## Product Decision For v1

The product should treat `voice profile creation` as `few-shot / instant cloning`, not per-user model training.

For v1:

- Let users upload and manage voice reference samples
- Reuse those samples across providers
- Keep provider switching at the app level
- Do not assume a voice clone created by one vendor can be exported and reused by another vendor

## Engineering Implications

- Provider settings must expose step-by-step setup and configuration directly in the admin UI
- The worker must read provider-specific runtime config from `provider_configs.config`
- Generation flows must let users override provider per render for A/B testing
- Mac deployment docs must explain both the `VieNeu-TTS` path and the `VoxCPM2` path

## Current Recommendation

If the deployment target is a Mac with `16GB` memory:

1. Start with `VieNeu-TTS`
2. Keep `VoxCPM2` available for targeted quality tests
3. Keep `ElevenLabs` only as a paid fallback
4. Use `Gemini TTS` only where cloning is not required

## Update — July 2026: MiniMax promoted to primary cloud cloning lane

Field experience since April changed the picture:

- Production moved to a shared CPU-only Linux host, not the Mac Mini the local-first plan assumed. `VieNeu-TTS` stays as the free experimental lane only.
- `xAI Grok TTS` custom voices turned out to be Enterprise-gated at the API (`403 Custom voices are not enabled for this team`); buying credits does not unlock `POST /v1/custom-voices`. Kept only as a `customVoiceId` pass-through lane.
- `MiniMax Speech` (flagged in April as the cheapest serious cloud-cloning option) is now integrated as the `MINIMAX_TTS` provider: rapid clone from a 10 s–5 min reference (~$1.5 one-time per voice, charged on first use), `speech-2.6-hd` synthesis at $100/1M chars (~$2–3 per 30-minute Vietnamese render), prepaid credit with no subscription — the right shape for infrequent generation. Caveat: MiniMax deletes clones unused for 7 days; the worker derives the voice_id from the reference-clip hash and re-clones automatically.
- `Fish Audio` (S2.1 Pro, $15/1M UTF-8 bytes, 83 languages incl. Vietnamese) noted as the ultra-cheap alternative if MiniMax quality disappoints.

**Current recommendation (July 2026): MiniMax Speech as default provider; ElevenLabs as premium fallback; VieNeu-TTS as free local experiment lane.**

## Update — 2026-07-09: VieNeu verified locally; MiniMax model family rotated

**VieNeu-TTS verified working end to end** on Apple Silicon via the worker venv (`vieneu` SDK 2.4.3, model `pnnbao-ump/VieNeu-TTS`, local mode). Clone-from-reference and synthesis both produce correct 24 kHz Vietnamese audio, and a two-speaker podcast was rendered from two distinct reference clips.

Timings measured on a single short reference clip on one Apple Silicon machine — indicative only, **not a benchmark**, and not comparable to the cloud lanes which are network-bound:

| Step | Observed |
|---|---|
| `prepare_voice` (encode_reference), cold | ~13 s (first call also loads the model) |
| `prepare_voice`, warm (second speaker) | ~0.2 s |
| `synthesize`, short segment (1–2 sentences) | ~0.5–1.2 s |

This does not change the recommendation: VieNeu remains the free local lane, because production runs on a shared CPU-only Linux host, not this machine.

**MiniMax model family rotated.** MiniMax now lists `speech-2.6-hd` / `speech-2.6-turbo` as deprecated and documents `speech-2.8-hd` / `speech-2.8-turbo` as drop-in replacements with an identical parameter interface. The provider default (worker fallback, `defaultConfig`, and seed) moved to `speech-2.8-hd`; existing `provider_configs` rows are untouched and still carry `speech-2.6-hd` until an operator switches them in `/admin/providers`. The `$100/1M chars` figure in `provider-pricing.ts` is MiniMax's published HD rate and has **not** been re-verified against 2.8 list pricing.

The MiniMax integration itself has **not been live-tested** in the dev environment — no `MINIMAX_API_KEY` is configured locally. Its request flow (`files/upload` → `voice_clone` → `t2a_v2`), the audio constraints it enforces (mp3/m4a/wav, 10 s–5 min, ≤20 MB), and its clone-reuse behaviour were verified by reading MiniMax's current documentation against the worker code, not by calling the API.

## Changelog

- 2026-04-20: Initial evaluation memo recorded in the repo.
- 2026-07-08: MiniMax Speech integrated and promoted to primary cloud voice-cloning lane; xAI demoted to customVoiceId pass-through.
- 2026-07-09: VieNeu-TTS verified locally (clone + synthesis + 2-voice podcast). MiniMax `speech-2.6-*` recorded as deprecated; default moved to `speech-2.8-hd`. Working tree, pending commit.
