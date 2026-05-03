import { z } from "zod"
import { TRPCError } from "@trpc/server"
import crypto from "crypto"
import bcrypt from "bcryptjs"
import { router, publicProcedure } from "@/server/trpc"
import { sendPasswordResetEmail } from "@/server/services/email"
import { env } from "@/env"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"

const RESET_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

export const authRouter = router({
  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      // Always return success to avoid email enumeration
      const user = await db.user.findUnique({ where: { email: input.email } })
      if (!user || !user.active) return { ok: true }

      // Invalidate previous tokens for this email
      await db.passwordResetToken.updateMany({
        where: { email: input.email, usedAt: null },
        data: { usedAt: new Date() },
      })

      const token = crypto.randomBytes(32).toString("hex")
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex")
      const expiresAt = new Date(Date.now() + RESET_EXPIRY_MS)

      await db.passwordResetToken.create({ data: { email: input.email, tokenHash, expiresAt } })

      const resetUrl = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`
      await sendPasswordResetEmail({ to: input.email, resetUrl })

      return { ok: true }
    }),

  resetPassword: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      password: z.string().min(8).regex(/[A-Z]/, "Must contain uppercase").regex(/[0-9]/, "Must contain digit"),
    }))
    .mutation(async ({ input }) => {
      const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex")

      const record = await db.passwordResetToken.findUnique({ where: { tokenHash } })
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired reset link" })
      }

      const user = await db.user.findUnique({ where: { email: record.email } })
      if (!user || !user.active) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" })
      }

      const passwordHash = await bcrypt.hash(input.password, 12)
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash, forcePasswordChange: false },
      })

      await db.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } })

      await writeAuditLog({
        actorId: user.id,
        action: "auth.password_reset",
        targetType: "User",
        targetId: user.id,
      })

      return { ok: true }
    }),
})
