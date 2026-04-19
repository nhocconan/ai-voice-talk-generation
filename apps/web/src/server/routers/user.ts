import { z } from "zod"
import bcrypt from "bcryptjs"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure } from "@/server/trpc"

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUniqueOrThrow({
      where: { id: ctx.session.user.id },
      select: { id: true, email: true, name: true, role: true, quotaMinutes: true, usedMinutes: true, forcePasswordChange: true, lastLoginAt: true },
    })
    return user
  }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1).optional(),
      newPassword: z.string().min(8).regex(/^(?=.*[A-Z])(?=.*[0-9])/, "Must contain uppercase and number"),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.session.user.id } })
      if (!user.forcePasswordChange) {
        if (!input.currentPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Current password required" })
        }

        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash)
        if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Current password incorrect" })
      }

      const hash = await bcrypt.hash(input.newPassword, 12)
      await ctx.db.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, forcePasswordChange: false },
      })

      await ctx.audit({
        actorId: user.id,
        action: "user.changePassword",
        targetType: "User",
        targetId: user.id,
        ...(ctx.ip ? { ip: ctx.ip } : {}),
      })
    }),
})
