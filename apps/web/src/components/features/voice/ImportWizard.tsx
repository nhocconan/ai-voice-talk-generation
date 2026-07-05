"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import JSZip from "jszip"
import { z } from "zod"
import { UploadCloudIcon, CheckCircleIcon } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { cn } from "@/lib/utils"

const EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  webm: "audio/webm",
}
const MAX_SAMPLES = 50
const MAX_SAMPLE_BYTES = 100 * 1024 * 1024

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.object({
    name: z.string().min(1),
    lang: z.enum(["vi", "en", "multi"]),
    consent: z.unknown().optional(),
    activeVersion: z.number().int().min(1),
  }),
  samples: z.array(z.object({
    version: z.number().int().min(1),
    filename: z.string().min(1),
    durationMs: z.number().int().min(0),
    sampleRate: z.number().int().min(1),
    qualityScore: z.number().int(),
    qualityDetail: z.unknown().optional(),
    notes: z.string().nullish(),
  })),
})
type Manifest = z.infer<typeof manifestSchema>

interface Parsed { zip: JSZip; manifest: Manifest }
type Phase = "idle" | "ready" | "importing" | "done"

export function ImportWizard() {
  const t = useTranslations("voices")
  const router = useRouter()

  const [phase, setPhase] = useState<Phase>("idle")
  const [dragging, setDragging] = useState(false)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const importProfile = trpc.voiceProfile.importProfile.useMutation()
  const requestUploadUrl = trpc.voiceProfile.requestUploadUrl.useMutation()
  const importSample = trpc.voiceProfile.importSample.useMutation()
  const setActiveVersion = trpc.voiceProfile.setActiveVersion.useMutation()

  const loadFile = async (file: File) => {
    setError(null)
    try {
      const zip = await JSZip.loadAsync(file)
      const manifestFile = zip.file("profile.json")
      if (!manifestFile) throw new Error("no-manifest")
      const manifest = manifestSchema.parse(JSON.parse(await manifestFile.async("string")))

      if (manifest.samples.length > MAX_SAMPLES) {
        setError(t("importTooManySamples"))
        return
      }
      for (const s of manifest.samples) {
        const ext = s.filename.split(".").pop()?.toLowerCase() ?? ""
        if (!EXT_MIME[ext]) {
          setError(t("importUnsupportedSample"))
          return
        }
      }

      setParsed({ zip, manifest })
      setName(manifest.profile.name)
      setPhase("ready")
    } catch {
      setError(t("importInvalidZip"))
    }
  }

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  const runImport = async () => {
    if (!parsed) return
    const { zip, manifest } = parsed
    setError(null)
    setPhase("importing")
    setProgress({ done: 0, total: manifest.samples.length })

    try {
      const consentText =
        (manifest.profile.consent as { text?: string } | undefined)?.text ??
        "Consent carried over from an imported training profile export."

      const profile = await importProfile.mutateAsync({
        name: name.trim() || manifest.profile.name,
        lang: manifest.profile.lang,
        consentText,
      })

      for (let i = 0; i < manifest.samples.length; i++) {
        const sample = manifest.samples[i]!
        const ext = sample.filename.split(".").pop()!.toLowerCase()
        const contentType = EXT_MIME[ext]!

        const entry = zip.file(`samples/${sample.filename}`)
        if (!entry) throw new Error(`missing ${sample.filename}`)
        const bytes = await entry.async("arraybuffer")
        if (bytes.byteLength > MAX_SAMPLE_BYTES) throw new Error("sample too large")

        const { uploadUrl, storageKey } = await requestUploadUrl.mutateAsync({
          profileId: profile.id,
          filename: sample.filename,
          contentType,
          contentLength: bytes.byteLength,
        })

        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: new Blob([bytes], { type: contentType }),
        })
        if (!put.ok) throw new Error(`upload failed ${put.status}`)

        await importSample.mutateAsync({
          profileId: profile.id,
          version: sample.version,
          storageKey,
          durationMs: sample.durationMs,
          sampleRate: sample.sampleRate,
          qualityScore: sample.qualityScore,
          qualityDetail: sample.qualityDetail,
          notes: sample.notes ?? undefined,
        })

        setProgress({ done: i + 1, total: manifest.samples.length })
      }

      const hasActive = manifest.samples.some((s) => s.version === manifest.profile.activeVersion)
      if (hasActive) {
        await setActiveVersion.mutateAsync({
          profileId: profile.id,
          version: manifest.profile.activeVersion,
        })
      }

      setPhase("done")
      router.refresh()
    } catch {
      setError(t("importFailed"))
      setPhase("ready")
    }
  }

  if (phase === "done") {
    return (
      <div
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-8 text-center"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircleIcon size={24} style={{ color: "var(--color-success)" }} />
        </div>
        <h2 className="text-display-card mb-2">{t("importDone")}</h2>
        <p className="text-body text-[var(--color-text-secondary)] mb-6">{t("importDoneDesc")}</p>
        <button
          onClick={() => router.push("/voices")}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90 transition-opacity"
        >
          {t("allProfiles")}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
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
          accept=".zip,application/zip"
          onChange={onFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label={t("importDropZip")}
        />
        <UploadCloudIcon size={32} className="mx-auto mb-3 text-[var(--color-text-muted)]" />
        <p className="text-body-med">{t("importDropZip")}</p>
        <p className="text-caption text-[var(--color-text-muted)] mt-1">{t("importDropHint")}</p>
      </div>

      {error && <p className="text-caption text-[var(--color-danger)]">{error}</p>}

      {parsed && (
        <div
          className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6 space-y-4"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <div>
            <label htmlFor="import-name" className="block text-caption mb-1.5">{t("importNameLabel")}</label>
            <input
              id="import-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={phase === "importing"}
              className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
            />
          </div>
          <p className="text-caption text-[var(--color-text-muted)]">
            {parsed.manifest.profile.lang.toUpperCase()} · {t("samplesCount", { count: parsed.manifest.samples.length })}
          </p>

          <button
            onClick={runImport}
            disabled={phase === "importing"}
            className="h-10 px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {phase === "importing"
              ? t("importProgress", { done: progress.done, total: progress.total })
              : t("importStart")}
          </button>
        </div>
      )}
    </div>
  )
}
