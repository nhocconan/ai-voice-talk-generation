import type { Metadata } from "next"
import { VoiceProfileDetail } from "@/components/features/voice/VoiceProfileDetail"

export const metadata: Metadata = { title: "Voice Profile" }

export default async function VoiceProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <VoiceProfileDetail profileId={id} />
}
