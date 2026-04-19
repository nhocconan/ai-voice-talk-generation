import { Resend } from "resend"
import { env } from "@/env"
import { logger } from "@/lib/logger"

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

interface InviteEmailParams {
  to: string
  name: string
  inviteUrl: string
  expiresAt: Date
}

export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  if (!resend) {
    logger.warn({ to: params.to, inviteUrl: params.inviteUrl }, "Email not configured — invite URL logged only")
    return
  }

  await resend.emails.send({
    from: "Voice Studio <no-reply@demo.demo>",
    to: params.to,
    subject: "You're invited to Voice Studio",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #000;">
        <h1 style="font-size: 24px; font-weight: 300; margin-bottom: 16px;">Voice Studio</h1>
        <p>Hi ${params.name},</p>
        <p>You've been invited to join <strong>Voice Studio</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${params.inviteUrl}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; display: inline-block;">
            Accept Invite
          </a>
        </p>
        <p style="color: #777169; font-size: 14px;">This invite expires on ${params.expiresAt.toLocaleDateString()}.</p>
      </div>
    `,
  })
}

interface PasswordResetEmailParams {
  to: string
  resetUrl: string
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  if (!resend) {
    logger.warn({ to: params.to, resetUrl: params.resetUrl }, "Email not configured — reset URL logged only")
    return
  }

  await resend.emails.send({
    from: "Voice Studio <no-reply@demo.demo>",
    to: params.to,
    subject: "Password Reset — Voice Studio",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #000;">
        <h1 style="font-size: 24px; font-weight: 300; margin-bottom: 16px;">Voice Studio</h1>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <p style="margin: 24px 0;">
          <a href="${params.resetUrl}" style="background: #000; color: #fff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; display: inline-block;">
            Reset Password
          </a>
        </p>
      </div>
    `,
  })
}
