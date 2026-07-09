"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { UploadCloudIcon, CheckCircleIcon, XCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { formatFileSize } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface Props {
  profileId: string
  onComplete: () => void
}

const ALLOWED_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/flac", "audio/ogg", "audio/webm"]
const MAX_SIZE = 100 * 1024 * 1024

interface FileEntry {
  file: File
  status: "pending" | "uploading" | "done" | "error"
  progress: number
  url?: string | undefined
  error?: string | undefined
  canRetry?: boolean | undefined
}

export function AudioUploader({ profileId, onComplete }: Props) {
  const t = useTranslations("voices")
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const objectUrlsRef = useRef<string[]>([])

  const requestUploadUrl = trpc.voiceProfile.requestUploadUrl.useMutation()
  const submitSample = trpc.voiceProfile.submitSample.useMutation()

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const addFiles = useCallback((incoming: File[]) => {
    const nextEntries = incoming.map((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return {
          file,
          status: "error" as const,
          progress: 0,
          error: t("unsupportedFileType"),
        }
      }
      if (file.size > MAX_SIZE) {
        return {
          file,
          status: "error" as const,
          progress: 0,
          error: t("fileTooLarge"),
        }
      }

      const url = URL.createObjectURL(file)
      objectUrlsRef.current.push(url)
      return { file, status: "pending" as const, progress: 0, url }
    })

    setFiles((prev) => [...prev, ...nextEntries])
  }, [t])

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
      setFiles((prev) => prev.map((f) => f === entry ? { ...f, status: "uploading", progress: 0 } : f))

      try {
        const { uploadUrl, storageKey } = await requestUploadUrl.mutateAsync({
          profileId,
          filename: entry.file.name,
          contentType: entry.file.type,
          contentLength: entry.file.size,
        })

        await uploadFileWithProgress(uploadUrl, entry.file, (progress) => {
          setFiles((prev) => prev.map((f) => f === entry ? { ...f, progress } : f))
        })
        await submitSample.mutateAsync({ profileId, storageKey, notes: entry.file.name })

        setFiles((prev) => prev.map((f) => f === entry ? { ...f, status: "done", progress: 100 } : f))
        doneCount++
      } catch {
        setFiles((prev) => prev.map((f) => f === entry ? { ...f, status: "error", error: t("uploadFailedRetry"), progress: 0, canRetry: true } : f))
      }
    }

    if (doneCount > 0) onComplete()
  }

  const retry = (entry: FileEntry) => {
    setFiles((prev) => prev.map((f) => (f === entry ? { ...f, status: "pending", error: undefined, canRetry: false, progress: 0 } : f)))
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-1)] p-4">
        <p className="text-caption text-[var(--color-text-secondary)]">{t("uploadRecordingGuidance")}</p>
      </div>

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
        <p className="text-body-med">{t("dropFilesHere")}</p>
        <p className="text-caption text-[var(--color-text-muted)] mt-1">{t("dropFilesHint")}</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-caption text-[var(--color-text-secondary)]">{t("selectedFilesTitle")}</h3>
          {files.map((entry, i) => (
            <div
              key={i}
              className="space-y-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-1)]"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-small truncate">{entry.file.name}</p>
                  <p className="text-micro text-[var(--color-text-muted)]">{formatFileSize(entry.file.size)}</p>
                </div>
                {entry.status === "done" && <CheckCircleIcon size={16} style={{ color: "var(--color-success)" }} />}
                {entry.status === "error" && <XCircleIcon size={16} style={{ color: "var(--color-danger)" }} />}
                {entry.status === "uploading" && <span className="text-micro text-[var(--color-text-muted)] animate-pulse">{entry.progress}%</span>}
                {entry.error && <span className="text-micro text-[var(--color-danger)]">{entry.error}</span>}
                {entry.canRetry && (
                  <button
                    type="button"
                    onClick={() => retry(entry)}
                    className="text-micro cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-border)] px-2.5 py-1 hover:bg-[var(--color-surface-0)] transition-colors"
                  >
                    {t("retry")}
                  </button>
                )}
              </div>
              {entry.url && (
                <audio controls src={entry.url} className="w-full h-10" />
              )}
            </div>
          ))}
        </div>
      )}

      {files.some((f) => f.status === "pending") && (
        <button
          onClick={uploadAll}
          className="h-10 cursor-pointer px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90 transition-opacity"
        >
          {t("uploadCount", { count: files.filter((f) => f.status === "pending").length })}
        </button>
      )}
    </div>
  )
}

function uploadFileWithProgress(
  url: string,
  file: File,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }

      reject(new Error(`Upload failed with status ${xhr.status}`))
    }

    xhr.onerror = () => reject(new Error("Network error"))
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type)
    xhr.send(file)
  })
}
