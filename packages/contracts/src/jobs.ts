// Job payload contracts shared between the web app and worker queue boundary.

export type GenKind =
  | "PRESENTATION"
  | "PODCAST"
  | "REVOICE"
  | "VIDEO_REVOICE"
  | "AUDIOGRAM";
export type GenStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

export interface RenderJobData {
  generationId: string;
  providerId: string;
  kind: "PRESENTATION" | "PODCAST" | "REVOICE";
  speakers: RenderJobSpeaker[];
  output: RenderJobOutput;
  pacingLock: boolean;
  audiogramTitle?: string;
  sourceAudioKey?: string;
}

export interface VideoRevoiceJobData {
  generationId: string;
  providerId: string;
  sourceVideoKey: string;
  speakers: RenderJobSpeaker[];
  captions: boolean;
}

export interface RenderJobSpeaker {
  label: string;
  profileId?: string | undefined;
  segments: RenderJobSegment[];
  script?: string;
  xaiVoiceId?: string | undefined;
  keepOriginal?: boolean;
}

export interface RenderJobSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface RenderJobOutput {
  mp3: boolean;
  wav: boolean;
  chapters: boolean;
  audiogram?: boolean;
  audiogramAspect?: "1:1" | "9:16" | "16:9";
  /** Preset id: dark | midnight | forest | sunset | brand | slate */
  audiogramTheme?: string;
}

export interface IngestJobData {
  profileId: string;
  storageKey: string;
  version: number;
  userId?: string;
  notes?: string | undefined;
}

export interface AsrJobData {
  generationId: string;
  sourceKey: string;
  expectedSpeakers?: number;
}
