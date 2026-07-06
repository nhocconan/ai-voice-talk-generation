#!/usr/bin/env node
/**
 * W-11: dependency-free CI validation for openapi/openapi.yaml.
 * Checks the spec exists, declares OpenAPI 3.1, has the required top-level
 * sections, defines at least one path, and that every internal `$ref` target
 * ("#/components/<kind>/<name>") is actually defined in the file. Exits non-zero
 * on any failure so it can gate CI. Run: `node scripts/check-openapi.mjs`.
 */
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const here = dirname(fileURLToPath(import.meta.url))
const specPath = join(here, "..", "openapi", "openapi.yaml")

let text
try {
  text = readFileSync(specPath, "utf8")
} catch {
  console.error(`[openapi] spec not found at ${specPath}`)
  process.exit(1)
}

const errors = []
if (!/^openapi:\s*3\.1\./m.test(text)) errors.push("missing or non-3.1 `openapi:` version")
for (const key of ["info:", "paths:", "components:"]) {
  if (!new RegExp(`^${key}`, "m").test(text)) errors.push(`missing top-level \`${key}\``)
}

// Count paths (top-level entries under `paths:` are indented by two spaces).
const pathsBlock = text.split(/^paths:\s*$/m)[1]?.split(/^components:\s*$/m)[0] ?? ""
const pathCount = (pathsBlock.match(/^ {2}\/\S/gm) ?? []).length
if (pathCount === 0) errors.push("no paths defined")

// Every internal $ref target must be defined somewhere in the file.
const refs = [...text.matchAll(/\$ref:\s*["']#\/([^"']+)["']/g)].map((m) => m[1])
for (const ref of new Set(refs)) {
  const name = ref.split("/").pop()
  // The referenced anchor appears as `<name>:` at the definition site.
  if (!new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`, "m").test(text)) {
    errors.push(`unresolved $ref: #/${ref}`)
  }
}

if (errors.length) {
  console.error("[openapi] validation FAILED:")
  for (const e of errors) console.error("  - " + e)
  process.exit(1)
}
console.log(`[openapi] OK — 3.1 spec, ${pathCount} paths, ${new Set(refs).size} refs resolved.`)
