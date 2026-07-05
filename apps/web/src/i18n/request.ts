import { getRequestConfig } from "next-intl/server"
import type { AbstractIntlMessages } from "next-intl"
import { cookies } from "next/headers"
import enMessages from "../../../../messages/en.json"
import viMessages from "../../../../messages/vi.json"

// Cast because message catalogs contain list values (e.g. instruction steps as
// arrays), which next-intl supports at runtime via `t.raw` but its strict
// `AbstractIntlMessages` type disallows.
const MESSAGES: Record<"en" | "vi", AbstractIntlMessages> = {
  en: enMessages as unknown as AbstractIntlMessages,
  vi: viMessages as unknown as AbstractIntlMessages,
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = cookieStore.get("locale")?.value
  const resolvedLocale = locale === "en" ? "en" : "vi"

  return {
    locale: resolvedLocale,
    messages: MESSAGES[resolvedLocale],
  }
})
