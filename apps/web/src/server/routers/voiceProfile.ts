import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure, adminProcedure } from "@/server/trpc"
import { generatePresignedPutUrl, generatePresignedGetUrl } from "@/server/services/storage"
import { enqueueIngestJob } from "@/server/queue/producers"
import crypto from "crypto"

const ALLOWED_AUDIO_MIMES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/flac", "audio/ogg", "audio/webm"]
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export const voiceProfileRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const role = ctx.session.user.role as string
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN"

    return ctx.db.voiceProfile.findMany({
      where: isAdmin ? {} : { OR: [{ ownerId: userId }, { isOrgShared: true }] },
      include: {
        owner: { select: { name: true, email: true } },
        samples: { select: { version: true, durationMs: true, qualityScore: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.db.voiceProfile.findUniqueOrThrow({
        where: { id: input.id },
        include: { samples: true, owner: { select: { name: true } } },
      })
      const userId = ctx.session.user.id
      const role = ctx.session.user.role as string
      const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN"

      if (!isAdmin && profile.ownerId !== userId && !profile.isOrgShared) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }
      return profile
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      lang: z.enum(["vi", "en", "multi"]),
      consentText: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.voiceProfile.create({
        data: {
          ownerId: ctx.session.user.id,
          name: input.name,
          lang: input.lang,
          consent: {
            signedAt: new Date().toISOString(),
            text: input.consentText,
            userId: ctx.session.user.id,
          },
        },
      })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "voiceProfile.create",
        targetType: "VoiceProfile",
        targetId: profile.id,
        ip: ctx.ip,
      })

      return profile
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.voiceProfile.findUniqueOrThrow({ where: { id: input.id } })
      const role = ctx.session.user.role as string
      const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN"

      if (profile.ownerId !== ctx.session.user.id && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }
      if (profile.isLocked && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Profile is locked — contact admin to delete" })
      }

      await ctx.db.voiceProfile.delete({ where: { id: input.id } })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "voiceProfile.delete",
        targetType: "VoiceProfile",
        targetId: input.id,
        ip: ctx.ip,
      })
    }),

  // Request a presigned PUT URL for sample upload
  requestUploadUrl: protectedProcedure
    .input(z.object({
      profileId: z.string(),
      filename: z.string(),
      contentType: z.string(),
      contentLength: z.number().max(MAX_UPLOAD_BYTES),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_AUDIO_MIMES.includes(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported file type" })
      }

      const profile = await ctx.db.voiceProfile.findUniqueOrThrow({ where: { id: input.profileId } })
      if (profile.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      const ext = input.filename.split(".").pop() ?? "audio"
      const key = `uploads/${input.profileId}/${crypto.randomUUID()}.${ext}`
      const url = await generatePresignedPutUrl(key, input.contentType, 3600)

      return { uploadUrl: url, storageKey: key }
    }),

  // After upload, enqueue ingest job
  submitSample: protectedProcedure
    .input(z.object({
      profileId: z.string(),
      storageKey: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.voiceProfile.findUniqueOrThrow({ where: { id: input.profileId } })
      if (profile.ownerId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" })
      }

      const nextVersion = profile.activeVersion + 1

      await enqueueIngestJob({
        profileId: input.profileId,
        storageKey: input.storageKey,
        version: nextVersion,
        userId: ctx.session.user.id,
        notes: input.notes,
      })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "voiceProfile.submitSample",
        targetType: "VoiceProfile",
        targetId: input.profileId,
        meta: { version: nextVersion },
        ip: ctx.ip,
      })

      return { version: nextVersion }
    }),

  setActiveVersion: protectedProcedure
    .input(z.object({ profileId: z.string(), version: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.voiceProfile.findUniqueOrThrow({ where: { id: input.profileId } })
      if (profile.ownerId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })

      const sample = await ctx.db.voiceSample.findUnique({
        where: { profileId_version: { profileId: input.profileId, version: input.version } },
      })
      if (!sample) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" })

      await ctx.db.voiceProfile.update({
        where: { id: input.profileId },
        data: { activeVersion: input.version },
      })
    }),

  getSampleDownloadUrl: protectedProcedure
    .input(z.object({ profileId: z.string(), version: z.number() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.db.voiceProfile.findUniqueOrThrow({ where: { id: input.profileId } })
      const role = ctx.session.user.role as string
      const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN"
      if (!isAdmin && profile.ownerId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })

      const sample = await ctx.db.voiceSample.findUniqueOrThrow({
        where: { profileId_version: { profileId: input.profileId, version: input.version } },
      })

      const url = await generatePresignedGetUrl(sample.storageKey, 300)
      return { url }
    }),

  // Admin actions
  setLocked: adminProcedure
    .input(z.object({ id: z.string(), locked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.voiceProfile.update({ where: { id: input.id }, data: { isLocked: input.locked } })
      await ctx.audit({ actorId: ctx.session.user.id, action: "voiceProfile.setLocked", targetType: "VoiceProfile", targetId: input.id, meta: { locked: input.locked } })
    }),

  setOrgShared: adminProcedure
    .input(z.object({ id: z.string(), shared: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.voiceProfile.update({ where: { id: input.id }, data: { isOrgShared: input.shared } })
      await ctx.audit({ actorId: ctx.session.user.id, action: "voiceProfile.setOrgShared", targetType: "VoiceProfile", targetId: input.id, meta: { shared: input.shared } })
    }),
})
