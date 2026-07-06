/**
 * W-12: Voice-cloning consent (AUP) text, shown before a user enrolls a voice.
 * A per-clone snapshot of this text is stored immutably in VoiceProfile.consent
 * at create time (with signer id/IP/UA/timestamp). Bump `version` when the text
 * changes so stored records remain auditable against the exact wording shown.
 */
export const CONSENT_VERSION = 1

export const CONSENT_AUP = {
  en:
    "I confirm that I am the person whose voice is being cloned, or I have that " +
    "person's explicit permission to create and use a synthetic voice from these " +
    "recordings. I understand this voice will be used to generate audio on my " +
    "account, that I must not use it to impersonate anyone, mislead listeners, or " +
    "create unlawful, harmful, or deceptive content, and that misuse may result in " +
    "suspension and deletion of the voice. I may delete this voice profile at any time.",
  vi:
    "Tôi xác nhận tôi là người có giọng nói được nhân bản, hoặc tôi đã được người " +
    "đó cho phép rõ ràng để tạo và sử dụng giọng nói tổng hợp từ các bản ghi này. " +
    "Tôi hiểu giọng nói này sẽ được dùng để tạo audio trên tài khoản của tôi, rằng " +
    "tôi không được dùng nó để mạo danh bất kỳ ai, gây hiểu lầm cho người nghe, hay " +
    "tạo nội dung trái pháp luật, gây hại hoặc lừa dối, và việc lạm dụng có thể dẫn " +
    "đến việc đình chỉ và xoá giọng nói. Tôi có thể xoá hồ sơ giọng này bất cứ lúc nào.",
} as const

export function consentPayload(lang?: string) {
  return {
    version: CONSENT_VERSION,
    text: lang === "en" ? CONSENT_AUP.en : lang === "vi" ? CONSENT_AUP.vi : undefined,
    en: CONSENT_AUP.en,
    vi: CONSENT_AUP.vi,
  }
}
