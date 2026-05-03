// Provider capability contracts

export interface ProviderCapability {
  name: string;
  supportsVoiceClone: boolean;
  supportedLanguages: string[];
  maxChunkChars: number;
  requiresApiKey: boolean;
  requiresGpu: boolean;
}

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapability> = {
  VIENEU_TTS: {
    name: "VieNeu-TTS",
    supportsVoiceClone: true,
    supportedLanguages: ["vi", "en"],
    maxChunkChars: 320,
    requiresApiKey: false,
    requiresGpu: false,
  },
  VOXCPM2: {
    name: "VoxCPM2",
    supportsVoiceClone: true,
    supportedLanguages: ["vi", "en", "zh", "fr", "de", "es", "pt", "ja", "ko", "th", "id", "ms"],
    maxChunkChars: 260,
    requiresApiKey: false,
    requiresGpu: false,
  },
  XTTS_V2: {
    name: "XTTS v2",
    supportsVoiceClone: true,
    supportedLanguages: ["vi", "en", "zh", "fr", "de", "es", "pt", "ja", "ko"],
    maxChunkChars: 250,
    requiresApiKey: false,
    requiresGpu: false,
  },
  F5_TTS: {
    name: "F5-TTS",
    supportsVoiceClone: true,
    supportedLanguages: ["vi", "en", "zh"],
    maxChunkChars: 300,
    requiresApiKey: false,
    requiresGpu: false,
  },
  ELEVENLABS: {
    name: "ElevenLabs",
    supportsVoiceClone: true,
    supportedLanguages: ["vi", "en", "zh", "fr", "de", "es", "pt", "ja", "ko"],
    maxChunkChars: 2500,
    requiresApiKey: true,
    requiresGpu: false,
  },
  GEMINI_TTS: {
    name: "Gemini TTS",
    supportsVoiceClone: false,
    supportedLanguages: ["vi", "en", "zh", "fr", "de", "es", "pt", "ja", "ko"],
    maxChunkChars: 5000,
    requiresApiKey: true,
    requiresGpu: false,
  },
};
