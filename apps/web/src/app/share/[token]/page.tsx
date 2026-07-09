import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { db } from "@/server/db/client"
import { GenStatus } from "@prisma/client"
import { generatePresignedGetUrl } from "@/server/services/storage"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Shared Audio — Voice Studio" }

interface Props {
  params: Promise<{ token: string }>
}

export default async function SharePage({ params }: Props) {
  const { token } = await params
  const t = await getTranslations("share")

  const gen = await db.generation.findUnique({ where: { shareToken: token } })

  if (!gen) return notFound()
  if (gen.shareExpiresAt && gen.shareExpiresAt < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-0)]">
        <div className="text-center space-y-2">
          <h1 className="text-display-card">{t("linkExpired")}</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            {t("linkExpiredDesc")}
          </p>
        </div>
      </div>
    )
  }
  if (gen.status !== GenStatus.DONE) return notFound()

  const [mp3Url, wavUrl, videoUrl] = await Promise.all([
    gen.outputMp3Key ? generatePresignedGetUrl(gen.outputMp3Key, 3600) : null,
    gen.outputWavKey ? generatePresignedGetUrl(gen.outputWavKey, 3600) : null,
    gen.outputVideoKey ? generatePresignedGetUrl(gen.outputVideoKey, 3600) : null,
  ])

  const kindLabel =
    gen.kind === "PRESENTATION" ? t("kindPresentation") : gen.kind === "PODCAST" ? t("kindPodcast") : t("kindRevoiced")
  const durationLabel = gen.durationMs ? t("secondsLabel", { seconds: Math.round(gen.durationMs / 1000) }) : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-0)] p-6">
      <div
        className="w-full max-w-lg bg-[var(--color-surface-1)] rounded-[var(--radius-card)] p-8 space-y-6"
        style={{ boxShadow: "var(--shadow-soft-lift)" }}
      >
        <div>
          <p className="text-caption text-[var(--color-text-muted)] uppercase tracking-wider">Voice Studio</p>
          <h1 className="mt-1 text-display-card">{kindLabel}</h1>
          {durationLabel && (
            <p className="mt-1 text-body text-[var(--color-text-secondary)]">{durationLabel}</p>
          )}
        </div>

        {videoUrl && (
          <div className="space-y-2">
            <p className="text-caption text-[var(--color-text-secondary)]">{t("videoPreview")}</p>
            <video controls className="w-full rounded-[var(--radius-md)]" src={videoUrl} />
          </div>
        )}

        {mp3Url && (
          <div className="space-y-2">
            <p className="text-caption text-[var(--color-text-secondary)]">{t("preview")}</p>
            <audio controls className="w-full" src={mp3Url} />
          </div>
        )}

        <div className="flex flex-col gap-3">
          {videoUrl && (
            <a
              href={videoUrl}
              download
              className="flex items-center justify-center h-10 px-6 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-2)] transition-colors"
            >
              {t("downloadVideo")}
            </a>
          )}
          {mp3Url && (
            <a
              href={mp3Url}
              download
              className="flex items-center justify-center h-10 px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90 transition-opacity"
            >
              {t("downloadMp3")}
            </a>
          )}
          {wavUrl && (
            <a
              href={wavUrl}
              download
              className="flex items-center justify-center h-10 px-6 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-2)] transition-colors"
            >
              {t("downloadWav")}
            </a>
          )}
        </div>

        <p className="text-micro text-[var(--color-text-muted)] text-center">
          {t("generatedBy")} ·{" "}
          {gen.shareExpiresAt
            ? t("linkExpires", { date: gen.shareExpiresAt.toLocaleDateString() })
            : t("noExpiry")}
        </p>
      </div>
    </div>
  )
}
