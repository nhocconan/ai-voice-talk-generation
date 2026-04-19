import { z } from "zod"
import { router, adminProcedure, superAdminProcedure } from "@/server/trpc"
import { Prisma, Role } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { encryptApiKey } from "@/server/services/crypto"

export const adminRouter = router({
  // Users
  listUsers: adminProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().max(100).default(50), search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const where = input.search
        ? { OR: [{ email: { contains: input.search } }, { name: { contains: input.search } }] }
        : {}
      const [users, total] = await Promise.all([
        ctx.db.user.findMany({
          where,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          select: { id: true, email: true, name: true, role: true, active: true, quotaMinutes: true, usedMinutes: true, lastLoginAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        ctx.db.user.count({ where }),
      ])
      return { users, total }
    }),

  updateUser: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      role: z.nativeEnum(Role).optional(),
      quotaMinutes: z.number().min(0).optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const updateData: {
        name?: string
        role?: Role
        quotaMinutes?: number
        active?: boolean
      } = {}

      if (data.name !== undefined) updateData.name = data.name
      if (data.role !== undefined) updateData.role = data.role
      if (data.quotaMinutes !== undefined) updateData.quotaMinutes = data.quotaMinutes
      if (data.active !== undefined) updateData.active = data.active

      // Prevent non-super-admin from promoting to SUPER_ADMIN
      if (data.role === Role.SUPER_ADMIN && ctx.session.user.role !== "SUPER_ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only super admins can grant super admin role" })
      }

      const updated = await ctx.db.user.update({ where: { id }, data: updateData })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.updateUser",
        targetType: "User",
        targetId: id,
        meta: updateData,
      })
      return updated
    }),

  // Providers
  listProviders: adminProcedure.query(async ({ ctx }) => {
    const providers = await ctx.db.providerConfig.findMany({ orderBy: { name: "asc" } })
    return providers.map((p) => ({
      ...p,
      // Never expose full API key
      apiKeyEnc: p.apiKeyEnc ? "encrypted" : null,
      apiKeyPreview: p.apiKeyEnc ? `••••${p.apiKeyEnc.slice(-4)}` : null,
    }))
  }),

  updateProvider: superAdminProcedure
    .input(z.object({
      id: z.string(),
      apiKey: z.string().optional(),
      enabled: z.boolean().optional(),
      isDefault: z.boolean().optional(),
      config: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, apiKey, ...rest } = input
      const data: Prisma.ProviderConfigUpdateInput = {}

      if (apiKey !== undefined) {
        data.apiKeyEnc = apiKey ? encryptApiKey(apiKey) : null
      }
      if (rest.enabled !== undefined) data.enabled = rest.enabled
      if (rest.isDefault !== undefined) data.isDefault = rest.isDefault
      if (rest.config !== undefined) data.config = rest.config as Prisma.InputJsonValue

      if (rest.isDefault) {
        // Only one can be default
        await ctx.db.providerConfig.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
      }

      await ctx.db.providerConfig.update({ where: { id }, data })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.updateProvider",
        targetType: "ProviderConfig",
        targetId: id,
        meta: { ...rest, apiKeyChanged: apiKey !== undefined } as Prisma.InputJsonValue,
      })
    }),

  // Audit log
  auditLog: adminProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().max(100).default(50),
      actorId: z.string().optional(),
      action: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        ...(input.actorId && { actorId: input.actorId }),
        ...(input.action && { action: { contains: input.action } }),
        ...((input.from ?? input.to) && {
          createdAt: {
            ...(input.from && { gte: input.from }),
            ...(input.to && { lte: input.to }),
          },
        }),
      }

      const [logs, total] = await Promise.all([
        ctx.db.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          include: { actor: { select: { name: true, email: true } } },
        }),
        ctx.db.auditLog.count({ where }),
      ])

      return { logs, total }
    }),

  // Storage stats
  storageStats: adminProcedure.query(async ({ ctx }) => {
    const [sampleCount, genCount, totalGens] = await Promise.all([
      ctx.db.voiceSample.count(),
      ctx.db.generation.count({ where: { status: "DONE", outputMp3Key: { not: null } } }),
      ctx.db.generation.count(),
    ])
    return { sampleCount, completedGenerations: genCount, totalGenerations: totalGens }
  }),

  // Settings
  getSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.setting.findMany()
    return Object.fromEntries(settings.map((s) => [s.key, s.value]))
  }),

  updateSetting: superAdminProcedure
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.setting.upsert({
        where: { key: input.key },
        update: { value: input.value as Prisma.InputJsonValue },
        create: { key: input.key, value: input.value as Prisma.InputJsonValue },
      })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.updateSetting",
        targetType: "Setting",
        targetId: input.key,
        meta: { value: input.value } as Prisma.InputJsonValue,
      })
    }),

  // Generation library
  listAllGenerations: adminProcedure
    .input(z.object({ page: z.number().default(1), pageSize: z.number().max(100).default(50), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const where = input.status ? { status: input.status as import("@prisma/client").GenStatus } : {}
      const [items, total] = await Promise.all([
        ctx.db.generation.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          include: {
            user: { select: { name: true, email: true } },
            provider: { select: { name: true } },
          },
        }),
        ctx.db.generation.count({ where }),
      ])
      return { items, total }
    }),
})
