import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { RevoiceGenerator } from "@/components/features/generate/RevoiceGenerator";
import { FeatureGate } from "@/components/features/FeatureGate";
import { InstructionCard } from "@/components/features/InstructionCard";

export const metadata = { title: "Re-voice — Voice Studio" };

export default async function RevoicePage() {
  const session = await auth();
  if (!session) redirect("/login");
  const t = await getTranslations("generateHub");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          {t("revoiceTitle")}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t("revoiceSubtitle")}
        </p>
      </div>
      <InstructionCard title={t("howItWorks")} steps={t.raw("revoiceSteps") as string[]} />
      <FeatureGate featureId="generate.revoice">
        <RevoiceGenerator />
      </FeatureGate>
    </div>
  );
}
