import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { PodcastGenerator } from "@/components/features/generate/PodcastGenerator";
import { FeatureGate } from "@/components/features/FeatureGate";
import { InstructionCard } from "@/components/features/InstructionCard";

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
      <InstructionCard
        title="How it works"
        steps={[
          "Assign a voice profile to each speaker (A and B).",
          "Provide a timed script: one line per turn, prefixed with [A] or [B]. Optionally include (mm:ss) timestamps.",
          "If you have a transcript instead, use Transcript → Timed Script (Gemini required) to auto-format it.",
          "Pacing-lock is applied automatically per segment (±5%) when Gemini is available.",
          "Click Generate — chapters and speaker splits are embedded in the final MP3.",
        ]}
      />
      <FeatureGate featureId="generate.podcast">
        <PodcastGenerator />
      </FeatureGate>
    </div>
  );
}
