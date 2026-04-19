"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { trpc } from "@/lib/trpc/client"
import { ProfileSelector } from "./ProfileSelector"
import { GenerationProgress } from "./GenerationProgress"

const schema = z.object({
  profileId: z.string().min(1, "Select a voice profile"),
  script: z.string().min(10, "Script too short").max(500000),
  estimatedMinutes: z.coerce.number().min(0.1).max(60),
})
type FormData = z.infer<typeof schema>

export function PresentationGenerator() {
  const router = useRouter()
  const [generationId, setGenerationId] = useState<string | null>(null)

  const create = trpc.generation.createPresentation.useMutation()
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { estimatedMinutes: 5 },
  })

  const profileId = watch("profileId")

  const onSubmit = async (data: FormData) => {
    const { generationId: id } = await create.mutateAsync(data)
    setGenerationId(id)
  }

  if (generationId) {
    return <GenerationProgress generationId={generationId} onDone={() => router.push(`/history/${generationId}`)} />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="space-y-5">
          <div>
            <label className="block text-caption mb-2">Voice Profile</label>
            <ProfileSelector
              selected={profileId}
              onSelect={(id) => setValue("profileId", id)}
            />
            {errors.profileId && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.profileId.message}</p>}
          </div>

          <div>
            <label htmlFor="estimatedMinutes" className="block text-caption mb-2">
              Target Length (minutes)
            </label>
            <input
              id="estimatedMinutes"
              type="number"
              step="0.5"
              min="0.5"
              max="60"
              {...register("estimatedMinutes")}
              className="w-32 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
            />
          </div>

          <div>
            <label htmlFor="script" className="block text-caption mb-2">Script</label>
            <textarea
              id="script"
              {...register("script")}
              rows={12}
              placeholder="Paste or type your script here…"
              className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui resize-y"
              style={{ minHeight: "240px" }}
            />
            {errors.script && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.script.message}</p>}
          </div>
        </div>
      </div>

      {create.error && (
        <p className="text-body-ui text-[var(--color-danger)]">{create.error.message}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={create.isPending}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50 hover:opacity-90"
        >
          {create.isPending ? "Queueing…" : "Generate Audio"}
        </button>
      </div>
    </form>
  )
}
