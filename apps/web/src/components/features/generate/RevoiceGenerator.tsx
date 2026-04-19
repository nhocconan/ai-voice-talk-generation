"use client"

import { useMemo, useRef, useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { parseTimedScript } from "@/lib/timed-script"
import { ProfileSelector } from "./ProfileSelector"
import { GenerationProgress } from "./GenerationProgress"

export function RevoiceGenerator() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [storageKey, setStorageKey] = useState("")
  const [uploading, setUploading] = useState(false)
  const [profileAId, setProfileAId] = useState("")
  const [profileBId, setProfileBId] = useState("")
  const [script, setScript] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadMutation = trpc.generation.requestSourceUploadUrl.useMutation()
  const revoiceMutation = trpc.generation.submitRevoice.useMutation({
    onSuccess: (data) => setGenerationId(data.generationId),
  })

  const estimatedMinutes = useMemo(() => {
    if (!script.trim()) return 0.5

    try {
      const lastEndMs = parseTimedScript(script).at(-1)?.endMs ?? 30_000
      return Math.max(0.5, Math.min(60, lastEndMs / 60_000))
    } catch {
      return 0.5
    }
  }, [script])

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setFileName(file.name)

    try {
      const { uploadUrl, storageKey: nextStorageKey } = await uploadMutation.mutateAsync({
        filename: file.name,
        contentType: file.type || "audio/mpeg",
        contentLength: file.size,
      })

      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "audio/mpeg" },
      })

      setStorageKey(nextStorageKey)
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const segments = parseTimedScript(script)
      setParseError(null)

      const speakers = (["A", "B"] as const)
        .map((label) => ({
          label,
          profileId: label === "A" ? profileAId : (profileBId || profileAId),
          segments: segments
            .filter((segment) => segment.label === label)
            .map(({ startMs, endMs, text }) => ({ startMs, endMs, text })),
        }))
        .filter((speaker) => speaker.profileId && speaker.segments.length > 0)

      revoiceMutation.mutate({
        sourceAudioKey: storageKey,
        estimatedMinutes,
        speakers,
      })
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Timed script is invalid")
    }
  }

  if (generationId) {
    return <GenerationProgress generationId={generationId} onReset={() => setGenerationId(null)} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">1. Upload Source Audio</h2>
        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-border)] p-8 text-center hover:border-[var(--color-accent)] transition-colors"
        >
          {fileName ? (
            <p className="text-sm text-[var(--color-text-primary)]">{fileName}</p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">Click to upload MP3 or M4A</p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Max 100MB</p>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">2. Speaker A</h2>
          <ProfileSelector value={profileAId} onChange={setProfileAId} />
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">3. Speaker B</h2>
          <ProfileSelector value={profileBId} onChange={setProfileBId} />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">4. Timed Script</h2>
        <textarea
          value={script}
          onChange={(event) => setScript(event.target.value)}
          rows={10}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          placeholder="[00:00 A] Opening line&#10;[00:06 B] Response"
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Paste the corrected transcript in <code>[MM:SS A] text</code> format before rendering.
        </p>
      </div>

      {parseError && <p className="text-sm text-red-500">{parseError}</p>}
      {revoiceMutation.error && <p className="text-sm text-red-500">{revoiceMutation.error.message}</p>}

      <button
        type="submit"
        disabled={revoiceMutation.isPending || uploading || !storageKey || !profileAId || !script.trim()}
        className="rounded-[var(--radius-warm-btn)] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      >
        {revoiceMutation.isPending ? "Processing..." : `Re-voice Audio (${estimatedMinutes.toFixed(1)} min)`}
      </button>
    </form>
  )
}
