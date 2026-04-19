import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import enMessages from "../../../../messages/en.json"
import viMessages from "../../../../messages/vi.json"

const MESSAGES = {
  en: enMessages,
  vi: viMessages,
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
