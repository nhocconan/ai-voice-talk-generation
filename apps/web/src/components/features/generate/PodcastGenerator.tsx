"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { ProfileSelector } from "./ProfileSelector";
import { GenerationProgress } from "./GenerationProgress";

interface TimedSegment {
  speaker: "host" | "guest";
  text: string;
}

export function PodcastGenerator() {
  const [hostProfileId, setHostProfileId] = useState("");
  const [guestProfileId, setGuestProfileId] = useState("");
  const [lang, setLang] = useState("vi");
  const [speed, setSpeed] = useState(1.0);
  const [segments, setSegments] = useState<TimedSegment[]>([
    { speaker: "host", text: "" },
    { speaker: "guest", text: "" },
  ]);
  const [generationId, setGenerationId] = useState<string | null>(null);

  const utils = api.useUtils();
  const mutation = api.generation.createPodcast.useMutation({
    onSuccess: (data) => {
      setGenerationId(data.generationId);
      void utils.generation.list.invalidate();
    },
  });

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      { speaker: prev[prev.length - 1]?.speaker === "host" ? "guest" : "host", text: "" },
    ]);
  }

  function updateSegment(idx: number, field: keyof TimedSegment, value: string) {
    setSegments((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  }

  function removeSegment(idx: number) {
    if (segments.length <= 2) return;
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hostProfileId) return;

    const script = {
      segments: segments.map((s) => ({
        speaker: s.speaker,
        text: s.text,
      })),
    };

    mutation.mutate({
      hostProfileId,
      guestProfileId: guestProfileId || hostProfileId,
      lang,
      speed,
      timedScript: JSON.stringify(script),
    });
  }

  if (generationId) {
    return (
      <GenerationProgress
        generationId={generationId}
        onReset={() => setGenerationId(null)}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Host (Speaker A)</h2>
          <ProfileSelector
            value={hostProfileId}
            onChange={setHostProfileId}
            placeholder="Select host voice..."
            required
          />
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Guest (Speaker B)</h2>
          <ProfileSelector
            value={guestProfileId}
            onChange={setGuestProfileId}
            placeholder="Same as host (leave empty) or select..."
          />
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Leave empty to use the same voice as host
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">Language</label>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="vi">Vietnamese</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--color-text-primary)]">
            Speed: {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Script Segments</h2>
          <button
            type="button"
            onClick={addSegment}
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            + Add segment
          </button>
        </div>

        {segments.map((seg, idx) => (
          <div
            key={idx}
            className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
          >
            <div className="w-28 flex-shrink-0">
              <select
                value={seg.speaker}
                onChange={(e) => updateSegment(idx, "speaker", e.target.value)}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1.5 text-xs focus:outline-none"
              >
                <option value="host">Host</option>
                <option value="guest">Guest</option>
              </select>
            </div>
            <textarea
              value={seg.text}
              onChange={(e) => updateSegment(idx, "text", e.target.value)}
              placeholder={`${seg.speaker === "host" ? "Host" : "Guest"} line...`}
              rows={2}
              className="flex-1 resize-none rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeSegment(idx)}
              disabled={segments.length <= 2}
              className="self-start text-[var(--color-text-tertiary)] hover:text-red-500 disabled:opacity-30"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {mutation.error && (
        <p className="text-sm text-red-500">{mutation.error.message}</p>
      )}

      <button
        type="submit"
        disabled={mutation.isPending || !hostProfileId || segments.every((s) => !s.text.trim())}
        className="rounded-[var(--radius-warm-btn)] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      >
        {mutation.isPending ? "Generating..." : "Generate Podcast"}
      </button>
    </form>
  );
}
