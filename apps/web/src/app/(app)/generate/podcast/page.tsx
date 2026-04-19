import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { PodcastGenerator } from "@/components/features/generate/PodcastGenerator";

export const metadata = { title: "Generate Podcast — YouNet Voice Studio" };

export default async function PodcastPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          Generate Podcast
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Create a two-speaker podcast from a timed script
        </p>
      </div>
      <PodcastGenerator />
    </div>
  );
}
