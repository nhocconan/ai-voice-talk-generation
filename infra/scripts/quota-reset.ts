#!/usr/bin/env tsx
/**
 * Monthly quota reset — resets usedMinutes to 0 for all active users and sends
 * a summary email via Resend (if RESEND_API_KEY is set).
 *
 * Intended to run at 00:05 UTC on day 1 of each month via cron:
 *   5 0 1 * * tsx /opt/scripts/quota-reset.ts
 *
 * Required env: DATABASE_URL
 * Optional env: RESEND_API_KEY, RESEND_FROM_EMAIL
 */

import { PrismaClient, Prisma } from "@prisma/client"

const db = new PrismaClient()

async function sendUsageSummary(users: { email: string; name: string | null; usedMinutes: number; quotaMinutes: number }[]) {
  const apiKey = process.env["RESEND_API_KEY"]
  const from = process.env["RESEND_FROM_EMAIL"] ?? "noreply@younetgroup.com"

  if (!apiKey) {
    console.log("[quota-reset] RESEND_API_KEY not set — skipping emails")
    return
  }

  for (const user of users) {
    const used = user.usedMinutes
    const quota = user.quotaMinutes
    const pct = quota > 0 ? Math.round((used / quota) * 100) : 0

    const body = {
      from,
      to: [user.email],
      subject: "YouNet Voice Studio — Monthly Usage Summary",
      html: `
        <p>Hi ${user.name ?? user.email},</p>
        <p>Here is your voice generation usage summary for last month:</p>
        <ul>
          <li>Used: <strong>${used} minutes</strong></li>
          <li>Quota: <strong>${quota} minutes</strong></li>
          <li>Usage: <strong>${pct}%</strong></li>
        </ul>
        <p>Your quota has been reset for the new month. You have ${quota} minutes available.</p>
        <p>— YouNet Voice Studio</p>
      `,
    }

    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        console.error(`[quota-reset] email to ${user.email} failed: ${resp.status}`)
      } else {
        console.log(`[quota-reset] sent summary to ${user.email}`)
      }
    } catch (err) {
      console.error(`[quota-reset] email error for ${user.email}:`, err)
    }
  }
}

async function main() {
  console.log(`[quota-reset] starting at ${new Date().toISOString()}`)

  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, email: true, name: true, usedMinutes: true, quotaMinutes: true },
  })

  console.log(`[quota-reset] resetting ${users.length} active user(s)`)

  await sendUsageSummary(users)

  const { count } = await db.user.updateMany({
    where: { active: true },
    data: { usedMinutes: 0 },
  })

  console.log(`[quota-reset] reset ${count} user(s)`)

  await db.auditLog.create({
    data: {
      action: "quota.monthlyReset",
      targetType: "User",
      targetId: "all",
      meta: { count, month: new Date().toISOString().slice(0, 7) } as Prisma.InputJsonValue,
    },
  })

  console.log("[quota-reset] done")
}

main()
  .catch((err) => {
    console.error("[quota-reset] fatal:", err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
