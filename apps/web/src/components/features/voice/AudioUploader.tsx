"use client"

import { useCallback, useState } from "react"
import { UploadCloudIcon, CheckCircleIcon, XCircleIcon } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { formatFileSize } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface Props {
  profileId: string
  onComplete: () => void
}

const ALLOWED_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/flac", "audio/ogg"]
const MAX_SIZE = 100 * 1024 * 1024

interface FileEntry {
  file: File
  status: "pending" | "uploading" | "done" | "error"
  progress: number
  error?: string
}

export function AudioUploader({ profileId, onComplete }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)

  const requestUploadUrl = trpc.voiceProfile.requestUploadUrl.useMutation()
  const submitSample = trpc.voiceProfile.submitSample.useMutation()

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) return false
      if (f.size > MAX_SIZE) return false
      return true
    })
    setFiles((prev) => [...prev, ...valid.map((f) => ({ file: f, status: "pending" as const, progress: 0 }))])
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
  }

  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === "pending")
    let doneCount = 0

    for (const entry of pending) {
      setFiles((prev) => prev.map((f) => f === entry ? { ...f, status: "uploading" } : f))

      try {
        const { uploadUrl, storageKey } = await requestUploadUrl.mutateAsync({
          profileId,
          filename: entry.file.name,
          contentType: entry.file.type,
          contentLength: entry.file.size,
        })

        await fetch(uploadUrl, { method: "PUT", body: entry.file, headers: { "Content-Type": entry.file.type } })
        await submitSample.mutateAsync({ profileId, storageKey, notes: entry.file.name })

        setFiles((prev) => prev.map((f) => f === entry ? { ...f, status: "done", progress: 100 } : f))
        doneCount++
      } catch {
        setFiles((prev) => prev.map((f) => f === entry ? { ...f, status: "error", error: "Upload failed" } : f))
      }
    }

    if (doneCount > 0) onComplete()
  }

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative border-2 border-dashed rounded-[var(--radius-card)] p-10 text-center transition-colors",
          dragging ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] hover:bg-[var(--color-surface-1)]",
        )}
      >
        <input
          type="file"
          accept=".mp3,.m4a,.wav,.flac,.ogg,audio/*"
          multiple
          onChange={onFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Upload audio files"
        />
        <UploadCloudIcon size={32} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
        <p className="text-body-med">Drop files here or click to upload</p>
        <p className="text-caption text-[var(--color-text-muted)] mt-1">mp3, m4a, wav, flac — max 100 MB each</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-1)]"
            >
              <div className="flex-1 min-w-0">
                <p className="text-small truncate">{entry.file.name}</p>
                <p className="text-micro text-[var(--color-text-muted)]">{formatFileSize(entry.file.size)}</p>
              </div>
              {entry.status === "done" && <CheckCircleIcon size={16} style={{ color: "var(--color-success)" }} />}
              {entry.status === "error" && <XCircleIcon size={16} style={{ color: "var(--color-danger)" }} />}
              {entry.status === "uploading" && <span className="text-micro text-[var(--color-text-muted)] animate-pulse">Uploading…</span>}
            </div>
          ))}
        </div>
      )}

      {files.some((f) => f.status === "pending") && (
        <button
          onClick={uploadAll}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-black text-white text-button hover:opacity-90 transition-opacity"
        >
          Upload {files.filter((f) => f.status === "pending").length} file{files.filter((f) => f.status === "pending").length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  )
}
