import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import Image from "next/image"
import { LoginForm } from "@/components/features/auth/LoginForm"
import { getRecaptchaPublicConfig } from "@/server/services/recaptcha"

export const metadata: Metadata = { title: "Sign In" }

export default async function LoginPage() {
  const t = await getTranslations("auth")
  const recaptcha = await getRecaptchaPublicConfig()
  return (
    <main className="min-h-screen bg-[var(--color-surface-1)] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        {/* Logo mark */}
        <div className="text-center mb-8">
          <Image
            src="/brand/voice-studio-icon.png"
            alt=""
            width={76}
            height={76}
            priority
            className="mx-auto mb-4 rounded-[20px]"
          />
          <h1 className="text-display-section text-[var(--color-text-primary)]">
            Demo<br />
            <span style={{ color: "var(--color-accent)" }}>Voice Studio</span>
          </h1>
          <p className="text-caption text-[var(--color-text-muted)] mt-2">{t("signInSubtitle")}</p>
        </div>

        {/* Card */}
        <div
          className="bg-[var(--color-surface-0)] p-8 rounded-[var(--radius-card)]"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <LoginForm
            recaptcha={
              recaptcha.enabled && recaptcha.siteKey
                ? { siteKey: recaptcha.siteKey, version: recaptcha.version }
                : null
            }
          />
        </div>
      </div>
    </main>
  )
}
