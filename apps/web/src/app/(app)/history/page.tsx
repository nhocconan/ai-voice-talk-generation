import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { GenerationHistoryList } from "@/components/features/generate/GenerationHistoryList";

export const metadata = { title: "History — YouNet Voice Studio" };

export default async function HistoryPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          Generation History
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          All your generated presentations, podcasts and re-voiced files
        </p>
      </div>
      <GenerationHistoryList />
    </div>
  );
}
