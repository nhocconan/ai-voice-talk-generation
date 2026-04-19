import type { Metadata } from "next"
import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { VoiceProfileList } from "@/components/features/voice/VoiceProfileList"

export const metadata: Metadata = { title: "Voice Profiles" }

export default function VoicesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-card">Voice Profiles</h1>
          <p className="text-body text-[var(--color-text-secondary)] mt-1">
            Enroll your voice to generate audio in your style.
          </p>
        </div>
        <Link
          href="/app/voices/new"
          className="flex items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button hover:opacity-90 transition-opacity"
        >
          <PlusIcon size={15} />
          New Profile
        </Link>
      </div>
      <VoiceProfileList />
    </div>
  )
}
