import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { TRPCProvider } from "@/lib/trpc/provider"
import "@/styles/globals.css"

export const metadata: Metadata = {
  title: { default: "YouNet Voice Studio", template: "%s | YouNet Voice Studio" },
  description: "Voice cloning and AI-powered podcast & presentation generator for YouNet leadership",
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
