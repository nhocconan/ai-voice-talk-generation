import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { TRPCProvider } from "@/lib/trpc/provider"
import "@/styles/globals.css"

export const metadata: Metadata = {
  title: { default: "Voice Studio", template: "%s | Voice Studio" },
  description: "Voice cloning and AI-powered podcast & presentation generator for Demo leadership",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>
          <TRPCProvider>{children}</TRPCProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
