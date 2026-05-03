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
    tagline: "Vietnamese-first local TTS with instant voice cloning, GGUF/Turbo options, and Apple Silicon-friendly workflows.",
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
      "On Apple Silicon or CPU-only hosts, install the VieNeu SDK in the worker: `cd apps/worker && uv sync --extra vieneu`.",
      "For best Mac ergonomics, start with `mode=local`, `device=mps`, and the default `pnnbao-ump/VieNeu-TTS` model. This keeps cloning and synthesis inside the worker.",
      "If you want the higher-quality remote server path, start a VieNeu server separately and set `mode=remote` plus `apiBase` in the config form below.",
      "Upload a clean 3–10 second reference clip per profile. VieNeu works best with a single speaker, little room noise, and no music bed.",
      "Click Save config, then Test. A green test means the worker could import the SDK and initialize the configured runtime.",
      "Enable the provider only after the test passes. Set it as default if this machine is your main Vietnamese local inference host.",
    ],
    helpsWith: [
      "Local Vietnamese presentation generation on Mac Mini / MacBook Pro",
      "Low-cost 20–60 minute talk rendering with chunked synthesis",
      "Offline voice cloning from short user reference samples",
      "Fast iteration for MVP without cloud API spend",
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
    name: "Coqui XTTS v2 (community fork)",
    shortName: "XTTS",
    tagline: "Established local multilingual fallback. Kept for compatibility, not the primary Mac-first recommendation anymore.",
    needsApiKey: false,
    docsLinks: [
      { label: "Community Fork", url: "https://github.com/idiap/coqui-ai-TTS" },
      { label: "Model", url: "https://huggingface.co/coqui/XTTS-v2" },
    ],
    supports: {
      tts: true,
      voiceCloning: true,
      asr: false,
      diarization: false,
      streaming: false,
      styleConditioning: false,
      languages: ["vi", "en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "hu", "ko", "ja"],
    },
    setupSteps: [
      "XTTS runs locally inside the worker; no API key is required.",
      "The worker image already includes `TTS`. Model weights are downloaded on first use from Hugging Face.",
      "Use `device=mps` on Apple Silicon or `device=cuda` on Linux GPU hosts.",
      "Save config, Test, then enable. Keep it as a fallback local provider if VieNeu or VoxCPM2 are unavailable on the host.",
    ],
    helpsWith: [
      "Fallback local TTS when newer providers are unavailable",
      "Legacy compatibility with existing test fixtures",
      "General multilingual synthesis",
    ],
    defaultConfig: {
      model: "tts_models/multilingual/multi-dataset/xtts_v2",
      device: "mps",
      maxChunkChars: 250,
    },
    configFields: [
      {
        key: "model",
        label: "Model",
        input: "text",
        description: "XTTS model path or registry name.",
      },
      {
        key: "device",
        label: "Preferred Device",
        input: "select",
        description: "The worker still validates the host device; use this to override the default.",
        options: [
          { value: "mps", label: "Apple Silicon (mps)" },
          { value: "cpu", label: "CPU" },
          { value: "cuda", label: "CUDA" },
        ],
      },
      {
        key: "maxChunkChars",
        label: "Chunk Size",
        input: "number",
        description: "Maximum characters per chunk for the app chunker.",
      },
    ],
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
    tagline: "Grok TTS with custom voices — clone a voice from up to 120 s of audio and reuse the voice_id across REST and WebSocket TTS.",
    needsApiKey: true,
    docsLinks: [
      { label: "API Console", url: "https://console.x.ai" },
      { label: "TTS Docs", url: "https://docs.x.ai/developers/model-capabilities/audio/text-to-speech" },
      { label: "Custom Voices", url: "https://docs.x.ai/developers/model-capabilities/audio/custom-voices" },
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
      "Generate an xAI API key from console.x.ai (Enterprise plan required for /custom-voices).",
      "Paste the key below and use Test & Save — the worker pings GET /v1/tts/voices to confirm.",
      "Pick a default built-in voice (eve, ara, leo, rex, sal) used when no clone sample is supplied.",
      "Cloning is one-shot: when a profile is rendered the first time the reference clip is uploaded to /custom-voices and the returned voice_id is reused.",
    ],
    helpsWith: [
      "High-quality voice cloning from a short reference (90+ s recommended)",
      "20-language multilingual narration with speech tag styling",
      "Real-time streaming via WebSocket (REST is used here)",
    ],
    defaultConfig: {
      voice: "eve",
      codec: "mp3",
      sampleRate: 24000,
      bitRate: 128000,
      textNormalization: false,
      maxChunkChars: 5000,
    },
    configFields: [
      {
        key: "voice",
        label: "Default Built-in Voice",
        input: "select",
        description: "Voice used when no clone sample is supplied.",
        options: [
          { value: "eve", label: "Eve" },
          { value: "ara", label: "Ara" },
          { value: "leo", label: "Leo" },
          { value: "rex", label: "Rex" },
          { value: "sal", label: "Sal" },
        ],
      },
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
}

export function getProviderMeta(name: string): ProviderMeta | null {
  return PROVIDER_META[name] ?? null
}
