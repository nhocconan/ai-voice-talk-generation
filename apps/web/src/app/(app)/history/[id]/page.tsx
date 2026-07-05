import type { Metadata } from "next"
import { auth } from "@/server/auth"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { GenerationDetail } from "@/components/features/generate/GenerationDetail"

export const metadata: Metadata = { title: "Generation Detail — Voice Studio" }

export default async function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params

  const t = await getTranslations("history")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">{t("detailPageTitle")}</h1>
        <p className="mt-1 text-body text-[var(--color-text-secondary)]">
          {t("detailPageSubtitle")}
        </p>
      </div>
      <GenerationDetail generationId={id} />
    </div>
  )
}
