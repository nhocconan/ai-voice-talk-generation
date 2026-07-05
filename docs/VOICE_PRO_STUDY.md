# voice-pro Study & SOTA Adoption Plan

**Status:** Research memo · **Last updated:** 2026-06-13

Study of [abus-aikorea/voice-pro](https://github.com/abus-aikorea/voice-pro) (GPL-3.0) to
identify borrowable ideas, plus a survey of current SOTA speech tech and how it maps onto
**Voice Studio**'s existing architecture (Next.js web tier + Python `apps/worker`).

> Licensing note: voice-pro is **GPL-3.0**. We borrow *ideas, model choices, and pipeline
> shape* — not code. Every component below is reachable via permissively-licensed libraries
> (yt-dlp Unlicense, Demucs MIT, faster-whisper MIT, etc.), so nothing here forces a GPL
> obligation on our repo.

---

## 1. What voice-pro is

A Gradio desktop/web app for **speech recognition → translation → dubbing**. It is a
*creator pipeline tool*, not a multi-tenant product. Its strength is the **end-to-end media
pipeline** glued around best-of-breed OSS models:

| Stage | voice-pro tech |
|---|---|
| Source ingest | `yt-dlp` (YouTube/URL download + audio extract) |
| Vocal separation | `Demucs` (Facebook Research) — split vocals vs. music bed |
| Denoise | configurable denoise levels |
| ASR | Whisper / **faster-whisper** / whisper-timestamped / **WhisperX** (word-level + alignment) |
| Sentence seg | `spaCy` |
| Translation | `deep-translator`, Azure Translator |
| TTS | **Edge-TTS** (400+ voices), **F5-TTS / E2-TTS**, **CosyVoice2**, **Kokoro** |
| Subtitles | SRT / ASS / SSA export + word-level highlighting |
| Output | WAV / FLAC / MP3, multi-format via ffmpeg |
| UX | tabbed workflows: Dubbing Studio, Whisper Caption, Translate, Speech Generation |

## 2. Capability comparison vs. Voice Studio

| Capability | voice-pro | Voice Studio (today) | Gap? |
|---|---|---|---|
| Voice cloning (zero-shot) | F5/CosyVoice | VieNeu, VoxCPM2, XTTS, F5, ElevenLabs, Gemini, Xiaomi, xAI | **We're ahead** — richer provider matrix + pluggable `TTSProvider` |
| ASR | faster-whisper / WhisperX | faster-whisper `large-v3` | turbo + word-alignment missing |
| Diarization | (limited) | pyannote 3.1 | **We're ahead** |
| Vocal/music separation | Demucs | — | **Gap** |
| URL / YouTube ingest | yt-dlp | upload only | **Gap** |
| Denoise on enrollment | yes | VAD trim + loudnorm only | Partial gap |
| Subtitle export (SRT/VTT) | yes | burn-in ASS only (re-voice) | **Gap** |
| Re-voice timing fidelity | sentence cut/paste | naive back-to-back stitch | **Gap (correctness)** |
| Audiogram / social video | — | yes (Mode A) | **We're ahead** |
| Video re-voice (preserve frames) | dubbing | yes (Mode B) | par |
| Multi-tenant auth / admin / quotas / audit | — | full | **We're far ahead** |
| Translation / dubbing across langs | core | not a goal (VI/EN voicing) | by design |

**Takeaway:** Voice Studio is the more mature *product*. voice-pro is a better *media
pipeline*. The borrowable value is its **pre/post-processing stages** (separation, URL
ingest, denoise, subtitle export, word-level alignment), not its TTS or app shell.

---

## 3. Borrowable ideas (ranked by value ÷ effort)

### B1 — Vocal/music separation (Demucs) · HIGH value
Two payoffs:
1. **Cleaner enrollment** — strip background music/noise from reference clips before scoring,
   raising clone quality from real-world uploads (NotebookLM exports, recorded talks).
2. **Music-preserving re-voice** — in Mode B, split the source into `vocals` + `accompaniment`,
   replace only the vocal stem with cloned speech, then re-mix over the original music bed.
   Today we *discard* all original audio and lose any music/SFX.

Fits cleanly as `apps/worker/.../audio/separate.py` + an optional `--extra demucs`. MIT-licensed.

### B2 — Word-level ASR + forced alignment (WhisperX) · HIGH value
Our re-voice path relies on segment timing, but `large-v3` segment timestamps drift. WhisperX
(or faster-whisper `word_timestamps=True`, which we already pass but don't use) gives
word-level times → better turn boundaries for diarization and tighter re-voice slots.

### B3 — URL / YouTube ingest (yt-dlp) · MED value
"Re-voice a podcast from a URL" is a natural EA workflow. A small `ingest_url` step that
downloads + extracts audio feeds the existing ASR pipeline. Unlicense. Gate behind admin
toggle (ToS/abuse considerations).

### B4 — Subtitle export SRT/VTT · MED value, LOW effort
We already build timed segments and write `.ass` for burn-in. Emitting `.srt` / `.vtt`
side-files for every re-voice/podcast render is ~30 lines and immediately useful for sharing.

### B5 — Enrollment denoise · MED value
Add an optional denoise pass (DeepFilterNet 3, or `noisereduce`) before quality scoring in the
ingest pipeline. Complements, not replaces, our VAD trim + loudnorm.

### B6 — Tabbed workflow mental model · LOW (already covered)
voice-pro's tab split (caption / translate / generate / dub) maps to flows we already have.
No action — just confirms our IA is sound.

---

## 4. SOTA technology survey (mid-2026) & how to adopt

### 4.1 TTS / voice cloning
Our `TTSProvider` protocol (`prepare_voice` + `synthesize`) makes new engines drop-in. Current
SOTA worth adding as adapters:

| Model | Why | License | Fit |
|---|---|---|---|
| **IndexTTS-2 / 2.5** | SOTA zero-shot WER + speaker similarity; **disentangled emotion control** (borrow one speaker's timbre, another's emotion); strongest cross-lingual emotion similarity | Apache-ish | High-quality lane alongside VoxCPM2 |
| **Chatterbox / Chatterbox-Turbo (Multilingual)** | Beat ElevenLabs 65.3% vs 24.5% in blind tests; single-GPU cloning; expressive | MIT | Strong cloud-free expressive lane |
| **Fish Audio OpenAudio S1 (Fish Speech)** | 80+ langs, clone + cross-lingual, hosted API 5–10× cheaper than ElevenLabs | mixed | Cheap cloud-cloning fallback (replaces the "MiniMax someday" note) |
| **Kokoro (82M)** | 210× realtime on a 4090, Apache-2.0, ranked #2 TTS Arena | Apache-2.0 | Fast **preview/draft** synth for the 15-sec preview path |
| **Qwen3-TTS** | strong multilingual incl. CJK | — | future |

**Recommendation:** Don't chase all of them. Add **IndexTTS-2** (quality lane) and **Kokoro**
(fast preview) — they fill the two real gaps (top-end fidelity + cheap fast preview). Treat
Chatterbox/Fish as documented options behind the same protocol.

### 4.2 ASR
- Move ASR model to a **config value** (don't hardcode `large-v3`). Default to
  **`large-v3-turbo`** (≈8× faster, near-identical WER) for Mac CPU/MPS responsiveness; keep
  `large-v3` selectable for max accuracy.
- Actually *consume* the `word_timestamps` we already request (feeds B2 and tighter slots).
- Optional future: NVIDIA **Parakeet/Canary** on the eventual Linux+GPU worker (English-heavy).

### 4.3 Diarization
pyannote `speaker-diarization-3.1` is still solid. Optional upgrade: NVIDIA NeMo **Sortformer**
(streaming, fewer errors) once on GPU. No action for v1.

### 4.4 Re-voice timing (correctness, not a model)
The biggest *technical* gap. PRD FR-9 promises ±5% timing preservation, but
`video_revoice.py` stitches synthesized segments **back-to-back** — drift accumulates and the
new audio desyncs from the preserved video frames. Fix: place each segment at its original
`start_ms` (silence-pad the gaps), and optionally time-fit overruns with ffmpeg `atempo`
(or rubberband for pitch-preserving stretch). **Implemented now — see §6.**

---

## 5. Prioritized roadmap

| # | Item | Value | Effort | Risk | Status |
|---|---|---|---|---|---|
| 1 | Re-voice timeline alignment (FR-9) | High | Low | Low | **Done** |
| 2 | Subtitle SRT/VTT export | Med | Low | Low | **Done** |
| 3 | Configurable ASR model + `large-v3-turbo` default | Med | Low | Low | **Done** |
| 4 | Demucs separation (enrollment clean + music-preserving re-voice) | High | Med | Med | **Done** |
| 5 | Kokoro provider (fast preview lane) | Med | Med | Low | **Done** |
| 6 | IndexTTS-2 provider (quality lane) | High | Med | Med | **Done** |
| 7 | yt-dlp URL ingest (admin-gated) | Med | Med | Med (ToS) | **Done** |
| 8 | Enrollment denoise (DeepFilterNet) | Med | Med | Low | **Done** |

## 6. Implemented

All eight items above are implemented in the worker, each following existing patterns (a new
`audio/*.py`/`pipelines/*.py` helper or a `providers/*.py` adapter behind an
`[project.optional-dependencies]` extra and a lazy import, so heavy ML deps stay optional).

| Item | Code |
|---|---|
| 1 Timeline align | `audio/stitch.py::stitch_to_timeline()` + `pipelines/video_revoice.py`. Places each synthesized segment at its original `start_ms` on a silence canvas so replaced audio stays locked to the preserved frames (FR-9). Unit-tested. |
| 2 Subtitles | `audio/subtitles.py` (`write_srt`/`write_vtt`); video re-voice now uploads `output.srt`/`output.vtt` beside the render. Unit-tested. |
| 3 ASR | `config.py` `ASR_MODEL` (default `large-v3-turbo`) + `ASR_COMPUTE_TYPE`; `pipelines/asr.py` reads them. |
| 4 Separation | `audio/separate.py` (`separate_vocals`, `mix_over_bed`); enrollment clean behind `ENROLL_SEPARATE`; re-voice `preserveMusic` flag mixes cloned voices over the original instrumental bed. Extra: `demucs`. |
| 5 Kokoro | `providers/kokoro.py` (`KOKORO`) — fast preset-voice synth for previews/drafts. Extra: `kokoro`. |
| 6 IndexTTS-2 | `providers/indextts.py` (`INDEXTTS2`) — zero-shot cloning + emotion control. From-source install. |
| 7 URL ingest | `pipelines/url_ingest.py` + gated `POST /ingest-url` (worker), `ALLOW_URL_INGEST`. Extra: `ingest`. |
| 8 Denoise | `audio/denoise.py`; enrollment denoise behind `ENROLL_DENOISE`. Extra: `denoise`. |

Providers 5 & 6 are registered in `providers/registry.py`, added to the `ProviderName` Prisma
enum, and given full admin cards in `apps/web/src/lib/providers-meta.ts`.

### Remaining wiring (web tier, not done here)
- **Prisma migration** for the two new `ProviderName` enum values (`KOKORO`, `INDEXTTS2`):
  run `pnpm db:migrate` — intentionally not run against a live DB from this change.
- **UI surfacing** of subtitle side-files and the `preserveMusic` / URL-ingest controls
  (the worker honours them; the web forms/columns are a follow-up). Subtitle files already
  land at `renders/{id}/output.srt|.vtt` by convention.
- **Emotion/style** beyond neutral is a v1 non-goal in the PRD; IndexTTS-2's emotion knobs are
  wired but should stay admin-config-only until that non-goal is revisited.

## 7. July 2026 world-class pass

Follow-up work closing the highest-impact gaps toward a world-class Vietnamese
talk/podcast studio (verified via unit tests + a live light/dark UI check).

| Area | Change | Code |
|---|---|---|
| **Vietnamese quality** | Text normalization: numbers/dates/times/currency/%/units/abbrev → spoken Vietnamese (e.g. `123 tỷ → một trăm hai mươi ba tỷ`, `15/9/2026 → ngày mười lăm tháng chín…`). Dependency-free, NFC-normalized, 45 unit tests. Wired into presentation, podcast and video re-voice synthesis. | `worker/text/vietnamese.py`, `config.VI_NORMALIZE`, `render.prepare_tts_text()` |
| **Text overlay (captions)** | Word-level **animated captions** — the "active word pop" look (Submagic/CapCut/NotebookLM style): the spoken word recolours to the accent + scales while the line stays dim. Consumes faster-whisper word timing (previously requested but discarded). Presets `pop` / `karaoke`. Applied to audiograms (Mode A) and video re-voice (Mode B). | `worker/audio/captions.py` (+8 tests), `worker/audio/align.py`, `config.AUDIOGRAM_WORD_CAPTIONS`/`CAPTION_PRESET` |
| **Caption reliability** | The silent "no libass → no captions" failure now logs a loud, actionable warning (`brew install ffmpeg`). Production docker ffmpeg has libass; a minimal/static Mac ffmpeg does not. | `worker/audio/audiogram.py` |
| **Web UI — dark mode** | Full light/dark theming: `.dark` token set (warm-ink surfaces, recomputed shadows, lifted accent for contrast), `next-themes`-free `ThemeProvider` + no-flash script, 3-way theme toggle, defined the previously-undefined `--color-surface-2/3` + `--color-text-tertiary`, tokenized 20+ hardcoded `bg-black`/`border-black` so the "black pill" CTA inverts to off-white on dark. | `apps/web/src/styles/tokens.css`, `components/features/shell/ThemeProvider.tsx`, `ThemeToggle.tsx` |
| **Web UI — i18n/UX** | Language switcher (VI/EN) wired to the locale cookie; nav + theme copy now sourced from `messages/*.json` (previously hardcoded English despite a `vi` default). | `LanguageSwitcher.tsx`, `AppShell.tsx`, `messages/{en,vi}.json` |

### Completeness pass (full Vietnamese + product polish)

| Area | Change |
|---|---|
| **Full app i18n** | Every user-facing surface renders Vietnamese (default locale): dashboard, all 4 generate flows (pages + forms), voices, history, settings, admin (8 components + 9 page wrappers), auth (4 pages + forms), enrollment, share, nav, FeatureGate. Provider metadata (`providers-meta.ts`) is locale-aware (VI taglines/help/config labels; commands/URLs stay English). 600 message keys, EN/VI at parity, all 439 `t()` call sites resolve. |
| **Cost hint** | Pre-render "estimated cost" per selected provider on every generate form (`lib/provider-pricing.ts` + `EstimatedCost`): local = free, xAI ≈ $0.003/min, ElevenLabs premium, etc. |
| **Resilience** | `GenerationProgress` now surfaces FAILED renders (and dead SSE streams) as a visible error panel instead of closing silently; `(app)/error.tsx` segment error boundary; retry button on failed enrollment uploads. |
| **Provider tuning** | Gemini text model configurable via `GEMINI_TEXT_MODEL` (default `gemini-2.5-flash`, up from `2.0-flash`). |
| **Mobile** | Admin tables wrapped in horizontal-scroll containers; cramped 2-col grids made responsive (`grid-cols-1 sm:grid-cols-2`); verified no body overflow at 375 px. |

**Provider fact-check (mid-2026 research):** the "xAI ~$0.05/min" belief is ~10–15× too high — xAI Grok TTS is ≈**$0.003/min** ($4.20/1M chars) and is the cheapest Vietnamese-capable cloning API; the real $0.05 figure is ElevenLabs Flash's *per-1k-char* rate. Best local Vietnamese lane on a 16 GB Mac remains **VieNeu-TTS** (Apache-2.0, ~2–4 GB, real-time on CPU — prefer its ONNX-CPU path over MPS). VoxCPM2 stays a Linux-GPU quality lane (2 B params, fragile on MPS).

## Sources
- voice-pro: https://github.com/abus-aikorea/voice-pro
- TTS landscape 2026: https://www.tryspeakeasy.io/blog/open-source-text-to-speech-2026 ·
  https://findskill.ai/blog/best-open-source-tts-2026/ · https://bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models
- IndexTTS report: https://arxiv.org/pdf/2601.03888
- Voice cloning survey: https://arxiv.org/pdf/2505.00579
