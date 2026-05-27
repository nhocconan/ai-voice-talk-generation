"use client"

import { useMemo, useRef, useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { parseTimedScript } from "@/lib/timed-script"
import { ProfileSelector } from "./ProfileSelector"
import { ProviderSelector } from "./ProviderSelector"
import { GenerationProgress } from "./GenerationProgress"
import { FilmIcon, SubtitlesIcon, UploadCloudIcon } from "lucide-react"

const ACCEPTED_VIDEO = "video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
const MAX_BYTES = 1024 * 1024 * 1024

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function VideoRevoiceGenerator() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [storageKey, setStorageKey] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [profileAId, setProfileAId] = useState("")
  const [profileBId, setProfileBId] = useState("")
  const [providerId, setProviderId] = useState("")
  const [script, setScript] = useState("")
  const [captions, setCaptions] = useState(true)
  const [parseError, setParseError] = useState<string | null>(null)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadMutation = trpc.generation.requestSourceVideoUploadUrl.useMutation()
  const submitMutation = trpc.generation.submitVideoRevoice.useMutation({
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

  async function handleFile(file: File) {
    setUploadError(null)
    if (file.size > MAX_BYTES) {
      setUploadError("Video exceeds the 1 GB limit.")
      return
    }
    setUploading(true)
    setFileName(file.name)
    setFileSize(file.size)
    try {
      const { uploadUrl, storageKey: nextKey } = await uploadMutation.mutateAsync({
        filename: file.name,
        contentType: file.type || "video/mp4",
        contentLength: file.size,
      })
      const resp = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "video/mp4" },
      })
      if (!resp.ok) throw new Error(`Upload failed (HTTP ${resp.status})`)
      setStorageKey(nextKey)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed")
      setStorageKey("")
      setFileName(null)
    } finally {
      setUploading(false)
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) await handleFile(file)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const segments = parseTimedScript(script)
      setParseError(null)
      const speakers = (["A", "B"] as const)
        .map((label) => ({
          label,
          profileId: label === "A" ? profileAId : profileBId || profileAId,
          segments: segments
            .filter((s) => s.label === label)
            .map(({ startMs, endMs, text }) => ({ startMs, endMs, text })),
        }))
        .filter((s) => s.profileId && s.segments.length > 0)

      submitMutation.mutate({
        sourceVideoKey: storageKey,
        estimatedMinutes,
        providerId: providerId || undefined,
        captions,
        speakers,
      })
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Timed script is invalid")
    }
  }

  if (generationId) {
    return <GenerationProgress generationId={generationId} onReset={() => setGenerationId(null)} />
  }

  const submitDisabled =
    submitMutation.isPending || uploading || !storageKey || !profileAId || !script.trim()

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Upload */}
      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-display-card">1 · Source video</h2>
          <span className="text-micro text-[var(--color-text-muted)]">MP4 · MOV · WebM · MKV · ≤ 1 GB</span>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) await handleFile(f)
          }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-[var(--radius-xl)] border-2 border-dashed p-10 text-center transition-colors ${
            dragOver
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
              : storageKey
                ? "border-[var(--color-success)] bg-[var(--color-surface-1)]"
                : "border-[var(--color-border)] hover:border-[var(--color-text-muted)] bg-[var(--color-surface-1)]"
          }`}
        >
          {storageKey && fileName ? (
            <>
              <FilmIcon size={32} className="text-[var(--color-success)]" aria-hidden />
              <div>
                <p className="text-body-med text-[var(--color-text-primary)]">{fileName}</p>
                <p className="text-micro text-[var(--color-text-muted)] mt-1">
                  {formatBytes(fileSize)} uploaded · ready to re-voice
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setFileName(null)
                  setStorageKey("")
                  if (fileRef.current) fileRef.current.value = ""
                }}
                className="text-micro text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] underline"
              >
                Replace
              </button>
            </>
          ) : (
            <>
              <UploadCloudIcon size={32} className="text-[var(--color-text-muted)]" aria-hidden />
              <div>
                <p className="text-body-ui text-[var(--color-text-primary)]">
                  Drop a video here, or click to browse
                </p>
                <p className="text-micro text-[var(--color-text-muted)] mt-1">
                  NotebookLM Audio Overview MP4 exports work out of the box.
                </p>
              </div>
              {uploading && (
                <p className="text-micro text-[var(--color-accent)]">Uploading {fileName}…</p>
              )}
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_VIDEO}
            className="sr-only"
            onChange={handleFileSelect}
            aria-label="Upload source video"
          />
        </label>
        {uploadError && (
          <p className="text-micro text-[var(--color-danger)] mt-3" role="alert">
            {uploadError}
          </p>
        )}
      </section>

      {/* 2. Speakers */}
      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-display-card">2 · Assign voices</h2>
          <span className="text-micro text-[var(--color-text-muted)]">
            Match each speaker label in your transcript to a cloned profile.
          </span>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <label className="block text-caption mb-2">
              Speaker A <span className="text-[var(--color-text-muted)]">(host)</span>
            </label>
            <ProfileSelector selected={profileAId} onSelect={setProfileAId} />
          </div>
          <div>
            <label className="block text-caption mb-2">
              Speaker B <span className="text-[var(--color-text-muted)]">(guest — optional)</span>
            </label>
            <ProfileSelector selected={profileBId} onSelect={setProfileBId} exclude={profileAId ? [profileAId] : []} />
          </div>
        </div>
      </section>

      {/* 3. Provider */}
      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <h2 className="text-display-card mb-4">3 · Provider</h2>
        <ProviderSelector
          value={providerId}
          onChange={setProviderId}
          description="VieNeu / VoxCPM excel at Vietnamese; xAI Grok TTS and Xiaomi MiMo handle long-form English best."
        />
      </section>

      {/* 4. Transcript + options */}
      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-display-card">4 · Aligned transcript</h2>
          <span className="text-micro text-[var(--color-text-muted)]">
            <code className="font-mono">[MM:SS A] text</code> per line
          </span>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={12}
          placeholder="[00:00 A] Welcome to today's episode.&#10;[00:06 B] Thanks for having me."
          className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui font-mono text-sm leading-relaxed resize-y"
          style={{ minHeight: "220px" }}
          aria-label="Aligned transcript"
        />
        <p className="text-micro text-[var(--color-text-muted)] mt-2">
          Tip: run the audio re-voice flow on the extracted track first — it gives you a diarized
          baseline you can paste and refine here.
        </p>

        <label className="mt-5 flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={captions}
            onChange={(e) => setCaptions(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)]"
          />
          <SubtitlesIcon size={16} className="text-[var(--color-text-muted)]" aria-hidden />
          <span className="text-body-ui">Burn captions into the output video</span>
        </label>
      </section>

      {parseError && <p className="text-body-ui text-[var(--color-danger)]">{parseError}</p>}
      {submitMutation.error && (
        <p className="text-body-ui text-[var(--color-danger)]">{submitMutation.error.message}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-micro text-[var(--color-text-muted)]">
          Estimated length: <strong className="text-[var(--color-text-primary)]">{estimatedMinutes.toFixed(1)} min</strong>
        </p>
        <button
          type="submit"
          disabled={submitDisabled}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {submitMutation.isPending ? "Queueing…" : "Re-voice video"}
        </button>
      </div>
    </form>
  )
}
