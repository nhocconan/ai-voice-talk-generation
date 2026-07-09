/**
 * Approximate provider cost estimates, keyed by ProviderName enum value.
 *
 * Rates are rough $/minute for Vietnamese narration (~800 chars/min) as of
 * mid-2026, for a pre-render "what will this cost" hint — not billing. Local
 * providers run on your own hardware so their marginal cost is ~0.
 *
 * Sources: xAI Grok TTS ≈ $4.20/1M chars ≈ $0.003/min (cheapest cloning-capable
 * API); ElevenLabs multilingual is the premium lane; Xiaomi MiMo / Gemini are
 * cheap. Re-check provider pricing pages before relying on these.
 */
export interface ProviderRate {
  costPerMinuteUsd: number
  isLocal: boolean
}

const RATES: Record<string, ProviderRate> = {
  // Local — run on your own Mac/GPU, ~free marginal cost
  VIENEU_TTS: { costPerMinuteUsd: 0, isLocal: true },
  VOXCPM2: { costPerMinuteUsd: 0, isLocal: true },
  XTTS_V2: { costPerMinuteUsd: 0, isLocal: true },
  F5_TTS: { costPerMinuteUsd: 0, isLocal: true },
  KOKORO: { costPerMinuteUsd: 0, isLocal: true },
  INDEXTTS2: { costPerMinuteUsd: 0, isLocal: true },
  VIBEVOICE: { costPerMinuteUsd: 0, isLocal: true },
  // Cloud
  XAI_TTS: { costPerMinuteUsd: 0.003, isLocal: false },
  // Based on MiniMax's published HD rate of $100/1M chars (+$1.5 one-time clone
  // fee, not included). Not re-verified against speech-2.8-hd list pricing.
  MINIMAX_TTS: { costPerMinuteUsd: 0.08, isLocal: false },
  GEMINI_TTS: { costPerMinuteUsd: 0.004, isLocal: false },
  XIAOMI_TTS: { costPerMinuteUsd: 0.006, isLocal: false },
  ELEVENLABS: { costPerMinuteUsd: 0.12, isLocal: false },
  // LLM (script drafting) — cost is per-token, not per-minute, so costPerMinuteUsd
  // is not meaningful here. Free-tier / subscription lanes are 0; OLLAMA is local;
  // XAI_LLM (pay-as-you-go API) carries a token nonzero placeholder.
  GEMINI_LLM: { costPerMinuteUsd: 0, isLocal: false },
  GROQ: { costPerMinuteUsd: 0, isLocal: false },
  GROK_OAUTH: { costPerMinuteUsd: 0, isLocal: false },
  OLLAMA: { costPerMinuteUsd: 0, isLocal: true },
  XAI_LLM: { costPerMinuteUsd: 0.001, isLocal: false },
}

export function getProviderRate(name: string): ProviderRate | null {
  return RATES[name] ?? null
}
