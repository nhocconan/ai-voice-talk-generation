/**
 * Provider metadata — docs links, setup steps, and editable config fields.
 * Displayed on /admin/providers and reused by generation provider pickers.
 */

export interface ProviderDocLink {
  label: string
  url: string
}

export interface ProviderConfigOption {
  label: string
  value: string
}

export interface ProviderConfigField {
  key: string
  label: string
  input: "text" | "url" | "number" | "select" | "textarea" | "boolean"
  description: string
  placeholder?: string
  options?: ProviderConfigOption[]
}

export interface ProviderMeta {
  name: string
  shortName: string
  tagline: string
  needsApiKey: boolean
  docsLinks: ProviderDocLink[]
  supports: {
    tts: boolean
    voiceCloning: boolean
    asr: boolean
    diarization: boolean
    streaming: boolean
    styleConditioning: boolean
    languages: string[]
  }
  setupSteps: string[]
  helpsWith: string[]
  defaultConfig?: Record<string, unknown>
  configFields?: ProviderConfigField[]
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  VIENEU_TTS: {
    name: "VieNeu-TTS",
    shortName: "VieNeu",
    tagline: "FREE unlimited Vietnamese cloning lane — runs on this server's CPU (no API cost, no per-voice fee). Approximate clone quality: perfect for screening many voices before pinning a cloud voice.",
    needsApiKey: false,
    docsLinks: [
      { label: "GitHub", url: "https://github.com/pnnbao97/VieNeu-TTS" },
      { label: "Docs", url: "https://docs.vieneu.io/" },
      { label: "Model", url: "https://huggingface.co/pnnbao-ump/VieNeu-TTS" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: true,
      styleConditioning: false,
      languages: ["vi", "en"],
    },
    setupSteps: [
      "No key needed — the SDK ships in the production worker image (built with `--extra vieneu`). Click Test: green means the runtime loaded.",
      "Enable the provider. Voice profiles clone automatically from their uploaded samples on every render — nothing else to configure.",
      "Use this lane to screen many people's voices for $0: enroll a profile, render a short script, listen. Expect roughly 5–15 s per sentence on CPU, so keep screening scripts short.",
      "Clone quality is approximate (regional accent/timbre may drift). Once a voice passes screening, pin an xAI Console voice_id on the profile for production-quality renders.",
      "Optional: for a faster dedicated host, run a VieNeu server elsewhere and set `mode=remote` plus `apiBase` in the config form below.",
    ],
    helpsWith: [
      "FREE unlimited screening of candidate voices — no per-voice or per-character cost",
      "Vietnamese-first local cloning directly from enrolled profile samples",
      "Low-cost 20–60 minute talk rendering with chunked synthesis (slow but free on CPU)",
    ],
    defaultConfig: {
      model: "pnnbao-ump/VieNeu-TTS",
      mode: "local",
      device: "mps",
      referenceText: "",
      maxChunkChars: 320,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "Hugging Face model ID or local model name used by the VieNeu SDK.",
        placeholder: "pnnbao-ump/VieNeu-TTS",
      },
      {
        key: "mode",
        label: "Runtime Mode",
        input: "select",
        description: "Use `local` when the worker runs VieNeu directly. Use `remote` when you already run a separate VieNeu API server.",
        options: [
          { value: "local", label: "Local SDK" },
          { value: "remote", label: "Remote API" },
        ],
      },
      {
        key: "apiBase",
        label: "Remote API Base",
        input: "url",
        description: "Required only for remote mode. Example: `http://127.0.0.1:23333/v1`.",
        placeholder: "http://127.0.0.1:23333/v1",
      },
      {
        key: "device",
        label: "Preferred Device",
        input: "select",
        description: "Stored for operator clarity. VieNeu local Mac installs should prefer `mps`.",
        options: [
          { value: "mps", label: "Apple Silicon (mps)" },
          { value: "cpu", label: "CPU" },
          { value: "cuda", label: "CUDA" },
        ],
      },
      {
        key: "referenceText",
        label: "Reference Transcript",
        input: "textarea",
        description: "Optional transcript for the reference clip. Leave blank for the default zero-shot flow.",
        placeholder: "Optional exact transcript of the enrollment clip",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Upper bound for chunked synthesis in this app. Keep moderate for long-form stability.",
      },
    ],
  },
  VOXCPM2: {
    name: "VoxCPM2",
    shortName: "VoxCPM2",
    tagline: "OpenBMB's multilingual 48kHz TTS with controllable cloning, style prompt support, and a strong future GPU path.",
    needsApiKey: false,
    docsLinks: [
      { label: "GitHub", url: "https://github.com/OpenBMB/VoxCPM" },
      { label: "Docs", url: "https://voxcpm.readthedocs.io/en/latest/" },
      { label: "Model", url: "https://huggingface.co/openbmb/VoxCPM2" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: true,
      styleConditioning: true,
      languages: ["vi", "en", "zh", "fr", "de", "es", "pt", "ja", "ko", "th", "id", "ms"],
    },
    setupSteps: [
      "Install the official Python package in the worker: `cd apps/worker && uv sync --extra voxcpm`.",
      "Start with the default model `openbmb/VoxCPM2`. Official docs benchmark CUDA first; MPS on Mac is best-effort and should be tested before promoting to production default.",
      "If you want full 'ultimate cloning', fill `Prompt Transcript` with the exact transcript of the reference clip and enable `Use Prompt Clone`.",
      "For production throughput on Linux GPU, OpenBMB recommends Nano-vLLM or vLLM-Omni. This app's built-in adapter currently targets the official Python API path.",
      "Save config, press Test, and only then enable the provider for users.",
      "Use this provider when you need stronger style control or want a clearer migration path to future Linux+GPU workers.",
    ],
    helpsWith: [
      "Higher-fidelity multilingual voice cloning",
      "Style-guided presentations and podcasts",
      "Future Linux+GPU production serving",
      "48kHz output for premium voice profiles",
    ],
    defaultConfig: {
      model: "openbmb/VoxCPM2",
      device: "cuda",
      cfgValue: 2,
      inferenceTimesteps: 10,
      loadDenoiser: false,
      usePromptClone: false,
      promptText: "",
      maxChunkChars: 260,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "Hugging Face model ID or local checkpoint directory for VoxCPM2.",
        placeholder: "openbmb/VoxCPM2",
      },
      {
        key: "device",
        label: "Preferred Device",
        input: "select",
        description: "Official fast path is CUDA. `mps` is supported here as an operator-configured best-effort path.",
        options: [
          { value: "cuda", label: "CUDA" },
          { value: "mps", label: "Apple Silicon (mps)" },
          { value: "cpu", label: "CPU" },
        ],
      },
      {
        key: "cfgValue",
        label: "CFG Value",
        input: "number",
        description: "Classifier-free guidance value used during generation. Default `2.0` matches the official examples.",
      },
      {
        key: "inferenceTimesteps",
        label: "Inference Steps",
        input: "number",
        description: "Diffusion steps. Higher improves quality but costs more latency.",
      },
      {
        key: "loadDenoiser",
        label: "Load Denoiser",
        input: "boolean",
        description: "Enable only if you want the denoiser stage and have enough memory headroom.",
      },
      {
        key: "usePromptClone",
        label: "Use Prompt Clone",
        input: "boolean",
        description: "When enabled, the app reuses the reference clip as both `reference_wav_path` and `prompt_wav_path`.",
      },
      {
        key: "promptText",
        label: "Prompt Transcript",
        input: "textarea",
        description: "Exact transcript of the reference clip for 'ultimate cloning'. Leave blank for standard controllable cloning.",
        placeholder: "Transcript of the reference recording",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk inside this app's render pipeline.",
      },
    ],
  },
  XTTS_V2: {
    name: "Coqui XTTS v2 (DROPPED)",
    shortName: "XTTS ✕",
    tagline:
      "DROPPED from this product. Stock Coqui XTTS-v2 has no Vietnamese, heavy deps, and CPML friction. Historical rows only — do not enable.",
    needsApiKey: false,
    docsLinks: [
      { label: "Why dropped", url: "https://github.com/idiap/coqui-ai-TTS" },
    ],
    supports: {
      tts: false,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: [],
    },
    setupSteps: [
      "Do not enable. Worker registry rejects XTTS_V2.",
      "Vietnamese local screening → VieNeu-TTS.",
      "Vietnamese production clone → MiniMax Speech, xAI Grok TTS, or ElevenLabs.",
      "Multilingual open local (needs GPU) → VoxCPM2.",
    ],
    helpsWith: [
      "Nothing — kept only so old generation history still resolves provider name",
    ],
    defaultConfig: {
      model: "tts_models/multilingual/multi-dataset/xtts_v2",
      device: "mps",
      maxChunkChars: 250,
      deprecated: true,
    },
    configFields: [],
  },
  F5_TTS: {
    name: "F5-TTS",
    shortName: "F5",
    tagline: "Existing local fallback for Vietnamese-oriented synthesis, kept as a secondary option next to VieNeu-TTS.",
    needsApiKey: false,
    docsLinks: [
      { label: "GitHub", url: "https://github.com/SWivid/F5-TTS" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["vi", "en", "zh"],
    },
    setupSteps: [
      "F5-TTS runs inside the worker; no API key is required.",
      "Keep this provider disabled unless the worker host has the F5 runtime installed and tested.",
      "Use it as a fallback local provider, not as the primary Mac recommendation now that VieNeu-TTS is supported.",
    ],
    helpsWith: [
      "Legacy Vietnamese local TTS experiments",
      "Fallback provider benchmarking",
    ],
    defaultConfig: {
      model: "F5TTS_v1_Base",
      maxChunkChars: 300,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "F5 model name passed to the local loader.",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk for app-level chunking.",
      },
    ],
  },
  ELEVENLABS: {
    name: "ElevenLabs",
    shortName: "ElevenLabs",
    tagline: "Commercial cloud fallback with instant voice cloning and predictable ops.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Keys", url: "https://elevenlabs.io/app/settings/api-keys" },
      { label: "Docs", url: "https://elevenlabs.io/docs" },
      { label: "Pricing", url: "https://elevenlabs.io/pricing" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: true,
      styleConditioning: true,
      languages: ["en", "vi", "es", "fr", "de", "it", "pt", "pl", "zh", "ja", "ko", "ar", "hi"],
    },
    setupSteps: [
      "Create an ElevenLabs account and generate an API key.",
      "Paste the key below, then use Test & Save so the app verifies the account before storing the secret.",
      "Tune the model and voice settings in the config form if you need a cloud fallback profile different from the default multilingual model.",
      "Enable the provider only if you want paid fallback capacity.",
    ],
    helpsWith: [
      "Paid fallback when local providers are too slow or unavailable",
      "Highest-fidelity commercial voice cloning for leadership profiles",
      "Streaming synthesis for long content",
    ],
    defaultConfig: {
      model: "eleven_multilingual_v2",
      stability: 0.5,
      similarityBoost: 0.8,
      style: 0,
      useSpeakerBoost: true,
      maxChunkChars: 2500,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "ElevenLabs model ID used for text-to-speech requests.",
      },
      {
        key: "stability",
        label: "Stability",
        input: "number",
        description: "Voice stability value between 0 and 1.",
      },
      {
        key: "similarityBoost",
        label: "Similarity Boost",
        input: "number",
        description: "Similarity boost between 0 and 1.",
      },
      {
        key: "style",
        label: "Style",
        input: "number",
        description: "Style exaggeration between 0 and 1.",
      },
      {
        key: "useSpeakerBoost",
        label: "Use Speaker Boost",
        input: "boolean",
        description: "Enable ElevenLabs speaker boost.",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum chunk size for long-form scripts.",
      },
    ],
  },
  GEMINI_TTS: {
    name: "Gemini TTS (Google)",
    shortName: "Gemini",
    tagline: "Cheap multilingual preset-voice TTS plus the same API key powers drafting and pacing helpers.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Keys", url: "https://aistudio.google.com/apikey" },
      { label: "Speech Docs", url: "https://ai.google.dev/gemini-api/docs/speech-generation" },
      { label: "Pricing", url: "https://ai.google.dev/pricing" },
    ],
    supports: {
      tts: true,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["vi", "en", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"],
    },
    setupSteps: [
      "Generate a Google AI Studio API key and paste it below.",
      "Use Test & Save to verify the key and that the model list is reachable from this host.",
      "Choose the TTS model and preset voice in the config form if you do not want the defaults.",
      "Remember: Gemini TTS does not clone user voices in this app. It stays here as a low-cost preset-voice fallback and for drafting features.",
    ],
    helpsWith: [
      "Low-cost preset voice generation",
      "Script drafting, pacing lock, and transcript conversion",
      "Cloud fallback when cloning is not required",
    ],
    defaultConfig: {
      model: "gemini-2.5-flash-preview-tts",
      voiceName: "Aoede",
      maxChunkChars: 5000,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "Gemini speech-generation model ID.",
      },
      {
        key: "voiceName",
        label: "Preset Voice",
        input: "text",
        description: "Google prebuilt voice name, for example `Aoede`.",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum chunk size for long-form synthesis.",
      },
    ],
  },
  XIAOMI_TTS: {
    name: "Xiaomi MiMo TTS",
    shortName: "MiMo",
    tagline: "MiMo-V2.5-TTS series with built-in voices, voice design, and audio-sample voice cloning. Free for a limited time.",
    needsApiKey: true,
    docsLinks: [
      { label: "Console", url: "https://platform.xiaomimimo.com/#/console/api-keys" },
      { label: "Speech Synthesis Docs", url: "https://platform.xiaomimimo.com/#/docs/usage-guide/speech-synthesis-v2.5" },
      { label: "Pricing", url: "https://platform.xiaomimimo.com/#/docs/pricing" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: true,
      styleConditioning: true,
      languages: ["zh", "en", "vi"],
    },
    setupSteps: [
      "Sign in to platform.xiaomimimo.com with a Xiaomi account and create an API key in the Console.",
      "Pay-as-you-go keys (sk-…) use https://api.xiaomimimo.com/v1; Token Plan keys (tp-…) use https://token-plan-sgp.xiaomimimo.com/v1. The worker auto-routes by prefix, or override via the Base URL field.",
      "Paste the key below, then use Test & Save so the worker verifies it before storing.",
      "Pick a built-in voice (Chloe, Mia, Milo, Dean, 冰糖, 茉莉, 苏打, 白桦) — used when no clone sample is supplied.",
      "Enable the provider once tests pass. For voice clones, the worker re-sends the reference clip on every request.",
    ],
    helpsWith: [
      "Bilingual Chinese / English / Vietnamese voice cloning from a short reference",
      "Style-controlled narration via natural-language director prompts",
      "Cheap (free during beta) cloud fallback for podcast and presentation modes",
    ],
    defaultConfig: {
      baseUrl: "",
      model: "mimo-v2.5-tts",
      cloneModel: "mimo-v2.5-tts-voiceclone",
      voice: "Chloe",
      format: "wav",
      style: "",
      maxChunkChars: 1500,
    },
    configFields: [
      {
        key: "baseUrl",
        label: "Base URL",
        input: "url",
        description: "Leave blank to auto-route by key prefix. Pay-as-you-go: https://api.xiaomimimo.com/v1. Token Plan: https://token-plan-sgp.xiaomimimo.com/v1.",
        placeholder: "https://token-plan-sgp.xiaomimimo.com/v1",
      },
      {
        key: "model",
        label: "Built-in Model",
        input: "text",
        description: "Model used when synthesising with a built-in voice (no reference sample).",
      },
      {
        key: "cloneModel",
        label: "Clone Model",
        input: "text",
        description: "Model used when a reference audio sample is provided for cloning.",
      },
      {
        key: "voice",
        label: "Built-in Voice",
        input: "select",
        description: "Default voice for built-in synthesis. Ignored when cloning.",
        options: [
          { value: "mimo_default", label: "MiMo Default" },
          { value: "Chloe", label: "Chloe (English Female)" },
          { value: "Mia", label: "Mia (English Female)" },
          { value: "Milo", label: "Milo (English Male)" },
          { value: "Dean", label: "Dean (English Male)" },
          { value: "冰糖", label: "冰糖 (Chinese Female)" },
          { value: "茉莉", label: "茉莉 (Chinese Female)" },
          { value: "苏打", label: "苏打 (Chinese Male)" },
          { value: "白桦", label: "白桦 (Chinese Male)" },
        ],
      },
      {
        key: "format",
        label: "Audio Format",
        input: "select",
        description: "Output codec returned by the API.",
        options: [
          { value: "wav", label: "WAV" },
          { value: "mp3", label: "MP3" },
          { value: "pcm16", label: "PCM16" },
        ],
      },
      {
        key: "style",
        label: "Default Style Prompt",
        input: "textarea",
        description: "Optional natural-language style guidance prepended to every synthesis request.",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk for long-form scripts.",
      },
    ],
  },
  XAI_TTS: {
    name: "xAI Grok TTS",
    shortName: "Grok",
    tagline: "Low-cost xAI render lane using account-validated Voice IDs pinned to voice profiles.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Console", url: "https://console.x.ai" },
      { label: "TTS Docs", url: "https://docs.x.ai/developers/model-capabilities/audio/text-to-speech" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: true,
      styleConditioning: true,
      languages: ["en", "vi", "zh", "fr", "de", "ja", "ko", "ru", "tr", "it", "id", "hi", "bn"],
    },
    setupSteps: [
      "Generate an xAI API key at console.x.ai → API Keys, paste it below, and click Test & Save — the worker pings GET /v1/tts/voices to confirm.",
      "Create or choose the custom voice in xAI, then copy its Voice ID from the voice card menu.",
      "Create or edit a Voice Profile, paste the xAI Voice ID there, and save. Voice Studio validates it against the configured xAI team.",
      "Select that profile when generating with xAI. The profile is the only source of the Voice ID; recorded samples are ignored for xAI.",
    ],
    helpsWith: [
      "Reusable profile-to-xAI custom voice mappings across every generation flow",
      "Cheapest cloud render lane: ~$4.2/1M chars ≈ $0.13 per 30-minute Vietnamese talk",
      "20-language multilingual narration with speech tag styling",
    ],
    defaultConfig: {
      codec: "mp3",
      sampleRate: 24000,
      bitRate: 128000,
      textNormalization: false,
      maxChunkChars: 5000,
    },
    configFields: [
      {
        key: "codec",
        label: "Codec",
        input: "select",
        description: "Output audio codec.",
        options: [
          { value: "mp3", label: "MP3" },
          { value: "wav", label: "WAV" },
          { value: "pcm", label: "PCM" },
          { value: "mulaw", label: "μ-law" },
          { value: "alaw", label: "A-law" },
        ],
      },
      {
        key: "sampleRate",
        label: "Sample Rate",
        input: "number",
        description: "Output sample rate in Hz (e.g. 24000).",
      },
      {
        key: "bitRate",
        label: "Bit Rate",
        input: "number",
        description: "Output bit rate in bps (e.g. 128000 for MP3).",
      },
      {
        key: "textNormalization",
        label: "Text Normalization",
        input: "boolean",
        description: "Normalise written text to spoken form before synthesis.",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk (xAI hard cap is 15,000).",
      },
    ],
  },
  MINIMAX_TTS: {
    name: "MiniMax Speech",
    shortName: "MiniMax",
    tagline:
      "Pay-as-you-go rapid voice cloning with first-class Vietnamese — clone from a 10 s–5 min reference, then render with Speech 2.6/2.8 HD.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Console", url: "https://platform.minimax.io" },
      { label: "Voice Clone Guide", url: "https://platform.minimax.io/docs/guides/speech-voice-clone" },
      { label: "T2A API", url: "https://platform.minimax.io/docs/api-reference/speech-t2a-http" },
      { label: "Pricing", url: "https://platform.minimax.io/docs/guides/pricing-speech" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: true,
      styleConditioning: false,
      languages: ["vi", "en", "zh", "ja", "ko", "fr", "de", "es", "pt", "ru", "it", "id", "th", "tr", "nl", "pl", "hi", "ar"],
    },
    setupSteps: [
      "Create an account at platform.minimax.io, top up prepaid credit (no subscription needed), and create an API key under Account Management → API Keys.",
      "Paste the key below and use Test & Save — the worker calls POST /v1/get_voice to confirm the key works.",
      "Pick a model: speech-2.8-hd is MiniMax's current HD model and a drop-in replacement for the deprecated speech-2.6-hd (identical parameters); the turbo variants are cheaper for drafts.",
      "Upload a clean 10 s–5 min reference clip to the voice profile. The worker clones it once (voice_id derived from the clip hash) and reuses the clone on later renders.",
      "Billing: ~$1.5 one-time per cloned voice (charged on first use) + T2A characters. MiniMax deletes clones unused for 7 days — the worker re-clones automatically on the next render.",
    ],
    helpsWith: [
      "Vietnamese voice cloning with no subscription — pay only per render",
      "Long-form narration at roughly $2–3 per 30-minute HD generation",
      "Emotion, speed, and pitch controls via provider config",
    ],
    defaultConfig: {
      model: "speech-2.8-hd",
      voice: "Wise_Woman",
      format: "mp3",
      sampleRate: 32000,
      bitRate: 128000,
      noiseReduction: false,
      maxChunkChars: 3000,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "select",
        description: "T2A model used for synthesis. HD favors quality; Turbo favors cost and speed.",
        options: [
          { value: "speech-2.8-hd", label: "Speech 2.8 HD (current)" },
          { value: "speech-2.8-turbo", label: "Speech 2.8 Turbo (current)" },
          { value: "speech-2.6-hd", label: "Speech 2.6 HD (deprecated)" },
          { value: "speech-2.6-turbo", label: "Speech 2.6 Turbo (deprecated)" },
          { value: "speech-02-hd", label: "Speech 02 HD (legacy)" },
          { value: "speech-02-turbo", label: "Speech 02 Turbo (legacy)" },
        ],
      },
      {
        key: "voice",
        label: "Fallback System Voice",
        input: "text",
        description: "MiniMax system voice_id used only when no clone sample is supplied.",
        placeholder: "Wise_Woman",
      },
      {
        key: "format",
        label: "Audio Format",
        input: "select",
        description: "Output codec returned by the API.",
        options: [
          { value: "mp3", label: "MP3" },
          { value: "wav", label: "WAV" },
          { value: "flac", label: "FLAC" },
        ],
      },
      {
        key: "sampleRate",
        label: "Sample Rate",
        input: "number",
        description: "Output sample rate in Hz (8000–44100; 32000 recommended).",
      },
      {
        key: "bitRate",
        label: "Bit Rate",
        input: "number",
        description: "MP3 bit rate in bps (32000–256000).",
      },
      {
        key: "noiseReduction",
        label: "Clone Noise Reduction",
        input: "boolean",
        description: "Ask MiniMax to denoise the reference clip during cloning. Leave off — enrollment already normalizes samples.",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk (MiniMax hard cap is 10,000).",
      },
    ],
  },
  VIBEVOICE: {
    name: "VibeVoice (research lane)",
    shortName: "VibeVoice",
    tagline: "Kept in the matrix for research history, but not a recommended primary provider for this product.",
    needsApiKey: false,
    docsLinks: [
      { label: "Project", url: "https://microsoft.github.io/VibeVoice/" },
      { label: "Repo", url: "https://github.com/microsoft/VibeVoice" },
      { label: "Model", url: "https://huggingface.co/microsoft/VibeVoice-1.5B" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: true,
      languages: ["en", "zh"],
    },
    setupSteps: [
      "Do not enable this provider as a production default. The worker adapter remains a documented stub.",
      "Keep it only for research tracking or future GPU experiments outside the current Mac-first path.",
    ],
    helpsWith: [
      "Research comparison only",
    ],
    defaultConfig: {
      model: "vibevoice-1.5b",
      device: "cuda",
      maxChunkChars: 300,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "Tracked for future experiments only.",
      },
      {
        key: "device",
        label: "Preferred Device",
        input: "select",
        description: "Tracked for future experiments only.",
        options: [
          { value: "cuda", label: "CUDA" },
          { value: "mps", label: "Apple Silicon (experimental)" },
          { value: "cpu", label: "CPU" },
        ],
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Tracked for future experiments only.",
      },
    ],
  },
  KOKORO: {
    name: "Kokoro",
    shortName: "Kokoro",
    tagline: "Tiny (82M) Apache-2.0 TTS that runs many times faster than the cloning engines — the fast preset-voice lane for previews and drafts. Does not clone.",
    needsApiKey: false,
    docsLinks: [
      { label: "GitHub", url: "https://github.com/hexgrad/kokoro" },
      { label: "Model", url: "https://huggingface.co/hexgrad/Kokoro-82M" },
    ],
    supports: {
      tts: true,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["en"],
    },
    setupSteps: [
      "Install in the worker: `cd apps/worker && uv sync --extra kokoro`.",
      "Kokoro does not clone voices — it ships fixed preset voices (e.g. `af_heart`). Pick one in the config form below.",
      "Use it for the 15-second preview path and quick pacing checks where exact voice identity does not matter; switch to a cloning provider for the final render.",
      "Save config, Test, then enable. There is no API key.",
    ],
    helpsWith: [
      "Fast, low-cost previews and script-pacing checks",
      "Offline English narration when cloning is not required",
    ],
    defaultConfig: {
      voice: "af_heart",
      maxChunkChars: 400,
    },
    configFields: [
      {
        key: "voice",
        label: "Preset Voice",
        input: "text",
        description: "Kokoro voice pack name, e.g. `af_heart`, `af_bella`, `am_michael`.",
        placeholder: "af_heart",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk for the app chunker.",
      },
    ],
  },
  INDEXTTS2: {
    name: "IndexTTS-2",
    shortName: "IndexTTS2",
    tagline: "SOTA zero-shot cloning (top WER + speaker similarity) with disentangled emotion control. English/Chinese-centric advanced-quality lane.",
    needsApiKey: false,
    docsLinks: [
      { label: "GitHub", url: "https://github.com/index-tts/index-tts" },
      { label: "Model", url: "https://huggingface.co/IndexTeam/IndexTTS-2" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: true,
      languages: ["en", "zh"],
    },
    setupSteps: [
      "IndexTTS-2 is not on PyPI. Install from source in the worker env: `uv pip install \"git+https://github.com/index-tts/index-tts.git\"`.",
      "Download the checkpoints (model + config.yaml) and set `modelDir` / `cfgPath` below to their location on the worker host.",
      "Best on a CUDA GPU; Apple Silicon is best-effort. Set `useFp16` only with enough memory headroom.",
      "For emotion control, set `emoText` (a description like 'calm, warm') and `emoAlpha`, or point `emoAudio` at a separate emotion reference clip.",
      "Save config, Test, then enable. Use this as the high-fidelity lane for English/Chinese leadership voices.",
    ],
    helpsWith: [
      "Highest-fidelity English/Chinese voice cloning",
      "Emotion-controlled narration (borrow timbre from one ref, emotion from another)",
      "A/B quality comparison against VoxCPM2 / ElevenLabs",
    ],
    defaultConfig: {
      modelDir: "checkpoints",
      cfgPath: "checkpoints/config.yaml",
      useFp16: false,
      emoText: "",
      emoAlpha: 1.0,
      emoAudio: "",
      maxChunkChars: 300,
    },
    configFields: [
      {
        key: "modelDir",
        label: "Model Directory",
        input: "text",
        description: "Path to the downloaded IndexTTS-2 checkpoints on the worker host.",
        placeholder: "checkpoints",
      },
      {
        key: "cfgPath",
        label: "Config Path",
        input: "text",
        description: "Path to the model `config.yaml`.",
        placeholder: "checkpoints/config.yaml",
      },
      {
        key: "useFp16",
        label: "Use FP16",
        input: "boolean",
        description: "Half-precision inference. Faster on capable GPUs; leave off on CPU/MPS.",
      },
      {
        key: "emoText",
        label: "Emotion Text",
        input: "textarea",
        description: "Optional natural-language emotion guidance (e.g. 'calm, warm, confident'). Overridden by a generation's style prompt when present.",
      },
      {
        key: "emoAlpha",
        label: "Emotion Strength",
        input: "number",
        description: "0–1 blend of the emotion onto the speaker. 1.0 = full emotion.",
      },
      {
        key: "emoAudio",
        label: "Emotion Reference Clip",
        input: "text",
        description: "Optional path to a separate clip whose emotion is transferred (timbre still comes from the profile).",
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk for the app chunker.",
      },
    ],
  },
  // ── LLM providers (script drafting) ────────────────────────────────────────
  // These generate presentation/podcast scripts, not audio. supports.tts=false;
  // the useful capability lives in tagline / helpsWith.
  GEMINI_LLM: {
    name: "Gemini (Google, LLM)",
    shortName: "Gemini LLM",
    tagline: "Google Gemini free-tier text model for drafting presentation and podcast scripts. Generous free quota via AI Studio.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Keys", url: "https://aistudio.google.com/apikey" },
      { label: "Text Docs", url: "https://ai.google.dev/gemini-api/docs/text-generation" },
      { label: "Pricing", url: "https://ai.google.dev/pricing" },
    ],
    supports: {
      tts: false,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["vi", "en", "es", "fr", "de", "it", "pt", "ja", "ko", "zh"],
    },
    setupSteps: [
      "Generate a Google AI Studio API key (free) and paste it below.",
      "Use Test & Save to verify the key and that the Gemini model list is reachable from this host.",
      "Pick the text model in the config form — `gemini-2.5-flash` is a strong free default for Vietnamese long-form drafting.",
      "Enable the provider and (optionally) mark it default so the draft-script feature routes to it instead of paying providers.",
    ],
    helpsWith: [
      "Free script drafting for presentations and podcasts",
      "Vietnamese and English long-form generation",
      "Zero-cost alternative to paid drafting APIs",
    ],
    defaultConfig: {
      model: "gemini-2.5-flash",
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "Gemini text-generation model ID used for drafting.",
        placeholder: "gemini-2.5-flash",
      },
    ],
  },
  GROQ: {
    name: "Groq",
    shortName: "Groq",
    tagline: "Ultra-fast OpenAI-compatible inference with a free tier. Runs open models (Llama, etc.) at very low latency for script drafting.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Keys", url: "https://console.groq.com/keys" },
      { label: "Docs", url: "https://console.groq.com/docs" },
      { label: "Models", url: "https://console.groq.com/docs/models" },
    ],
    supports: {
      tts: false,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["en", "vi", "es", "fr", "de", "pt", "zh"],
    },
    setupSteps: [
      "Create a free Groq account at console.groq.com and generate an API key.",
      "Paste the key below and use Test & Save — the app pings GET /openai/v1/models to confirm.",
      "Pick a model in the config form. `llama-3.3-70b-versatile` is a solid free default.",
      "Enable the provider and optionally mark it default for the draft-script feature.",
    ],
    helpsWith: [
      "Free, low-latency script drafting",
      "Open-model (Llama) generation",
      "Cheap alternative to paid drafting APIs",
    ],
    defaultConfig: {
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
    },
    configFields: [
      {
        key: "baseUrl",
        label: "Base URL",
        input: "url",
        description: "OpenAI-compatible base URL. Leave as default unless proxying.",
        placeholder: "https://api.groq.com/openai/v1",
      },
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "Groq model ID used for drafting.",
        placeholder: "llama-3.3-70b-versatile",
      },
    ],
  },
  XAI_LLM: {
    name: "xAI Grok (LLM, API key)",
    shortName: "Grok LLM",
    tagline: "xAI Grok text models via API key (OpenAI-compatible). Pay-as-you-go drafting with the latest Grok models.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Console", url: "https://console.x.ai" },
      { label: "Models", url: "https://docs.x.ai/docs/models" },
      { label: "Chat Docs", url: "https://docs.x.ai/docs/guides/chat" },
    ],
    supports: {
      tts: false,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["en", "vi", "zh", "fr", "de", "ja", "ko"],
    },
    setupSteps: [
      "Generate an xAI API key from console.x.ai.",
      "Paste the key below and use Test & Save — the app pings GET /v1/models to confirm.",
      "Pick a model in the config form (e.g. `grok-4.3`).",
      "Enable the provider and optionally mark it default for the draft-script feature.",
    ],
    helpsWith: [
      "High-quality Grok script drafting via API key",
      "Latest Grok models for long-form generation",
      "Alternative to the SuperGrok OAuth lane when you have API credits",
    ],
    defaultConfig: {
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4.3",
    },
    configFields: [
      {
        key: "baseUrl",
        label: "Base URL",
        input: "url",
        description: "OpenAI-compatible base URL. Bearer tokens are only ever sent to api.x.ai.",
        placeholder: "https://api.x.ai/v1",
      },
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "xAI Grok model ID used for drafting.",
        placeholder: "grok-4.3",
      },
    ],
  },
  GROK_OAUTH: {
    name: "SuperGrok / X Premium+ (OAuth)",
    shortName: "SuperGrok",
    tagline: "Use your SuperGrok or X Premium+ subscription for script drafting via OAuth device-code login — no API key or per-token billing.",
    needsApiKey: false,
    docsLinks: [
      { label: "Device Login", url: "https://x.ai/device" },
      { label: "Models", url: "https://docs.x.ai/docs/models" },
    ],
    supports: {
      tts: false,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["en", "vi", "zh", "fr", "de", "ja", "ko"],
    },
    setupSteps: [
      "Open Setup & config below and click 'Connect SuperGrok'.",
      "Open the shown verification link, enter the user code, and approve access with your SuperGrok / X Premium+ account.",
      "The app stores the OAuth tokens (encrypted) and refreshes them automatically — no API key needed.",
      "Pick a model in the config form (e.g. `grok-4.3`), then enable the provider for the draft-script feature.",
    ],
    helpsWith: [
      "Script drafting billed to your Grok subscription instead of API credits",
      "No API key management",
      "Latest Grok models via your existing plan",
    ],
    defaultConfig: {
      model: "grok-4.3",
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "xAI Grok model ID used for drafting.",
        placeholder: "grok-4.3",
      },
    ],
  },
  OLLAMA: {
    name: "Ollama (local)",
    shortName: "Ollama",
    tagline: "Run open LLMs locally with Ollama — fully offline, zero cost. OpenAI-compatible endpoint for script drafting.",
    needsApiKey: false,
    docsLinks: [
      { label: "Website", url: "https://ollama.com" },
      { label: "Models", url: "https://ollama.com/library" },
      { label: "OpenAI Compatibility", url: "https://github.com/ollama/ollama/blob/main/docs/openai.md" },
    ],
    supports: {
      tts: false,
      voiceCloning: false,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["en", "vi", "zh"],
    },
    setupSteps: [
      "Install Ollama (ollama.com) and pull a model, e.g. `ollama pull qwen2.5:7b` (or use a cloud tag like `kimi-k2.6:cloud`).",
      "Set the Base URL below. Either `http://localhost:11434` or `http://localhost:11434/v1` works — the app normalizes to the OpenAI-compatible `/v1` path.",
      "Use Test — the app pings the local tags endpoint to confirm the server is up.",
      "Enable the provider and optionally mark it default for drafting. Models appear in Generate → Draft with AI.",
    ],
    helpsWith: [
      "Fully offline, zero-cost script drafting",
      "Local open-model generation (Qwen, Llama, etc.)",
      "No cloud dependency or API key",
    ],
    defaultConfig: {
      baseUrl: "http://localhost:11434/v1",
      model: "qwen2.5:7b",
    },
    configFields: [
      {
        key: "baseUrl",
        label: "Base URL",
        input: "url",
        description:
          "Ollama host as seen from the Next.js app. `http://localhost:11434` or `…/v1` both work; requests go to `/v1/chat/completions`.",
        placeholder: "http://localhost:11434",
      },
      {
        key: "model",
        label: "Default model",
        input: "text",
        description:
          "Fallback Ollama model tag when the draft form does not pick one (e.g. `qwen2.5:7b` or `kimi-k2.6:cloud`).",
        placeholder: "qwen2.5:7b",
      },
    ],
  },
}

