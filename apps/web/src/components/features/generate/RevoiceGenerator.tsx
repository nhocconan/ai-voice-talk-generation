"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/trpc/client";
import { ProfileSelector } from "./ProfileSelector";
import { GenerationProgress } from "./GenerationProgress";

interface SpeakerAssignment {
  label: string;
  profileId: string;
}

export function RevoiceGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [storageKey, setStorageKey] = useState("");
  const [lang, setLang] = useState("vi");
  const [diarize, setDiarize] = useState(true);
  const [numSpeakers, setNumSpeakers] = useState(2);
  const [speakers, setSpeakers] = useState<SpeakerAssignment[]>([
    { label: "SPEAKER_00", profileId: "" },
    { label: "SPEAKER_01", profileId: "" },
  ]);
  const [asrDone, setAsrDone] = useState(false);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const presignMutation = api.voiceProfile.presignUpload.useMutation();
  const asrMutation = api.generation.submitAsr.useMutation({
    onSuccess: () => setAsrDone(true),
  });
  const revoiceMutation = api.generation.submitRevoice.useMutation({
    onSuccess: (data) => setGenerationId(data.generationId),
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploading(true);

    try {
      const { uploadUrl, key } = await presignMutation.mutateAsync({
        filename: f.name,
        contentType: f.type || "audio/mpeg",
        bucket: "source",
      });

      await fetch(uploadUrl, {
        method: "PUT",
        body: f,
        headers: { "Content-Type": f.type || "audio/mpeg" },
      });

      setStorageKey(key);
    } finally {
      setUploading(false);
    }
  }

  function handleRunAsr() {
    if (!storageKey) return;
    asrMutation.mutate({ storageKey, lang, diarize, numSpeakers });
  }

  function updateSpeaker(idx: number, profileId: string) {
    setSpeakers((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, profileId } : s))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    revoiceMutation.mutate({
      sourceStorageKey: storageKey,
      speakerAssignments: speakers,
      lang,
    });
  }

  if (generationId) {
    return <GenerationProgress generationId={generationId} onReset={() => setGenerationId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">1. Upload Source Audio</h2>

        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-border)] p-8 text-center hover:border-[var(--color-accent)] transition-colors"
        >
          {file ? (
            <p className="text-sm text-[var(--color-text-primary)]">{file.name}</p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">Click to upload MP3 or M4A</p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Max 500MB</p>
            </>
          )}
          {uploading && <p className="mt-2 text-xs text-[var(--color-accent)]">Uploading...</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {storageKey && !asrDone && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">2. Transcribe & Diarize</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">Language</label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value="vi">Vietnamese</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">Auto-diarize</label>
              <input
                type="checkbox"
                checked={diarize}
                onChange={(e) => setDiarize(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">Num speakers</label>
              <select
                value={numSpeakers}
                onChange={(e) => setNumSpeakers(parseInt(e.target.value))}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRunAsr}
            disabled={asrMutation.isPending}
            className="rounded-[var(--radius-warm-btn)] bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {asrMutation.isPending ? "Transcribing..." : "Run Transcription"}
          </button>
          {asrMutation.error && (
            <p className="text-sm text-red-500">{asrMutation.error.message}</p>
          )}
        </div>
      )}

      {asrDone && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">3. Assign Voices to Speakers</h2>
            {speakers.map((sp, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <span className="w-28 text-sm font-mono text-[var(--color-text-secondary)]">{sp.label}</span>
                <div className="flex-1">
                  <ProfileSelector
                    value={sp.profileId}
                    onChange={(id) => updateSpeaker(idx, id)}
                    placeholder="Select voice..."
                    required
                  />
                </div>
              </div>
            ))}
          </div>

          {revoiceMutation.error && (
            <p className="text-sm text-red-500">{revoiceMutation.error.message}</p>
          )}

          <button
            type="submit"
            disabled={revoiceMutation.isPending || speakers.some((s) => !s.profileId)}
            className="rounded-[var(--radius-warm-btn)] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {revoiceMutation.isPending ? "Processing..." : "Re-voice Audio"}
          </button>
        </form>
      )}
    </div>
  );
}
