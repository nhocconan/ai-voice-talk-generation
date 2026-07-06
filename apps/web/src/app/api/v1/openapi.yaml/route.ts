/**
 * W-11: GET /api/v1/openapi.yaml — serves the OpenAPI 3.1 spec for the mobile API.
 * Source of truth: apps/web/openapi/openapi.yaml (validated in CI, see
 * scripts/check-openapi.mjs). Public so tooling / Swagger UI can fetch it.
 */
import { readFileSync } from "fs"
import { join } from "path"

let cached: string | undefined

function loadSpec(): string {
  cached ??= readFileSync(join(process.cwd(), "openapi", "openapi.yaml"), "utf8")
  return cached
}

export function GET() {
  try {
    return new Response(loadSpec(), {
      headers: { "Content-Type": "application/yaml; charset=utf-8", "Cache-Control": "public, max-age=300" },
    })
  } catch {
    return new Response("OpenAPI spec not found", { status: 404 })
  }
}
