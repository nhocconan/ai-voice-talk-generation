import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"
import { TRPCProvider } from "@/lib/trpc/provider"
import { ThemeProvider } from "@/components/features/shell/ThemeProvider"
import "@/styles/globals.css"

export const metadata: Metadata = {
  applicationName: "Voice Studio",
  title: { default: "Voice Studio", template: "%s | Voice Studio" },
  description: "Voice cloning and AI-powered podcast & presentation generator for Demo leadership",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/voice-studio-icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
}

// Runs before first paint to set the theme class, avoiding a flash of the wrong
// theme on load. Keep the storage key in sync with THEME_STORAGE_KEY.
const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('vs-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <TRPCProvider>{children}</TRPCProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