type DeepPartial<T> = {
  [P in keyof T]?: NonNullable<T[P]> extends (infer U)[]
    ? DeepPartial<U>[]
    : NonNullable<T[P]> extends object
      ? DeepPartial<NonNullable<T[P]>>
      : T[P]
}

/**
 * Vietnamese overrides for the human-readable prose in PROVIDER_META.
 * Only translated fields appear here; the English PROVIDER_META remains the
 * source of truth for structure, keys, option values, languages, and defaults.
 * Shell commands, file paths, URLs, and code identifiers are kept in English.
 */
const PROVIDER_META_VI_OVERRIDES: Record<string, DeepPartial<ProviderMeta>> = {
  VIENEU_TTS: {
    tagline:
      "Lane clone tiếng Việt MIỄN PHÍ không giới hạn — chạy trên CPU của chính server này (không tốn phí API, không phí theo giọng). Chất lượng clone gần đúng: hợp nhất để sàng lọc nhiều giọng trước khi gắn giọng cloud.",
    setupSteps: [
      "Không cần key — SDK đã có sẵn trong image worker production (build với `--extra vieneu`). Bấm Test: xanh nghĩa là runtime đã load.",
      "Bật provider. Voice profile tự động clone từ mẫu đã tải lên ở mỗi lần render — không cần cấu hình gì thêm.",
      "Dùng lane này để sàng lọc giọng của nhiều người với chi phí $0: enroll profile, render một kịch bản ngắn, nghe thử. Tốc độ khoảng 5–15 giây mỗi câu trên CPU, nên giữ kịch bản sàng lọc ngắn.",
      "Chất lượng clone là gần đúng (chất giọng/vùng miền có thể lệch). Khi một giọng đã qua vòng sàng lọc, gắn voice_id từ xAI Console vào profile để render chất lượng production.",
      "Tùy chọn: nếu muốn host riêng nhanh hơn, chạy một VieNeu server nơi khác rồi đặt `mode=remote` cùng `apiBase` trong form cấu hình bên dưới.",
    ],
    helpsWith: [
      "Sàng lọc MIỄN PHÍ không giới hạn các giọng ứng viên — không phí theo giọng hay theo ký tự",
      "Clone tiếng Việt cục bộ trực tiếp từ mẫu đã enroll của profile",
      "Render bài nói 20–60 phút chi phí thấp với tổng hợp theo đoạn (chậm nhưng miễn phí trên CPU)",
    ],
    configFields: [
      {
        label: "Model",
        description: "Model ID trên Hugging Face hoặc tên model cục bộ dùng bởi VieNeu SDK.",
      },
      {
        label: "Chế độ Runtime",
        description:
          "Dùng `local` khi worker chạy VieNeu trực tiếp. Dùng `remote` khi bạn đã chạy sẵn một VieNeu API server riêng.",
        options: [
          { label: "Local SDK" },
          { label: "Remote API" },
        ],
      },
      {
        label: "Remote API Base",
        description: "Chỉ bắt buộc cho chế độ remote. Ví dụ: `http://127.0.0.1:23333/v1`.",
      },
      {
        label: "Thiết bị ưu tiên",
        description: "Lưu để người vận hành nắm rõ. Cài VieNeu cục bộ trên Mac nên ưu tiên `mps`.",
        options: [
          { label: "Apple Silicon (mps)" },
          { label: "CPU" },
          { label: "CUDA" },
        ],
      },
      {
        label: "Transcript tham chiếu",
        description:
          "Transcript tùy chọn cho clip tham chiếu. Để trống cho luồng zero-shot mặc định.",
      },
      {
        label: "Kích thước đoạn",
        description:
          "Giới hạn trên cho tổng hợp theo đoạn trong app này. Giữ ở mức vừa phải để ổn định với nội dung dài.",
      },
    ],
  },
  VOXCPM2: {
    tagline:
      "TTS đa ngôn ngữ 48kHz của OpenBMB với nhân bản có kiểm soát, hỗ trợ style prompt, và lộ trình GPU mạnh trong tương lai.",
    setupSteps: [
      "Cài gói Python chính thức vào worker: `cd apps/worker && uv sync --extra voxcpm`.",
      "Bắt đầu với model mặc định `openbmb/VoxCPM2`. Tài liệu chính thức benchmark CUDA trước; MPS trên Mac chỉ ở mức nỗ lực tốt nhất và nên được test trước khi đưa lên làm mặc định production.",
      "Nếu muốn 'ultimate cloning' đầy đủ, hãy điền `Prompt Transcript` bằng transcript chính xác của clip tham chiếu và bật `Use Prompt Clone`.",
      "Để đạt throughput production trên Linux GPU, OpenBMB khuyến nghị Nano-vLLM hoặc vLLM-Omni. Adapter tích hợp sẵn của app này hiện nhắm tới đường API Python chính thức.",
      "Save config, nhấn Test, và chỉ sau đó mới bật provider cho người dùng.",
      "Dùng provider này khi bạn cần kiểm soát style mạnh hơn hoặc muốn lộ trình chuyển đổi rõ ràng sang worker Linux+GPU trong tương lai.",
    ],
    helpsWith: [
      "Nhân bản giọng đa ngôn ngữ độ trung thực cao hơn",
      "Bài thuyết trình và podcast dẫn dắt theo style",
      "Phục vụ production Linux+GPU trong tương lai",
      "Đầu ra 48kHz cho các hồ sơ giọng cao cấp",
    ],
    configFields: [
      {
        label: "Model",
        description: "Model ID trên Hugging Face hoặc thư mục checkpoint cục bộ cho VoxCPM2.",
      },
      {
        label: "Thiết bị ưu tiên",
        description:
          "Đường nhanh chính thức là CUDA. `mps` được hỗ trợ ở đây như một đường nỗ lực tốt nhất do người vận hành cấu hình.",
        options: [
          { label: "CUDA" },
          { label: "Apple Silicon (mps)" },
          { label: "CPU" },
        ],
      },
      {
        label: "Giá trị CFG",
        description:
          "Giá trị classifier-free guidance dùng khi tạo. Mặc định `2.0` khớp với các ví dụ chính thức.",
      },
      {
        label: "Số bước suy luận",
        description: "Số bước diffusion. Cao hơn cải thiện chất lượng nhưng tốn thêm độ trễ.",
      },
      {
        label: "Nạp Denoiser",
        description: "Chỉ bật nếu bạn muốn giai đoạn denoiser và có đủ dư địa bộ nhớ.",
      },
      {
        label: "Dùng Prompt Clone",
        description:
          "Khi bật, app dùng lại clip tham chiếu vừa làm `reference_wav_path` vừa làm `prompt_wav_path`.",
      },
      {
        label: "Prompt Transcript",
        description:
          "Transcript chính xác của clip tham chiếu cho 'ultimate cloning'. Để trống cho nhân bản có kiểm soát tiêu chuẩn.",
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn trong pipeline render của app này.",
      },
    ],
  },
  XTTS_V2: {
    tagline:
      "Phương án dự phòng cục bộ đa ngôn ngữ đã được kiểm chứng. Giữ lại để tương thích, không còn là khuyến nghị ưu tiên cho Mac.",
    setupSteps: [
      "XTTS chạy cục bộ bên trong worker; không cần API key.",
      "Image worker đã bao gồm sẵn `TTS`. Trọng số model được tải xuống từ Hugging Face khi dùng lần đầu.",
      "Dùng `device=mps` trên Apple Silicon hoặc `device=cuda` trên host Linux GPU.",
      "Save config, Test, rồi bật. Giữ làm provider cục bộ dự phòng nếu VieNeu hoặc VoxCPM2 không khả dụng trên host.",
    ],
    helpsWith: [
      "TTS cục bộ dự phòng khi các provider mới hơn không khả dụng",
      "Tương thích với các test fixture hiện có",
      "Tổng hợp đa ngôn ngữ tổng quát",
    ],
    configFields: [
      {
        label: "Model",
        description: "Đường dẫn model XTTS hoặc tên trong registry.",
      },
      {
        label: "Thiết bị ưu tiên",
        description:
          "Worker vẫn kiểm tra thiết bị của host; dùng mục này để ghi đè mặc định.",
        options: [
          { label: "Apple Silicon (mps)" },
          { label: "CPU" },
          { label: "CUDA" },
        ],
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn cho bộ chia đoạn của app.",
      },
    ],
  },
  F5_TTS: {
    tagline:
      "Phương án dự phòng cục bộ hiện có cho tổng hợp thiên tiếng Việt, giữ làm lựa chọn thứ cấp bên cạnh VieNeu-TTS.",
    setupSteps: [
      "F5-TTS chạy bên trong worker; không cần API key.",
      "Giữ provider này tắt trừ khi host worker đã cài và test runtime F5.",
      "Dùng làm provider cục bộ dự phòng, không phải khuyến nghị chính cho Mac khi VieNeu-TTS đã được hỗ trợ.",
    ],
    helpsWith: [
      "Thử nghiệm TTS cục bộ tiếng Việt cũ",
      "Benchmark provider dự phòng",
    ],
    configFields: [
      {
        label: "Model",
        description: "Tên model F5 truyền vào bộ nạp cục bộ.",
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn cho việc chia đoạn ở mức app.",
      },
    ],
  },
  ELEVENLABS: {
    tagline: "Phương án dự phòng cloud thương mại với nhân bản giọng tức thì và vận hành ổn định, dễ dự đoán.",
    setupSteps: [
      "Tạo tài khoản ElevenLabs và tạo một API key.",
      "Dán key bên dưới, rồi dùng Test & Save để app xác minh tài khoản trước khi lưu secret.",
      "Tinh chỉnh model và thiết lập giọng trong form cấu hình nếu bạn cần một hồ sơ dự phòng cloud khác với model đa ngôn ngữ mặc định.",
      "Chỉ bật provider nếu bạn muốn dung lượng dự phòng trả phí.",
    ],
    helpsWith: [
      "Dự phòng trả phí khi các provider cục bộ quá chậm hoặc không khả dụng",
      "Nhân bản giọng thương mại độ trung thực cao nhất cho hồ sơ lãnh đạo",
      "Tổng hợp streaming cho nội dung dài",
    ],
    configFields: [
      {
        label: "Model",
        description: "Model ID của ElevenLabs dùng cho các yêu cầu text-to-speech.",
      },
      {
        label: "Độ ổn định",
        description: "Giá trị độ ổn định của giọng, từ 0 đến 1.",
      },
      {
        label: "Similarity Boost",
        description: "Similarity boost từ 0 đến 1.",
      },
      {
        label: "Style",
        description: "Mức phóng đại style từ 0 đến 1.",
      },
      {
        label: "Dùng Speaker Boost",
        description: "Bật speaker boost của ElevenLabs.",
      },
      {
        label: "Kích thước đoạn",
        description: "Kích thước đoạn tối đa cho kịch bản dài.",
      },
    ],
  },
  GEMINI_TTS: {
    tagline:
      "TTS đa ngôn ngữ giọng dựng sẵn giá rẻ, đồng thời chính API key này cũng phục vụ các trợ thủ soạn thảo và căn nhịp.",
    setupSteps: [
      "Tạo một API key Google AI Studio và dán vào bên dưới.",
      "Dùng Test & Save để xác minh key và rằng danh sách model có thể truy cập từ host này.",
      "Chọn model TTS và giọng dựng sẵn trong form cấu hình nếu bạn không muốn dùng mặc định.",
      "Lưu ý: Gemini TTS không nhân bản giọng người dùng trong app này. Nó ở đây như một phương án dự phòng giọng dựng sẵn chi phí thấp và cho các tính năng soạn thảo.",
    ],
    helpsWith: [
      "Tạo giọng dựng sẵn chi phí thấp",
      "Soạn thảo kịch bản, khóa nhịp, và chuyển đổi transcript",
      "Dự phòng cloud khi không cần nhân bản",
    ],
    configFields: [
      {
        label: "Model",
        description: "Model ID sinh giọng nói của Gemini.",
      },
      {
        label: "Giọng dựng sẵn",
        description: "Tên giọng dựng sẵn của Google, ví dụ `Aoede`.",
      },
      {
        label: "Kích thước đoạn",
        description: "Kích thước đoạn tối đa cho tổng hợp nội dung dài.",
      },
    ],
  },
  XIAOMI_TTS: {
    tagline:
      "Dòng MiMo-V2.5-TTS với giọng dựng sẵn, thiết kế giọng, và nhân bản giọng từ mẫu audio. Miễn phí trong thời gian giới hạn.",
    setupSteps: [
      "Đăng nhập platform.xiaomimimo.com bằng tài khoản Xiaomi và tạo một API key trong Console.",
      "Key trả theo dùng (sk-…) dùng https://api.xiaomimimo.com/v1; key Token Plan (tp-…) dùng https://token-plan-sgp.xiaomimimo.com/v1. Worker tự định tuyến theo tiền tố, hoặc ghi đè qua trường Base URL.",
      "Dán key bên dưới, rồi dùng Test & Save để worker xác minh trước khi lưu.",
      "Chọn một giọng dựng sẵn (Chloe, Mia, Milo, Dean, 冰糖, 茉莉, 苏打, 白桦) — dùng khi không cung cấp mẫu nhân bản.",
      "Bật provider khi test thành công. Với giọng nhân bản, worker gửi lại clip tham chiếu ở mỗi yêu cầu.",
    ],
    helpsWith: [
      "Nhân bản giọng song ngữ Trung / Anh / Việt từ một clip tham chiếu ngắn",
      "Thuyết minh có kiểm soát style qua prompt đạo diễn bằng ngôn ngữ tự nhiên",
      "Dự phòng cloud giá rẻ (miễn phí trong beta) cho chế độ podcast và thuyết trình",
    ],
    configFields: [
      {
        label: "Base URL",
        description:
          "Để trống để tự định tuyến theo tiền tố key. Trả theo dùng: https://api.xiaomimimo.com/v1. Token Plan: https://token-plan-sgp.xiaomimimo.com/v1.",
      },
      {
        label: "Model dựng sẵn",
        description: "Model dùng khi tổng hợp với giọng dựng sẵn (không có mẫu tham chiếu).",
      },
      {
        label: "Model nhân bản",
        description: "Model dùng khi có mẫu audio tham chiếu để nhân bản.",
      },
      {
        label: "Giọng dựng sẵn",
        description: "Giọng mặc định cho tổng hợp dựng sẵn. Bỏ qua khi nhân bản.",
        options: [
          { label: "MiMo Default" },
          { label: "Chloe (English Female)" },
          { label: "Mia (English Female)" },
          { label: "Milo (English Male)" },
          { label: "Dean (English Male)" },
          { label: "冰糖 (Chinese Female)" },
          { label: "茉莉 (Chinese Female)" },
          { label: "苏打 (Chinese Male)" },
          { label: "白桦 (Chinese Male)" },
        ],
      },
      {
        label: "Định dạng audio",
        description: "Codec đầu ra mà API trả về.",
        options: [
          { label: "WAV" },
          { label: "MP3" },
          { label: "PCM16" },
        ],
      },
      {
        label: "Style prompt mặc định",
        description:
          "Chỉ dẫn style bằng ngôn ngữ tự nhiên tùy chọn, được thêm vào đầu mỗi yêu cầu tổng hợp.",
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn cho kịch bản dài.",
      },
    ],
  },
  XAI_TTS: {
    tagline:
      "Lane render xAI chi phí thấp. Đặt Voice ID mặc định ở đây, rồi override theo từng speaker trên form tạo khi cần.",
    setupSteps: [
      "Tạo xAI API key tại console.x.ai → API Keys, dán vào bên dưới rồi bấm Test & Save — worker gọi GET /v1/tts/voices để xác nhận.",
      "Tạo hoặc chọn giọng trong xAI, rồi copy Voice ID.",
      "Dán Voice ID mặc định vào cấu hình provider bên dưới. Giọng này được dùng khi form tạo để trống xAI Voice ID.",
      "Khi chọn xAI để tạo audio, mỗi speaker có thể override default bằng xAI Voice ID riêng. Mẫu ghi âm trong profile bị bỏ qua với xAI.",
    ],
    helpsWith: [
      "Giọng xAI mặc định kèm override theo từng speaker lúc tạo",
      "Lane render cloud rẻ nhất: ~$4.2/1M ký tự ≈ $0.13 cho bài nói tiếng Việt 30 phút",
      "Thuyết minh đa ngôn ngữ 20 thứ tiếng với tạo style bằng speech tag",
    ],
    configFields: [
      {
        label: "xAI Voice ID mặc định",
        description: "Voice ID fallback khi form tạo để trống xAI Voice ID theo speaker.",
      },
      {
        label: "Codec",
        description: "Codec audio đầu ra.",
        options: [
          { label: "MP3" },
          { label: "WAV" },
          { label: "PCM" },
          { label: "μ-law" },
          { label: "A-law" },
        ],
      },
      {
        label: "Sample Rate",
        description: "Sample rate đầu ra tính bằng Hz (ví dụ 24000).",
      },
      {
        label: "Bit Rate",
        description: "Bit rate đầu ra tính bằng bps (ví dụ 128000 cho MP3).",
      },
      {
        label: "Chuẩn hóa văn bản",
        description: "Chuẩn hóa văn bản viết thành dạng nói trước khi tổng hợp.",
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn (giới hạn cứng của xAI là 15.000).",
      },
    ],
  },
  MINIMAX_TTS: {
    tagline:
      "Nhân bản giọng nhanh, trả tiền theo lượt dùng, hỗ trợ tiếng Việt hạng nhất — clone từ clip tham chiếu 10 giây–5 phút, rồi render với Speech 2.6/2.8 HD.",
    setupSteps: [
      "Tạo tài khoản tại platform.minimax.io, nạp credit trả trước (không cần subscription), rồi tạo API key trong Account Management → API Keys.",
      "Dán key bên dưới và dùng Test & Save — worker gọi POST /v1/get_voice để xác nhận key hoạt động.",
      "Chọn model: speech-2.8-hd là model HD hiện hành của MiniMax, thay thế trực tiếp cho speech-2.6-hd đã bị deprecated (tham số giống hệt); bản turbo rẻ hơn cho bản nháp.",
      "Tải clip tham chiếu sạch 10 giây–5 phút vào voice profile. Worker clone một lần (voice_id sinh từ hash của clip) và tái sử dụng clone ở các lần render sau.",
      "Chi phí: ~$1.5 một lần cho mỗi giọng clone (tính khi dùng lần đầu) + ký tự T2A. MiniMax xóa clone không dùng trong 7 ngày — worker tự clone lại ở lần render kế tiếp.",
    ],
    helpsWith: [
      "Nhân bản giọng tiếng Việt không cần subscription — chỉ trả tiền theo lần render",
      "Thuyết minh dài khoảng $2–3 cho mỗi bản HD 30 phút",
      "Điều khiển cảm xúc, tốc độ và cao độ qua config provider",
    ],
    configFields: [
      {
        label: "Model",
        description: "Model T2A dùng để tổng hợp. HD ưu tiên chất lượng; Turbo ưu tiên chi phí và tốc độ.",
        options: [
          { label: "Speech 2.6 HD (đã kiểm chứng tiếng Việt)" },
          { label: "Speech 2.6 Turbo" },
          { label: "Speech 2.8 HD (mới nhất)" },
          { label: "Speech 2.8 Turbo" },
          { label: "Speech 02 HD (cũ)" },
          { label: "Speech 02 Turbo (cũ)" },
        ],
      },
      {
        label: "Giọng hệ thống dự phòng",
        description: "voice_id giọng hệ thống MiniMax, chỉ dùng khi không có mẫu nhân bản.",
      },
      {
        label: "Định dạng audio",
        description: "Codec đầu ra mà API trả về.",
        options: [
          { label: "MP3" },
          { label: "WAV" },
          { label: "FLAC" },
        ],
      },
      {
        label: "Sample Rate",
        description: "Sample rate đầu ra tính bằng Hz (8000–44100; khuyến nghị 32000).",
      },
      {
        label: "Bit Rate",
        description: "Bit rate MP3 tính bằng bps (32000–256000).",
      },
      {
        label: "Khử nhiễu khi clone",
        description: "Yêu cầu MiniMax khử nhiễu clip tham chiếu khi nhân bản. Nên tắt — bước enrollment đã chuẩn hóa mẫu.",
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn (giới hạn cứng của MiniMax là 10.000).",
      },
    ],
  },
  VIBEVOICE: {
    tagline:
      "Giữ trong bảng để lưu lịch sử nghiên cứu, nhưng không phải provider chính được khuyến nghị cho sản phẩm này.",
    setupSteps: [
      "Không bật provider này làm mặc định production. Adapter worker vẫn là một stub được ghi chú.",
      "Chỉ giữ để theo dõi nghiên cứu hoặc thử nghiệm GPU tương lai ngoài đường ưu tiên Mac hiện tại.",
    ],
    helpsWith: [
      "Chỉ để so sánh nghiên cứu",
    ],
    configFields: [
      {
        label: "Model",
        description: "Chỉ theo dõi cho thử nghiệm tương lai.",
      },
      {
        label: "Thiết bị ưu tiên",
        description: "Chỉ theo dõi cho thử nghiệm tương lai.",
        options: [
          { label: "CUDA" },
          { label: "Apple Silicon (experimental)" },
          { label: "CPU" },
        ],
      },
      {
        label: "Kích thước đoạn",
        description: "Chỉ theo dõi cho thử nghiệm tương lai.",
      },
    ],
  },
  KOKORO: {
    tagline:
      "TTS Apache-2.0 nhỏ gọn (82M) chạy nhanh gấp nhiều lần các engine nhân bản — đường giọng dựng sẵn tốc độ cao cho bản xem trước và bản nháp. Không nhân bản.",
    setupSteps: [
      "Cài vào worker: `cd apps/worker && uv sync --extra kokoro`.",
      "Kokoro không nhân bản giọng — nó đi kèm các giọng dựng sẵn cố định (ví dụ `af_heart`). Chọn một giọng trong form cấu hình bên dưới.",
      "Dùng cho đường xem trước 15 giây và kiểm tra nhịp nhanh khi danh tính giọng chính xác không quan trọng; chuyển sang provider nhân bản cho bản render cuối.",
      "Save config, Test, rồi bật. Không có API key.",
    ],
    helpsWith: [
      "Bản xem trước nhanh, chi phí thấp và kiểm tra nhịp kịch bản",
      "Thuyết minh tiếng Anh ngoại tuyến khi không cần nhân bản",
    ],
    configFields: [
      {
        label: "Giọng dựng sẵn",
        description: "Tên gói giọng Kokoro, ví dụ `af_heart`, `af_bella`, `am_michael`.",
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn cho bộ chia đoạn của app.",
      },
    ],
  },
  INDEXTTS2: {
    tagline:
      "Nhân bản zero-shot SOTA (WER và độ tương đồng giọng nói dẫn đầu) với kiểm soát cảm xúc tách biệt. Đường chất lượng cao thiên tiếng Anh/tiếng Trung.",
    setupSteps: [
      "IndexTTS-2 không có trên PyPI. Cài từ nguồn trong môi trường worker: `uv pip install \"git+https://github.com/index-tts/index-tts.git\"`.",
      "Tải các checkpoint (model + config.yaml) và đặt `modelDir` / `cfgPath` bên dưới trỏ tới vị trí của chúng trên host worker.",
      "Tốt nhất trên GPU CUDA; Apple Silicon chỉ ở mức nỗ lực tốt nhất. Chỉ đặt `useFp16` khi có đủ dư địa bộ nhớ.",
      "Để kiểm soát cảm xúc, đặt `emoText` (một mô tả như 'calm, warm') và `emoAlpha`, hoặc trỏ `emoAudio` tới một clip tham chiếu cảm xúc riêng.",
      "Save config, Test, rồi bật. Dùng đây làm đường độ trung thực cao cho giọng lãnh đạo tiếng Anh/tiếng Trung.",
    ],
    helpsWith: [
      "Nhân bản giọng tiếng Anh/tiếng Trung độ trung thực cao nhất",
      "Thuyết minh có kiểm soát cảm xúc (mượn âm sắc từ một clip tham chiếu, cảm xúc từ clip khác)",
      "So sánh chất lượng A/B với VoxCPM2 / ElevenLabs",
    ],
    configFields: [
      {
        label: "Thư mục Model",
        description: "Đường dẫn tới các checkpoint IndexTTS-2 đã tải trên host worker.",
      },
      {
        label: "Đường dẫn Config",
        description: "Đường dẫn tới `config.yaml` của model.",
      },
      {
        label: "Dùng FP16",
        description: "Suy luận nửa độ chính xác. Nhanh hơn trên GPU đủ mạnh; tắt trên CPU/MPS.",
      },
      {
        label: "Văn bản cảm xúc",
        description:
          "Chỉ dẫn cảm xúc bằng ngôn ngữ tự nhiên tùy chọn (ví dụ 'calm, warm, confident'). Bị ghi đè bởi style prompt của lần tạo khi có.",
      },
      {
        label: "Cường độ cảm xúc",
        description: "Mức pha 0–1 của cảm xúc lên giọng người nói. 1.0 = cảm xúc đầy đủ.",
      },
      {
        label: "Clip tham chiếu cảm xúc",
        description:
          "Đường dẫn tùy chọn tới một clip riêng để chuyển cảm xúc (âm sắc vẫn lấy từ hồ sơ).",
      },
      {
        label: "Kích thước đoạn",
        description: "Số ký tự tối đa mỗi đoạn cho bộ chia đoạn của app.",
      },
    ],
  },
  GEMINI_LLM: {
    tagline:
      "Model văn bản Gemini gói miễn phí của Google để soạn kịch bản thuyết trình và podcast. Hạn mức miễn phí hào phóng qua AI Studio.",
    setupSteps: [
      "Tạo một API key Google AI Studio (miễn phí) và dán vào bên dưới.",
      "Dùng Test & Save để xác minh key và rằng danh sách model Gemini có thể truy cập từ host này.",
      "Chọn model văn bản trong form cấu hình — `gemini-2.5-flash` là mặc định miễn phí mạnh cho soạn thảo tiếng Việt dài.",
      "Bật provider và (tùy chọn) đặt làm mặc định để tính năng soạn kịch bản dùng nó thay cho các provider trả phí.",
    ],
    helpsWith: [
      "Soạn kịch bản miễn phí cho thuyết trình và podcast",
      "Tạo nội dung dài tiếng Việt và tiếng Anh",
      "Giải pháp không tốn phí thay cho các API soạn thảo trả phí",
    ],
    configFields: [
      {
        label: "Model",
        description: "Model ID sinh văn bản của Gemini dùng để soạn thảo.",
      },
    ],
  },
  GROQ: {
    tagline:
      "Suy luận tương thích OpenAI cực nhanh với gói miễn phí. Chạy các model mở (Llama, v.v.) với độ trễ rất thấp để soạn kịch bản.",
    setupSteps: [
      "Tạo tài khoản Groq miễn phí tại console.groq.com và tạo một API key.",
      "Dán key bên dưới và dùng Test & Save — app gọi GET /openai/v1/models để xác nhận.",
      "Chọn model trong form cấu hình. `llama-3.3-70b-versatile` là mặc định miễn phí tốt.",
      "Bật provider và tùy chọn đặt làm mặc định cho tính năng soạn kịch bản.",
    ],
    helpsWith: [
      "Soạn kịch bản miễn phí, độ trễ thấp",
      "Tạo nội dung bằng model mở (Llama)",
      "Giải pháp rẻ thay cho các API soạn thảo trả phí",
    ],
    configFields: [
      {
        label: "Base URL",
        description: "Base URL tương thích OpenAI. Giữ mặc định trừ khi dùng proxy.",
      },
      {
        label: "Model",
        description: "Model ID của Groq dùng để soạn thảo.",
      },
    ],
  },
  XAI_LLM: {
    tagline:
      "Model văn bản xAI Grok qua API key (tương thích OpenAI). Soạn thảo trả theo dùng với các model Grok mới nhất.",
    setupSteps: [
      "Tạo một xAI API key từ console.x.ai.",
      "Dán key bên dưới và dùng Test & Save — app gọi GET /v1/models để xác nhận.",
      "Chọn model trong form cấu hình (ví dụ `grok-4.3`).",
      "Bật provider và tùy chọn đặt làm mặc định cho tính năng soạn kịch bản.",
    ],
    helpsWith: [
      "Soạn kịch bản Grok chất lượng cao qua API key",
      "Các model Grok mới nhất cho nội dung dài",
      "Thay thế cho đường OAuth SuperGrok khi bạn có credit API",
    ],
    configFields: [
      {
        label: "Base URL",
        description: "Base URL tương thích OpenAI. Bearer token chỉ được gửi tới api.x.ai.",
      },
      {
        label: "Model",
        description: "Model ID xAI Grok dùng để soạn thảo.",
      },
    ],
  },
  GROK_OAUTH: {
    tagline:
      "Dùng gói SuperGrok hoặc X Premium+ của bạn để soạn kịch bản qua đăng nhập OAuth device-code — không cần API key hay tính phí theo token.",
    setupSteps: [
      "Mở Setup & config bên dưới và nhấn 'Connect SuperGrok'.",
      "Mở liên kết xác minh hiển thị, nhập user code, và phê duyệt truy cập bằng tài khoản SuperGrok / X Premium+ của bạn.",
      "App lưu token OAuth (đã mã hóa) và tự làm mới — không cần API key.",
      "Chọn model trong form cấu hình (ví dụ `grok-4.3`), rồi bật provider cho tính năng soạn kịch bản.",
    ],
    helpsWith: [
      "Soạn kịch bản tính vào gói đăng ký Grok thay vì credit API",
      "Không phải quản lý API key",
      "Các model Grok mới nhất qua gói hiện có của bạn",
    ],
    configFields: [
      {
        label: "Model",
        description: "Model ID xAI Grok dùng để soạn thảo.",
      },
    ],
  },
  OLLAMA: {
    tagline:
      "Chạy các LLM mở cục bộ với Ollama — hoàn toàn ngoại tuyến, không tốn phí. Endpoint tương thích OpenAI để soạn kịch bản.",
    setupSteps: [
      "Cài Ollama (ollama.com) và tải một model, ví dụ `ollama pull qwen2.5:7b` (hoặc dùng cloud tag như `kimi-k2.6:cloud`).",
      "Đặt Base URL bên dưới. `http://localhost:11434` hoặc `http://localhost:11434/v1` đều được — app tự chuẩn hóa sang path `/v1` tương thích OpenAI.",
      "Dùng Test — app gọi endpoint tags cục bộ để xác nhận server đang chạy.",
      "Bật provider và tùy chọn đặt làm mặc định soạn thảo. Model sẽ hiện trong Generate → Soạn nháp với AI.",
    ],
    helpsWith: [
      "Soạn kịch bản hoàn toàn ngoại tuyến, không tốn phí",
      "Tạo nội dung bằng model mở cục bộ (Qwen, Llama, v.v.)",
      "Không phụ thuộc cloud hay API key",
    ],
    configFields: [
      {
        label: "Base URL",
        description:
          "Host Ollama nhìn từ app Next.js. `http://localhost:11434` hoặc `…/v1` đều được; request đi tới `/v1/chat/completions`.",
      },
      {
        label: "Model mặc định",
        description:
          "Tag model Ollama fallback khi form soạn nháp không chọn model (ví dụ `qwen2.5:7b` hoặc `kimi-k2.6:cloud`).",
      },
    ],
  },
}

