import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GenerationHistoryList } from "@/components/features/generate/GenerationHistoryList";

export const metadata = { title: "History — Voice Studio" };

export default async function HistoryPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const t = await getTranslations("history");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          {t("pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {t("pageSubtitle")}
        </p>
      </div>
      <GenerationHistoryList />
    </div>
  );
}
