import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure, adminProcedure } from "@/server/trpc"
import { enqueueRenderJob, enqueueAsrJob } from "@/server/queue/producers"
import { generatePresignedGetUrl, generatePresignedPutUrl } from "@/server/services/storage"
import { db } from "@/server/db/client"
import { GenKind, GenStatus } from "@prisma/client"
import crypto from "crypto"

const MAX_GENERATION_MINUTES = 60
const ALLOWED_SOURCE_MIMES = ["audio/mpeg", "audio/mp4", "audio/x-m4a"]

const segmentSchema = z.object({
  startMs: z.number().min(0),
  endMs: z.number().min(0),
  text: z.string(),
})

const speakerSchema = z.object({
  label: z.enum(["A", "B"]),
  profileId: z.string(),
  segments: z.array(segmentSchema),
})

export const generationRouter = router({
  list: protectedProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const role = ctx.session.user.role as string
      const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN"

      const where = isAdmin ? {} : { userId }

      const [items, total] = await Promise.all([
        ctx.db.generation.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          include: {
            provider: { select: { name: true } },
            speakers: { include: { profile: { select: { name: true } } } },
          },
        }),
        ctx.db.generation.count({ where }),
      ])

      return { items, total, page: input.page, pageSize: input.pageSize }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const gen = await ctx.db.generation.findUniqueOrThrow({
        where: { id: input.id },
        include: { provider: true, speakers: { include: { profile: true } } },
      })
      const role = ctx.session.user.role as string
      const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN"
      if (!isAdmin && gen.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })
      return gen
    }),

  // Check & enforce quota
  createPresentation: protectedProcedure
    .input(z.object({
      profileId: z.string(),
      script: z.string().min(10),
      estimatedMinutes: z.number().min(0.1).max(MAX_GENERATION_MINUTES),
      providerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await enforceQuota(ctx, input.estimatedMinutes)
      await assertProfilesReady(ctx.db, [input.profileId])

      const providerId = await resolveProvider(ctx, input.providerId)

      const generation = await ctx.db.generation.create({
        data: {
          userId: ctx.session.user.id,
          kind: GenKind.PRESENTATION,
          status: GenStatus.QUEUED,
          providerId,
          inputScript: input.script,
          speakers: {
            create: [{
              label: "A",
              profileId: input.profileId,
              segments: [],
            }],
          },
        },
      })

      await enqueueRenderJob({
        generationId: generation.id,
        providerId,
        kind: "PRESENTATION",
        speakers: [{ label: "A", profileId: input.profileId, segments: [], script: input.script }],
        output: { mp3: true, wav: true, chapters: false },
        pacingLock: false,
      })

      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.create", targetType: "Generation", targetId: generation.id, meta: { kind: "PRESENTATION" } })

      return { generationId: generation.id }
    }),

  createPodcast: protectedProcedure
    .input(z.object({
      speakers: z.array(speakerSchema).min(1).max(2),
      estimatedMinutes: z.number().min(0.1).max(MAX_GENERATION_MINUTES),
      pacingLock: z.boolean().default(false),
      providerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await enforceQuota(ctx, input.estimatedMinutes)
      await assertProfilesReady(ctx.db, input.speakers.map((speaker) => speaker.profileId))
      const providerId = await resolveProvider(ctx, input.providerId)

      const script = input.speakers
        .flatMap((s) => s.segments)
        .sort((a, b) => a.startMs - b.startMs)
        .map((seg) => {
          const spk = input.speakers.find((s) => s.segments.includes(seg))
          return `[${formatMs(seg.startMs)} ${spk?.label ?? "A"}] ${seg.text}`
        })
        .join("\n")

      const generation = await ctx.db.generation.create({
        data: {
          userId: ctx.session.user.id,
          kind: GenKind.PODCAST,
          status: GenStatus.QUEUED,
          providerId,
          inputScript: script,
          speakers: {
            create: input.speakers.map((s) => ({
              label: s.label,
              profileId: s.profileId,
              segments: s.segments,
            })),
          },
        },
      })

      await enqueueRenderJob({
        generationId: generation.id,
        providerId,
        kind: "PODCAST",
        speakers: input.speakers,
        output: { mp3: true, wav: true, chapters: true },
        pacingLock: input.pacingLock,
      })

      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.create", targetType: "Generation", targetId: generation.id, meta: { kind: "PODCAST" } })

      return { generationId: generation.id }
    }),

  // Request upload URL for source audio (re-voice)
  requestSourceUploadUrl: protectedProcedure
    .input(z.object({ filename: z.string(), contentType: z.string(), contentLength: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_SOURCE_MIMES.includes(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported audio type" })
      }
      const key = `uploads/sources/${ctx.session.user.id}/${crypto.randomUUID()}.${input.filename.split(".").pop() ?? "mp3"}`
      const url = await generatePresignedPutUrl(key, input.contentType, 3600)
      return { uploadUrl: url, storageKey: key }
    }),

  submitRevoice: protectedProcedure
    .input(z.object({
      sourceAudioKey: z.string(),
      speakers: z.array(speakerSchema).min(1).max(2),
      estimatedMinutes: z.number().min(0.1).max(MAX_GENERATION_MINUTES),
      pacingLock: z.boolean().default(false),
      providerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await enforceQuota(ctx, input.estimatedMinutes)
      await assertProfilesReady(ctx.db, input.speakers.map((speaker) => speaker.profileId))
      const providerId = await resolveProvider(ctx, input.providerId)

      const generation = await ctx.db.generation.create({
        data: {
          userId: ctx.session.user.id,
          kind: GenKind.REVOICE,
          status: GenStatus.QUEUED,
          providerId,
          sourceAudioKey: input.sourceAudioKey,
          speakers: {
            create: input.speakers.map((s) => ({
              label: s.label,
              profileId: s.profileId,
              segments: s.segments,
            })),
          },
        },
      })

      await enqueueRenderJob({
        generationId: generation.id,
        providerId,
        kind: "REVOICE",
        speakers: input.speakers,
        output: { mp3: true, wav: true, chapters: true },
        pacingLock: input.pacingLock,
      })

      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.create", targetType: "Generation", targetId: generation.id, meta: { kind: "REVOICE" } })

      return { generationId: generation.id }
    }),

  // Submit ASR job on uploaded audio
  submitAsr: protectedProcedure
    .input(z.object({ sourceAudioKey: z.string(), expectedSpeakers: z.number().min(1).max(2).default(2) }))
    .mutation(async ({ ctx, input }) => {
      const generation = await ctx.db.generation.create({
        data: {
          userId: ctx.session.user.id,
          kind: GenKind.REVOICE,
          status: GenStatus.QUEUED,
          providerId: await resolveProvider(ctx, undefined),
          sourceAudioKey: input.sourceAudioKey,
        },
      })

      await enqueueAsrJob({
        generationId: generation.id,
        sourceKey: input.sourceAudioKey,
        expectedSpeakers: input.expectedSpeakers,
      })

      return { generationId: generation.id }
    }),

  getDownloadUrls: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const gen = await ctx.db.generation.findUniqueOrThrow({ where: { id: input.id } })
      if (gen.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })
      if (gen.status !== GenStatus.DONE) throw new TRPCError({ code: "BAD_REQUEST", message: "Not ready" })

      const [mp3Url, wavUrl] = await Promise.all([
        gen.outputMp3Key ? generatePresignedGetUrl(gen.outputMp3Key, 3600) : null,
        gen.outputWavKey ? generatePresignedGetUrl(gen.outputWavKey, 3600) : null,
      ])

      return { mp3Url, wavUrl }
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const gen = await ctx.db.generation.findUniqueOrThrow({ where: { id: input.id } })
      if (gen.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })
      if (gen.status !== GenStatus.QUEUED) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot cancel" })

      await ctx.db.generation.update({ where: { id: input.id }, data: { status: GenStatus.CANCELLED } })
    }),

  // Admin delete
  adminDelete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.generation.delete({ where: { id: input.id } })
      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.delete", targetType: "Generation", targetId: input.id })
    }),
})

