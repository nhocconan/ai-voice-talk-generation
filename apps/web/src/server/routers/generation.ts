import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure, adminProcedure, publicProcedure } from "@/server/trpc"
import { enqueueRenderJob, enqueueAsrJob } from "@/server/queue/producers"
import { generatePresignedGetUrl, generatePresignedPutUrl } from "@/server/services/storage"
import { db } from "@/server/db/client"
import { GenKind, GenStatus } from "@prisma/client"
import { randomBytes, randomUUID } from "crypto"
import { checkFixedWindowLimit } from "@/server/services/rate-limit"

const INPUT_GENERATION_MINUTES_CAP = 12 * 60
// P3-08: 10 render starts per user per minute
const RENDER_RATE_LIMIT = 10
const RENDER_RATE_WINDOW_S = 60
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
  listAvailableProviders: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.providerConfig.findMany({
      where: { enabled: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        isDefault: true,
        config: true,
      },
    })
  }),

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
      estimatedMinutes: z.number().min(0.1).max(INPUT_GENERATION_MINUTES_CAP),
      providerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await enforceRenderRateLimit(ctx.session.user.id)
      await enforceQuota(ctx, input.estimatedMinutes)
      await enforceGenerationLimit(ctx.db, input.estimatedMinutes)
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
      estimatedMinutes: z.number().min(0.1).max(INPUT_GENERATION_MINUTES_CAP),
      pacingLock: z.boolean().default(false),
      providerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await enforceRenderRateLimit(ctx.session.user.id)
      await enforceQuota(ctx, input.estimatedMinutes)
      await enforceGenerationLimit(ctx.db, input.estimatedMinutes)
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
      const key = `uploads/sources/${ctx.session.user.id}/${randomUUID()}.${input.filename.split(".").pop() ?? "mp3"}`
      const url = await generatePresignedPutUrl(key, input.contentType, 3600)
      return { uploadUrl: url, storageKey: key }
    }),

  submitRevoice: protectedProcedure
    .input(z.object({
      sourceAudioKey: z.string(),
      speakers: z.array(speakerSchema).min(1).max(2),
      estimatedMinutes: z.number().min(0.1).max(INPUT_GENERATION_MINUTES_CAP),
      pacingLock: z.boolean().default(false),
      providerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await enforceRenderRateLimit(ctx.session.user.id)
      await enforceQuota(ctx, input.estimatedMinutes)
      await enforceGenerationLimit(ctx.db, input.estimatedMinutes)
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

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "generation.submitAsr",
        targetType: "Generation",
        targetId: generation.id,
        meta: { expectedSpeakers: input.expectedSpeakers },
        ip: ctx.ip,
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
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "generation.cancel",
        targetType: "Generation",
        targetId: input.id,
        ip: ctx.ip,
      })
    }),

  // P4-03: Public share links
  createShareLink: protectedProcedure
    .input(z.object({
      id: z.string(),
      expiresInDays: z.number().int().min(1).max(365).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const gen = await ctx.db.generation.findUniqueOrThrow({ where: { id: input.id } })
      if (gen.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })
      if (gen.status !== GenStatus.DONE) throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed generations can be shared" })

      // Feature flag check
      const flag = await ctx.db.setting.findUnique({ where: { key: "feature.publicShareLinks" } })
      if (!flag?.value) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Public share links are not enabled" })

      const shareToken = randomBytes(32).toString("hex")
      const shareExpiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)

      await ctx.db.generation.update({
        where: { id: input.id },
        data: { shareToken, shareExpiresAt },
      })

      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.createShareLink", targetType: "Generation", targetId: input.id, meta: { expiresInDays: input.expiresInDays } })

      return { shareToken, shareExpiresAt }
    }),

  revokeShareLink: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const gen = await ctx.db.generation.findUniqueOrThrow({ where: { id: input.id } })
      if (gen.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })

      await ctx.db.generation.update({ where: { id: input.id }, data: { shareToken: null, shareExpiresAt: null } })
      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.revokeShareLink", targetType: "Generation", targetId: input.id })
    }),

  // Public — no auth required
  getByShareToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const gen = await ctx.db.generation.findUnique({
        where: { shareToken: input.token },
        include: { provider: { select: { name: true } } },
      })
      if (!gen) throw new TRPCError({ code: "NOT_FOUND" })
      if (gen.shareExpiresAt && gen.shareExpiresAt < new Date()) throw new TRPCError({ code: "FORBIDDEN", message: "Share link has expired" })
      if (gen.status !== GenStatus.DONE) throw new TRPCError({ code: "BAD_REQUEST", message: "Not ready" })

      const [mp3Url, wavUrl] = await Promise.all([
        gen.outputMp3Key ? generatePresignedGetUrl(gen.outputMp3Key, 3600) : null,
        gen.outputWavKey ? generatePresignedGetUrl(gen.outputWavKey, 3600) : null,
      ])

      return {
        id: gen.id,
        kind: gen.kind,
        durationMs: gen.durationMs,
        finishedAt: gen.finishedAt,
        mp3Url,
        wavUrl,
      }
    }),

  // Admin delete
  adminDelete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.generation.delete({ where: { id: input.id } })
      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.delete", targetType: "Generation", targetId: input.id })
    }),

  // P3-01: Draft script via Gemini
  draftScript: protectedProcedure
    .input(z.object({
      topic: z.string().min(3).max(500),
      minutes: z.number().min(0.5).max(30),
      tone: z.enum(["professional", "conversational", "educational", "storytelling"]).default("professional"),
      lang: z.enum(["vi", "en"]).default("vi"),
    }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env["GOOGLE_API_KEY"]
      if (!apiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gemini API key not configured" })
      }

      const wordCount = Math.round(input.minutes * 130)
      const toneMap = {
        professional: "professional and clear",
        conversational: "conversational and friendly",
        educational: "educational and informative",
        storytelling: "engaging and narrative",
      }

      const prompt = input.lang === "vi"
        ? `Viết một kịch bản thuyết trình bằng tiếng Việt về chủ đề: "${input.topic}". Giọng điệu ${toneMap[input.tone]}. Độ dài khoảng ${wordCount} từ (tương đương ${input.minutes} phút khi đọc). Chỉ trả về văn bản kịch bản, không có tiêu đề hay chú thích.`
        : `Write a presentation script in English on the topic: "${input.topic}". Tone: ${toneMap[input.tone]}. Length: approximately ${wordCount} words (equivalent to ${input.minutes} minutes when read aloud). Return only the script text, no headings or annotations.`

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          }),
        },
      )

      if (!resp.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gemini API error" })
      }

      const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
      if (!text) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Empty response from Gemini" })

      await ctx.audit({ actorId: ctx.session.user.id, action: "generation.draftScript", targetType: "User", targetId: ctx.session.user.id, meta: { topic: input.topic, minutes: input.minutes } })

      return { script: text.trim() }
    }),

  // Flow 5.2: 15-second preview before full render
  previewPresentation: protectedProcedure
    .input(z.object({
      profileId: z.string(),
      script: z.string().min(10),
      providerId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertProfilesReady(ctx.db, [input.profileId])
      const providerId = await resolveProvider(ctx, input.providerId)

      const workerUrl = process.env["WORKER_URL"] ?? "http://localhost:8001"
      const resp = await fetch(`${workerUrl}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: providerId,
          profile_id: input.profileId,
          script: input.script,
          max_chars: 250,
        }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Worker error" })) as { error?: string }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.error ?? "Preview failed" })
      }

      const data = await resp.json() as { url: string; key: string }
      return { previewUrl: data.url }
    }),

  // FR-14: Convert plain transcript to timed script via Gemini
  transcriptToTimedScript: protectedProcedure
    .input(z.object({
      transcript: z.string().min(10).max(20000),
      speakerA: z.string().default("Speaker A"),
      speakerB: z.string().default("Speaker B"),
      lang: z.enum(["vi", "en"]).default("vi"),
    }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env["GOOGLE_API_KEY"]
      if (!apiKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gemini API key not configured" })
      }

      const prompt = input.lang === "vi"
        ? `Bạn nhận được một bản ghi cuộc trò chuyện giữa hai người (${input.speakerA} và ${input.speakerB}).
Chuyển đổi thành kịch bản podcast có định dạng thời gian với ký hiệu "[MM:SS A]" và "[MM:SS B]".
Ước tính thời gian đọc mỗi đoạn (150 từ/phút). Chỉ trả về kịch bản đã định dạng.
Bản ghi:
${input.transcript}`
        : `You are given a conversation transcript between two speakers (${input.speakerA} and ${input.speakerB}).
Convert it into a timed podcast script using "[MM:SS A]" and "[MM:SS B]" markers.
Estimate reading time per segment (150 wpm). Return only the formatted script.
Transcript:
${input.transcript}`

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
          }),
        },
      )

      if (!resp.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gemini API error" })
      }

      const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
      if (!text) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Empty response from Gemini" })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "generation.transcriptToTimedScript",
        targetType: "User",
        targetId: ctx.session.user.id,
      })

      return { timedScript: text.trim() }
    }),
})

async function enforceRenderRateLimit(userId: string): Promise<void> {
  const result = await checkFixedWindowLimit("render", userId, RENDER_RATE_LIMIT, RENDER_RATE_WINDOW_S)
  if (!result.allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Rate limit: max ${RENDER_RATE_LIMIT} renders per minute` })
  }
}

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

async function enforceGenerationLimit(
  prisma: typeof db,
  estimatedMinutes: number,
): Promise<void> {
  const setting = await prisma.setting.findUnique({
    where: { key: "generation.maxMinutes" },
    select: { value: true },
  })
  const maxMinutes = typeof setting?.value === "number" ? setting.value : 60

  if (estimatedMinutes > maxMinutes) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Generation length exceeds the configured limit of ${maxMinutes} minutes`,
    })
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
