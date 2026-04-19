// SSE event contracts for job progress streaming

export type JobEventType = "progress" | "done" | "error" | "cancelled";

export interface JobProgressEvent {
  type: "progress";
  jobId: string;
  percent: number;
  message: string;
  step?: string;
}

export interface JobDoneEvent {
  type: "done";
  jobId: string;
  outputMp3Url?: string;
  outputWavUrl?: string;
  durationMs?: number;
  chapters?: ChapterMark[];
}

export interface JobErrorEvent {
  type: "error";
  jobId: string;
  message: string;
  retryable: boolean;
}

export interface JobCancelledEvent {
  type: "cancelled";
  jobId: string;
}

export type JobEvent = JobProgressEvent | JobDoneEvent | JobErrorEvent | JobCancelledEvent;

export interface ChapterMark {
  title: string;
  startMs: number;
  speaker?: string;
}
