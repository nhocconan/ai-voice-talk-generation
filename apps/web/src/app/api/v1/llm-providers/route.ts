/**
 * W-08: GET /api/v1/llm-providers — enabled LLM providers with their enabled LLM
 * models, for the "Draft with AI" picker. Mirrors generation.listLlmProviders.
 * No secrets/config in the payload. See docs/ios/02-API-CONTRACT.md §8.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { apiOk, authenticate, isAuthError } from "@/server/api/rest"
import { LLM_PROVIDER_NAMES } from "@/server/routers/generation"

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth

  const providers = await db.providerConfig.findMany({
    where: {
      enabled: true,
      name: { in: LLM_PROVIDER_NAMES },
      models: { some: { kind: "LLM", enabled: true } },
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      models: {
        where: { kind: "LLM", enabled: true },
        orderBy: [{ isDefault: "desc" }, { modelId: "asc" }],
        select: { id: true, modelId: true, displayName: true, isDefault: true },
      },
    },
  })
  return apiOk({ providers })
}
