import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { RevoiceGenerator } from "@/components/features/generate/RevoiceGenerator";

export const metadata = { title: "Re-voice — YouNet Voice Studio" };

export default async function RevoicePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          Re-voice Audio
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Replace voices in existing audio with cloned voice profiles
        </p>
      </div>
      <RevoiceGenerator />
    </div>
  );
}