async function enforceQuota(
  ctx: { db: typeof db; session: { user: { id: string } } },
  estimatedMinutes: number,
): Promise<void> {
  const user = await ctx.db.user.findUniqueOrThrow({
    where: { id: ctx.session.user.id },
    select: { quotaMinutes: true, usedMinutes: true },
  })
  if (user.usedMinutes + estimatedMinutes > user.quotaMinutes) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Monthly quota exceeded (${user.usedMinutes}/${user.quotaMinutes} min used)` })
  }
}

async function resolveProvider(ctx: { db: typeof db }, providerId: string | undefined): Promise<string> {
  if (providerId) {
    const p = await ctx.db.providerConfig.findFirst({ where: { id: providerId, enabled: true } })
    if (!p) throw new TRPCError({ code: "BAD_REQUEST", message: "Provider not available" })
    return p.id
  }
  const defaultP = await ctx.db.providerConfig.findFirst({ where: { isDefault: true, enabled: true } })
  if (!defaultP) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No default provider configured" })
  return defaultP.id
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
  const seconds = (totalSeconds % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

async function assertProfilesReady(
  prisma: typeof db,
  profileIds: string[],
): Promise<void> {
  const uniqueProfileIds = [...new Set(profileIds)]
  const profiles = await prisma.voiceProfile.findMany({
    where: { id: { in: uniqueProfileIds } },
    select: {
      id: true,
      name: true,
      activeVersion: true,
      samples: {
        select: { version: true },
      },
    },
  })

  if (profiles.length !== uniqueProfileIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "One or more voice profiles were not found" })
  }

  const notReady = profiles.find((profile) => !profile.samples.some((sample) => sample.version === profile.activeVersion))
  if (notReady) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Voice profile "${notReady.name}" is still processing. Wait for its active sample to finish ingesting before rendering.`,
    })
  }
}
