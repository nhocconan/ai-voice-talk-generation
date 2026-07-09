import { z } from "zod"
import { router, adminProcedure, superAdminProcedure } from "@/server/trpc"
import { ModelKind, Prisma, Role } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { encryptApiKey, decryptApiKey, normalizeApiKey } from "@/server/services/crypto"
import { fetchProviderCatalog } from "@/server/services/provider-models"
import { getRecaptchaAdminView, saveRecaptchaConfig } from "@/server/services/recaptcha"
import {
  generatePkce,
  startDeviceAuth,
  pollToken,
  storeTokens,
  stashVerifier,
  takeVerifier,
  clearVerifier,
  clearTokens,
  importRefreshTokenForProvider,
} from "@/server/services/xai-oauth"

const settingValueSchema = z.union([
  z.number().int().min(0),
  z.string(),
  z.boolean(),
])

function validateSettingInput(key: string, value: unknown) {
  switch (key) {
    case "retention.renderDays": {
      return z.number().int().min(1).parse(value)
    }
    case "quota.defaultMinutes": {
      return z.number().int().min(0).parse(value)
    }
    case "generation.maxMinutes": {
      return z.number().int().min(1).parse(value)
    }
    case "branding.accentHex": {
      return z.string().regex(/^#[0-9A-F]{6}$/).parse(String(value).toUpperCase())
    }
    case "webhook.url": {
      const val = String(value)
      if (val && !val.startsWith("https://")) throw new TRPCError({ code: "BAD_REQUEST", message: "Webhook URL must start with https://" })
      return val
    }
    case "feature.publicShareLinks":
    case "feature.orgSharedLibrary": {
      return z.boolean().parse(value)
    }
    default:
      throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported setting key: ${key}` })
  }
}

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
      apiKeyEnc: p.apiKeyEnc ? "encrypted" : null,
      apiKeyLast4:
        p.apiKeyEnc && p.config && typeof p.config === "object" && !Array.isArray(p.config)
          ? (p.config as Record<string, unknown>)["apiKeyLast4"] ?? null
          : null,
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
      const existing = await ctx.db.providerConfig.findUnique({
        where: { id },
        select: { config: true },
      })
      const currentConfig =
        existing?.config && typeof existing.config === "object" && !Array.isArray(existing.config)
          ? { ...(existing.config as Record<string, unknown>) }
          : {}

      if (apiKey !== undefined) {
        const normalizedApiKey = normalizeApiKey(apiKey)
        data.apiKeyEnc = normalizedApiKey ? await encryptApiKey(normalizedApiKey) : null
        if (normalizedApiKey) {
          currentConfig["apiKeyLast4"] = normalizedApiKey.slice(-4)
        } else {
          delete currentConfig["apiKeyLast4"]
        }
      }
      if (rest.enabled !== undefined) data.enabled = rest.enabled
      if (rest.isDefault !== undefined) data.isDefault = rest.isDefault
      if (rest.config !== undefined) {
        data.config = {
          ...currentConfig,
          ...rest.config,
        } as Prisma.InputJsonValue
      } else if (apiKey !== undefined) {
        data.config = currentConfig as Prisma.InputJsonValue
      }

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

  // Provider model catalog (P5-01 — administrators can pull the latest model
  // list from each provider's API and edit/curate inline).
  listProviderModels: adminProcedure
    .input(z.object({ providerId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.providerModel.findMany({
        where: input.providerId ? { providerId: input.providerId } : {},
        orderBy: [{ providerId: "asc" }, { isDefault: "desc" }, { modelId: "asc" }],
        include: { provider: { select: { name: true } } },
      })
    }),

  fetchProviderModels: superAdminProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const provider = await ctx.db.providerConfig.findUniqueOrThrow({
        where: { id: input.providerId },
      })
      const apiKey = provider.apiKeyEnc ? await decryptApiKey(provider.apiKeyEnc) : null
      const providerConfig =
        provider.config && typeof provider.config === "object" && !Array.isArray(provider.config)
          ? (provider.config as Record<string, unknown>)
          : {}
      const result = await fetchProviderCatalog(provider.name, apiKey, providerConfig)

      const now = new Date()
      for (const m of result.models) {
        await ctx.db.providerModel.upsert({
          where: { providerId_modelId: { providerId: provider.id, modelId: m.modelId } },
          create: {
            providerId: provider.id,
            modelId: m.modelId,
            displayName: m.displayName,
            kind: m.kind,
            languages: m.languages,
            meta: (m.meta ?? {}) as Prisma.InputJsonValue,
            lastSyncedAt: now,
          },
          update: {
            displayName: m.displayName,
            kind: m.kind,
            languages: m.languages,
            meta: (m.meta ?? {}) as Prisma.InputJsonValue,
            lastSyncedAt: now,
          },
        })
      }

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.fetchProviderModels",
        targetType: "ProviderConfig",
        targetId: provider.id,
        meta: { source: result.source, count: result.models.length },
      })

      return { count: result.models.length, source: result.source }
    }),

  updateProviderModel: superAdminProcedure
    .input(z.object({
      id: z.string(),
      displayName: z.string().min(1).optional(),
      kind: z.nativeEnum(ModelKind).optional(),
      languages: z.array(z.string()).optional(),
      enabled: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, isDefault, displayName, kind, languages, enabled } = input
      const current = await ctx.db.providerModel.findUniqueOrThrow({ where: { id } })

      if (isDefault) {
        await ctx.db.providerModel.updateMany({
          where: { providerId: current.providerId, id: { not: id } },
          data: { isDefault: false },
        })
      }

      const data: Prisma.ProviderModelUpdateInput = {}
      if (displayName !== undefined) data.displayName = displayName
      if (kind !== undefined) data.kind = kind
      if (languages !== undefined) data.languages = languages
      if (enabled !== undefined) data.enabled = enabled
      if (isDefault !== undefined) data.isDefault = isDefault

      await ctx.db.providerModel.update({ where: { id }, data })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.updateProviderModel",
        targetType: "ProviderModel",
        targetId: id,
        meta: input as Prisma.InputJsonValue,
      })
    }),

  deleteProviderModel: superAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.providerModel.delete({ where: { id: input.id } })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.deleteProviderModel",
        targetType: "ProviderModel",
        targetId: input.id,
      })
    }),

  // SuperGrok / X Premium+ OAuth (GROK_OAUTH provider) — device-code flow.
  // startXaiOAuth kicks off a device authorization and stashes the PKCE verifier
  // server-side keyed by device_code; pollXaiOAuth polls until the user approves
  // and then stores the encrypted tokens into the GROK_OAUTH ProviderConfig.
  startXaiOAuth: superAdminProcedure.mutation(async ({ ctx }) => {
    const { verifier, challenge } = generatePkce()
    const device = await startDeviceAuth(challenge)
    stashVerifier(device.device_code, verifier, device.expires_in ?? 600)
    await ctx.audit({
      actorId: ctx.session.user.id,
      action: "admin.startXaiOAuth",
      targetType: "ProviderConfig",
      targetId: "GROK_OAUTH",
    })
    return {
      deviceCode: device.device_code,
      userCode: device.user_code,
      verificationUri: device.verification_uri,
      verificationUriComplete: device.verification_uri_complete ?? device.verification_uri,
      interval: device.interval ?? 5,
      expiresIn: device.expires_in ?? 600,
    }
  }),

  pollXaiOAuth: superAdminProcedure
    .input(z.object({ deviceCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const verifier = takeVerifier(input.deviceCode)
      if (!verifier) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Device code expired. Start again." })
      }
      const result = await pollToken(input.deviceCode, verifier)
      if ("pending" in result) return { connected: false }

      const provider = await ctx.db.providerConfig.findUniqueOrThrow({
        where: { name: "GROK_OAUTH" },
      })
      await storeTokens(provider.id, result)
      clearVerifier(input.deviceCode)
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.connectXaiOAuth",
        targetType: "ProviderConfig",
        targetId: provider.id,
      })
      return { connected: true }
    }),

  // Import an existing SuperGrok token (raw refresh_token or a Hermes/OpenClaw
  // JSON config). Validated with one live refresh before storing.
  importXaiOAuthToken: superAdminProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const provider = await ctx.db.providerConfig.findUniqueOrThrow({
        where: { name: "GROK_OAUTH" },
      })
      try {
        await importRefreshTokenForProvider(provider.id, input.token)
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Could not import token: ${String(e)}` })
      }
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.importXaiOAuthToken",
        targetType: "ProviderConfig",
        targetId: provider.id,
      })
      return { connected: true }
    }),

  disconnectXaiOAuth: superAdminProcedure.mutation(async ({ ctx }) => {
    const provider = await ctx.db.providerConfig.findUniqueOrThrow({
      where: { name: "GROK_OAUTH" },
    })
    await clearTokens(provider.id)
    await ctx.audit({
      actorId: ctx.session.user.id,
      action: "admin.disconnectXaiOAuth",
      targetType: "ProviderConfig",
      targetId: provider.id,
    })
    return { connected: false }
  }),

  // Audit log
  auditLog: adminProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().max(100).default(50),
      actor: z.string().optional(),
      actorId: z.string().optional(),
      action: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const where = {
        ...(input.actor && {
          actor: {
            is: {
              OR: [
                { email: { contains: input.actor, mode: "insensitive" as const } },
                { name: { contains: input.actor, mode: "insensitive" as const } },
              ],
            },
          },
        }),
        ...(input.actorId && { actorId: input.actorId }),
        ...(input.action && { action: { contains: input.action, mode: "insensitive" as const } }),
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
    .input(z.object({ key: z.string(), value: settingValueSchema.or(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const validatedValue = validateSettingInput(input.key, input.value)
      await ctx.db.setting.upsert({
        where: { key: input.key },
        update: { value: validatedValue as Prisma.InputJsonValue },
        create: { key: input.key, value: validatedValue as Prisma.InputJsonValue },
      })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.updateSetting",
        targetType: "Setting",
        targetId: input.key,
        meta: { value: validatedValue } as Prisma.InputJsonValue,
      })
    }),

  // reCAPTCHA (login protection) — configured here, not via env.
  getRecaptcha: adminProcedure.query(async () => {
    return getRecaptchaAdminView()
  }),

  updateRecaptcha: superAdminProcedure
    .input(z.object({
      enabled: z.boolean(),
      siteKey: z.string(),
      version: z.enum(["v2", "v3"]),
      minScore: z.number().min(0).max(1).optional(),
      secretKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await saveRecaptchaConfig(input)
      } catch (e) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "Failed to save reCAPTCHA" })
      }
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "admin.updateRecaptcha",
        targetType: "Setting",
        targetId: "security.recaptcha",
        meta: { enabled: input.enabled, version: input.version },
      })
      return { ok: true }
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
