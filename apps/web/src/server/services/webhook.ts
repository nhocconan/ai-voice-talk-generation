/**
 * P4-04: Outbound webhook — fires on generation DONE or FAILED.
 * Webhook URL is stored in Setting key `webhook.url`.
 * Payload is a JSON object compatible with both Slack incoming webhooks
 * and Microsoft Teams Incoming Webhook connectors.
 */

import { db } from "@/server/db/client"

export interface WebhookPayload {
  event: "generation.done" | "generation.failed"
  generationId: string
  kind: string
  status: string
  userId: string
  durationMs?: number | null
  errorMessage?: string | null
  mp3Key?: string | null
  finishedAt?: string | null
}

async function getWebhookUrl(): Promise<string | null> {
  const setting = await db.setting.findUnique({ where: { key: "webhook.url" } })
  if (!setting?.value || typeof setting.value !== "string") return null
  return setting.value
}

function buildSlackBody(payload: WebhookPayload): object {
  const emoji = payload.event === "generation.done" ? "✅" : "❌"
  const title = payload.event === "generation.done"
    ? `${emoji} Generation complete`
    : `${emoji} Generation failed`

  const fields = [
    { title: "ID", value: payload.generationId, short: true },
    { title: "Kind", value: payload.kind, short: true },
    { title: "User", value: payload.userId, short: true },
    ...(payload.durationMs ? [{ title: "Duration", value: `${Math.round(payload.durationMs / 1000)}s`, short: true }] : []),
    ...(payload.errorMessage ? [{ title: "Error", value: payload.errorMessage, short: false }] : []),
  ]

  // Slack format
  return {
    text: title,
    attachments: [{
      color: payload.event === "generation.done" ? "good" : "danger",
      fields,
      footer: "YouNet Voice Studio",
      ts: Math.floor(Date.now() / 1000),
    }],
    // Teams Adaptive Card fallback (Teams ignores unknown fields)
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: title,
    themeColor: payload.event === "generation.done" ? "00b894" : "d63031",
    sections: [{
      activityTitle: title,
      facts: fields.map((f) => ({ name: f.title, value: f.value })),
    }],
  }
}

export async function fireWebhook(payload: WebhookPayload): Promise<void> {
  const url = await getWebhookUrl()
  if (!url) return

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSlackBody(payload)),
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) {
      console.warn(`[webhook] POST ${url} returned ${resp.status}`)
    }
  } catch (err) {
    console.warn("[webhook] delivery failed:", (err as Error).message)
  }
}
