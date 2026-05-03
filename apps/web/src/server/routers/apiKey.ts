import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure } from "@/server/trpc"
import { randomBytes, createHash } from "crypto"

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export const apiKeyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.apiKey.findMany({
      where: { userId: ctx.session.user.id },
      select: { id: true, name: true, prefix: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(80),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const raw = `vk_${randomBytes(32).toString("hex")}`
      const keyHash = hashKey(raw)
      const prefix = raw.slice(0, 10)
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : null

      await ctx.db.apiKey.create({
        data: {
          userId: ctx.session.user.id,
          name: input.name,
          keyHash,
          prefix,
          ...(expiresAt ? { expiresAt } : {}),
        },
      })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "apiKey.create",
        targetType: "ApiKey",
        targetId: prefix,
        meta: { name: input.name },
      })

      // Return raw key once — never stored again
      return { key: raw, prefix }
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = await ctx.db.apiKey.findUnique({ where: { id: input.id } })
      if (!key) throw new TRPCError({ code: "NOT_FOUND" })
      if (key.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })

      await ctx.db.apiKey.delete({ where: { id: input.id } })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "apiKey.revoke",
        targetType: "ApiKey",
        targetId: input.id,
      })
    }),
})
