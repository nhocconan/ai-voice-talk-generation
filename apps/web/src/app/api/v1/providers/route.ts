/**
 * W-08: GET /api/v1/providers — enabled TTS providers + defaultProviderId.
 * Mirrors generation.listAvailableProviders (LLM providers excluded). No secrets
 * or raw config in the payload. See docs/ios/02-API-CONTRACT.md §8.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { apiOk, authenticate, isAuthError } from "@/server/api/rest"
import { LLM_PROVIDER_NAMES } from "@/server/routers/generation"

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth

  const providers = await db.providerConfig.findMany({
    where: { enabled: true, name: { notIn: LLM_PROVIDER_NAMES } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  })
  const defaultProviderId = providers.find((p) => p.isDefault)?.id ?? providers[0]?.id ?? null
  return apiOk({ providers, defaultProviderId })
}
