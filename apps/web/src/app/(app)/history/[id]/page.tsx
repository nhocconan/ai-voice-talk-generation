import type { Metadata } from "next"
import { auth } from "@/server/auth"
import { redirect } from "next/navigation"
import { GenerationDetail } from "@/components/features/generate/GenerationDetail"

export const metadata: Metadata = { title: "Generation Detail — YouNet Voice Studio" }

export default async function GenerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-display-card">Generation Detail</h1>
        <p className="mt-1 text-body text-[var(--color-text-secondary)]">
          Inspect status, script, and downloads for one generation.
        </p>
      </div>
      <GenerationDetail generationId={id} />
    </div>
  )
}
