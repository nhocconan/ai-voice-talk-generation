// Job payload contracts shared between the web app and worker queue boundary.

export type GenKind = "PRESENTATION" | "PODCAST" | "REVOICE";
export type GenStatus = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

export interface RenderJobData {
  generationId: string;
  providerId: string;
  kind: GenKind;
  speakers: RenderJobSpeaker[];
  output: RenderJobOutput;
  pacingLock: boolean;
}

export interface RenderJobSpeaker {
  label: string;
  profileId: string;
  segments: RenderJobSegment[];
  script?: string;
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
