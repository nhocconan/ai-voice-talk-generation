import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { VideoRevoiceGenerator } from "@/components/features/generate/VideoRevoiceGenerator";
import { FeatureGate } from "@/components/features/FeatureGate";
import { InstructionCard } from "@/components/features/InstructionCard";

export const metadata = { title: "Video Re-voice — Voice Studio" };

export default async function VideoRevoicePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          Re-voice Video
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Replace voices in a podcast video (e.g. NotebookLM Audio Overviews exported as MP4)
          with your cloned voices, preserving timing and optionally burning captions.
        </p>
      </div>
      <InstructionCard
        title="How it works"
        steps={[
          "Upload the source video. The original audio track will be replaced.",
          "Assign a voice profile to each speaker in the video (A and B).",
          "Paste a timed transcript — you can refine the diarized output from the audio re-voice flow.",
          "Optionally burn captions; the final MP4 preserves the original video frames.",
        ]}
      />
      <FeatureGate featureId="generate.video-revoice">
        <VideoRevoiceGenerator />
      </FeatureGate>
    </div>
  );
}
