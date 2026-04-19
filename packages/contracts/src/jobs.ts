// Job payload contracts shared between web (BullMQ producer) and worker (Redis Streams consumer)

export type GenKind = "PRESENTATION" | "PODCAST" | "REVOICE";
export type GenStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";
export type ProviderName = "XTTS_V2" | "F5_TTS" | "ELEVENLABS" | "GEMINI_TTS";

export interface RenderJobData {
  generationId: string;
  kind: GenKind;
  providerName: ProviderName;
  apiKeyEnc?: string;
  lang: string;
  speed: number;
  script: string | TimedScript;
  speakerProfiles: SpeakerProfileRef[];
  outputFormats: ("MP3" | "WAV")[];
}

export interface IngestJobData {
  sampleId: string;
  profileId: string;
  storageKey: string;
  version: number;
}

export interface AsrJobData {
  generationId: string;
  storageKey: string;
  lang: string;
  diarize: boolean;
  numSpeakers?: number;
}

export interface SpeakerProfileRef {
  label: string;
  profileId: string;
  sampleKeys: string[];
}

export interface TimedScript {
  segments: TimedSegment[];
}

export interface TimedSegment {
  speaker: string;
  text: string;
  startMs?: number;
  endMs?: number;
}
