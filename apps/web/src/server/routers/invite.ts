import { z } from "zod"
import { TRPCError } from "@trpc/server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { router, adminProcedure, publicProcedure } from "@/server/trpc"
import { Role } from "@prisma/client"
import { sendInviteEmail } from "@/server/services/email"
import { env } from "@/env"

export const inviteRouter = router({
  create: adminProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.nativeEnum(Role).default(Role.USER),
      name: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({ where: { email: input.email } })
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Email already registered" })

      const existingInvite = await ctx.db.invite.findFirst({
        where: { email: input.email, acceptedAt: null, expiresAt: { gt: new Date() } },
      })
      if (existingInvite) throw new TRPCError({ code: "CONFLICT", message: "Active invite exists" })

      const token = crypto.randomBytes(32).toString("hex")
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      const invite = await ctx.db.invite.create({
        data: { email: input.email, tokenHash, role: input.role, expiresAt, createdById: ctx.session.user.id },
      })

      await sendInviteEmail({
        to: input.email,
        name: input.name,
        inviteUrl: `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`,
        expiresAt,
      })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "invite.create",
        targetType: "Invite",
        targetId: invite.id,
        meta: { email: input.email, role: input.role },
        ip: ctx.ip,
      })

      return { inviteId: invite.id }
    }),

  accept: publicProcedure
    .input(z.object({
      token: z.string(),
      name: z.string().min(1),
      password: z.string().min(8).regex(/^(?=.*[A-Z])(?=.*[0-9])/, "Must contain uppercase and number"),
    }))
    .mutation(async ({ ctx, input }) => {
      const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex")
      const invite = await ctx.db.invite.findUnique({ where: { tokenHash } })

      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired invite" })
      }

      const passwordHash = await bcrypt.hash(input.password, 12)

      const defaultQuota = await ctx.db.setting.findUnique({ where: { key: "quota.defaultMinutes" } })
      const quotaMinutes = typeof defaultQuota?.value === "number" ? defaultQuota.value : 60

      const user = await ctx.db.user.create({
        data: {
          email: invite.email,
          name: input.name,
          passwordHash,
          role: invite.role,
          quotaMinutes,
        },
      })

      await ctx.db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })

      await ctx.audit({
        actorId: user.id,
        action: "invite.accept",
        targetType: "Invite",
        targetId: invite.id,
        ip: ctx.ip,
      })

      return { userId: user.id }
    }),

  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.invite.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { createdBy: { select: { name: true, email: true } } },
    })
  }),

  revoke: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.invite.update({
        where: { id: input.id },
        data: { expiresAt: new Date() },
      })
      await ctx.audit({ actorId: ctx.session.user.id, action: "invite.revoke", targetType: "Invite", targetId: input.id })
    }),

  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex")
      const invite = await ctx.db.invite.findUnique({ where: { tokenHash } })
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        return { valid: false, email: null }
      }
      return { valid: true, email: invite.email }
    }),
})
