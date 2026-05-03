#!/usr/bin/env tsx
/**
 * P3-11: i18n parity check — verifies en.json and vi.json have the same keys.
 * Exits 1 if keys are missing in either catalog.
 */

import { readFileSync } from "fs"
import { resolve } from "path"

const ROOT = resolve(__dirname, "../../messages")

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flatKeys(v as Record<string, unknown>, full))
    } else {
      keys.push(full)
    }
  }
  return keys
}

function loadMessages(locale: string): Record<string, unknown> {
  const path = resolve(ROOT, `${locale}.json`)
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
}

const en = loadMessages("en")
const vi = loadMessages("vi")

const enKeys = new Set(flatKeys(en))
const viKeys = new Set(flatKeys(vi))

const missingInVi = [...enKeys].filter((k) => !viKeys.has(k))
const missingInEn = [...viKeys].filter((k) => !enKeys.has(k))

let hasError = false

if (missingInVi.length > 0) {
  console.error(`\n[i18n-parity] ${missingInVi.length} key(s) present in en.json but MISSING in vi.json:`)
  missingInVi.forEach((k) => console.error(`  - ${k}`))
  hasError = true
}

if (missingInEn.length > 0) {
  console.error(`\n[i18n-parity] ${missingInEn.length} key(s) present in vi.json but MISSING in en.json:`)
  missingInEn.forEach((k) => console.error(`  - ${k}`))
  hasError = true
}

if (!hasError) {
  console.log(`[i18n-parity] OK — ${enKeys.size} keys in parity across en and vi catalogs`)
} else {
  process.exit(1)
}