function mergeConfigFields(
  base: ProviderConfigField[],
  overrides: DeepPartial<ProviderConfigField>[],
): ProviderConfigField[] {
  return base.map((field, i) => {
    const ov = overrides[i]
    if (!ov) return field
    const { options: ovOptions, ...ovRest } = ov
    const mergedOptions = field.options?.map((option, j) => {
      const optOv = ovOptions?.[j]
      return optOv ? { ...option, ...optOv } : option
    })
    return {
      ...field,
      ...ovRest,
      ...(mergedOptions ? { options: mergedOptions } : {}),
    }
  })
}

function applyViOverrides(base: ProviderMeta, overrides: DeepPartial<ProviderMeta>): ProviderMeta {
  const merged: ProviderMeta = { ...base, ...(overrides as Partial<ProviderMeta>) }
  if (overrides.configFields && base.configFields) {
    merged.configFields = mergeConfigFields(
      base.configFields,
      overrides.configFields,
    )
  }
  return merged
}

export function getProviderMeta(name: string, locale = "vi"): ProviderMeta | null {
  const base = PROVIDER_META[name] ?? null
  if (!base) return null
  if (locale !== "vi") return base
  const overrides = PROVIDER_META_VI_OVERRIDES[name]
  if (!overrides) return base
  return applyViOverrides(base, overrides)
}
