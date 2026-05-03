import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { RevoiceGenerator } from "@/components/features/generate/RevoiceGenerator";
import { FeatureGate } from "@/components/features/FeatureGate";
import { InstructionCard } from "@/components/features/InstructionCard";

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
      <InstructionCard
        title="How it works"
        steps={[
          "Upload the source audio (the original recording you want to re-voice).",
          "The system transcribes and diarizes it, producing a speaker-labeled timed script.",
          "Assign a voice profile to each detected speaker.",
          "Click Re-voice — the new audio preserves timing while swapping the voices.",
        ]}
      />
      <FeatureGate featureId="generate.revoice">
        <RevoiceGenerator />
      </FeatureGate>
    </div>
  );
}
